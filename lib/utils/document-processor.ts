import 'server-only'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { generateEmbedding } from './embeddings';
import { extractTextWithOCR } from './document-intelligence';
import { createStorageAdapter } from '@/lib/storage/factory';
import { createAdminClient } from '@/utils/supabase/admin';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.heif', '.webp']
const OCR_ONLY_EXTENSIONS = [...IMAGE_EXTENSIONS, '.doc', '.docx']

function getExtension(filePath: string): string {
  return filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
}

/**
 * Document content processor — extracts text, chunks, embeds, and saves to Supabase.
 *
 * Supports:
 *  - Text-based PDFs → pdf-parse
 *  - Scanned/image PDFs → pdf-parse fallback → Azure Document Intelligence OCR
 *  - Images (JPG, PNG, etc.) → Azure Document Intelligence OCR directly
 *  - Word docs (.doc, .docx) → Azure Document Intelligence OCR directly
 */
export async function processDocumentContent(documentId: string, companyId: string, filePath: string) {
  const storage = createStorageAdapter();
  const adminSupabase: any = createAdminClient();
  const LOG_PREFIX = `[AI-Processor][Doc:${documentId.slice(0, 8)}]`;
  const ext = getExtension(filePath);

  console.log(`${LOG_PREFIX} 🚀 Starting processing for ${ext} file...`);

  try {
    // 1. Download from Storage
    console.log(`${LOG_PREFIX} 📥 Downloading: ${filePath}`);
    const buffer = await storage.downloadFile('company-documents', filePath);

    let text = '';

    // 2. Extract text based on file type
    if (OCR_ONLY_EXTENSIONS.includes(ext)) {
      // Images and Word docs → skip pdf-parse, go straight to Azure DI OCR
      console.log(`${LOG_PREFIX} 🖼️ ${ext} file — using Azure Document Intelligence OCR directly...`);
      try {
        text = await extractTextWithOCR(buffer);
        console.log(`${LOG_PREFIX} ✅ OCR extracted ${text.length} characters.`);
      } catch (ocrError: unknown) {
        const msg = ocrError instanceof Error ? ocrError.message : String(ocrError);
        console.error(`${LOG_PREFIX} ❌ OCR failed: ${msg}`);
        return;
      }
    } else {
      // PDF → try pdf-parse first (fast, free), fall back to OCR if it yields nothing
      if (typeof (global as any).DOMMatrix === 'undefined') (global as any).DOMMatrix = class DOMMatrix {};

      let parseAction: any;
      try {
        parseAction = require('pdf-parse/lib/pdf-parse.js');
      } catch {
        parseAction = require('pdf-parse');
      }

      console.log(`${LOG_PREFIX} 📄 Extracting text from PDF (${buffer.length} bytes)...`);
      const actualParser = typeof parseAction === 'function' ? parseAction : (parseAction.default || parseAction);
      const options = {
        pagerender: (pageData: any) =>
          pageData.getTextContent().then((tc: any) => tc.items.map((i: any) => i.str).join(' '))
      };

      const result = await actualParser(buffer, options);
      text = result.text || '';

      // Scanned PDF — fall back to Azure DI OCR
      if (text.trim().length < 100) {
        console.log(`${LOG_PREFIX} 🖼️ Low text yield (${text.trim().length} chars) — falling back to Azure Document Intelligence OCR...`);
        try {
          text = await extractTextWithOCR(buffer);
          console.log(`${LOG_PREFIX} ✅ OCR extracted ${text.length} characters.`);
        } catch (ocrError: unknown) {
          const msg = ocrError instanceof Error ? ocrError.message : String(ocrError);
          console.error(`${LOG_PREFIX} ❌ OCR failed: ${msg}`);
          return;
        }
      }
    }

    if (!text.trim()) {
      console.warn(`${LOG_PREFIX} ⚠️ No text could be extracted from this document.`);
      return;
    }

    console.log(`${LOG_PREFIX} 🔍 ${text.length} characters ready for chunking.`);

    // 3. Chunk
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 800, chunkOverlap: 150 });
    const chunks = await splitter.createDocuments([text]);
    console.log(`${LOG_PREFIX} 🧩 Created ${chunks.length} chunks.`);

    // 4. Embed
    console.log(`${LOG_PREFIX} 🧠 Generating embeddings...`);
    const chunkData = await Promise.all(
      chunks.map(async (chunk, index) => {
        try {
          const embedding = await generateEmbedding(chunk.pageContent);
          return {
            document_id: documentId,
            company_id: companyId,
            content: chunk.pageContent,
            embedding: embedding.length > 0 ? embedding : null,
            metadata: { page: index + 1, source: filePath },
          };
        } catch (e: unknown) {
          console.error(`${LOG_PREFIX} Embedding failed for chunk ${index + 1}:`, e instanceof Error ? e.message : e);
          return null;
        }
      })
    );

    const validChunks = chunkData.filter((c): c is NonNullable<typeof c> => c !== null && c.embedding !== null);

    if (validChunks.length === 0) {
      throw new Error(`All ${chunks.length} embedding calls failed.`);
    }

    console.log(`${LOG_PREFIX} ${validChunks.length}/${chunks.length} chunks embedded.`);

    // 5. Save to DB
    console.log(`${LOG_PREFIX} 💾 Saving ${validChunks.length} chunks to Supabase...`);
    const { error: insertError } = await adminSupabase
      .from('document_chunks_internal')
      .insert(validChunks);

    if (insertError) throw new Error(`Database insert failed: ${insertError.message}`);

    console.log(`${LOG_PREFIX} ✅ SUCCESS. Document indexed.`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} 🚨 Processing failed: ${message}`);
    throw error;
  }
}
