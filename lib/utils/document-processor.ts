import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { generateEmbedding } from './embeddings';
import { createStorageAdapter } from '@/lib/storage/factory';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * PRODUCTION-GRADE PDF PROCESSOR
 * 
 * CRITICAL FIX: The 'pdf-parse' library has a bug in its index.js where it 
 * tries to load a test file if 'module.parent' is undefined (common in Next.js).
 * We bypass this by requiring the core logic directly.
 */
export async function processDocumentContent(documentId: string, companyId: string, filePath: string) {
  const storage = createStorageAdapter();
  const adminSupabase: any = createAdminClient();
  const LOG_PREFIX = `[AI-Processor][Doc:${documentId.slice(0, 8)}]`;
  
  console.log(`${LOG_PREFIX} 🚀 Starting high-priority processing...`);

  try {
    // 1. Critical Shims for the PDF.js engine
    if (typeof (global as any).DOMMatrix === 'undefined') (global as any).DOMMatrix = class DOMMatrix {};

    // 2. BYPASS BROKEN INDEX.JS
    // We go directly to the library's core to avoid the 'isDebugMode' bug in their index.js
    let parseAction: any;
    try {
      // This path skips the code that looks for './test/data/05-versions-space.pdf'
      parseAction = require('pdf-parse/lib/pdf-parse.js');
    } catch (e) {
      console.error(`${LOG_PREFIX} 🚨 Failed to load core parser, falling back to main...`);
      parseAction = require('pdf-parse');
    }

    // 3. Download from Storage
    console.log(`${LOG_PREFIX} 📥 Downloading from Storage: ${filePath}`);
    const buffer = await storage.downloadFile('company-documents', filePath);

    // 4. Extract Text
    console.log(`${LOG_PREFIX} 📄 Extracting text from ${buffer.length} bytes...`);
    
    // Ensure we have a function
    const actualParser = typeof parseAction === 'function' ? parseAction : (parseAction.default || parseAction);

    const options = {
      pagerender: (pageData: any) => {
        return pageData.getTextContent().then((textContent: any) => {
          return textContent.items.map((item: any) => item.str).join(' ');
        });
      }
    };

    const result = await actualParser(buffer, options);
    const text = result.text || '';

    if (!text.trim()) {
      console.warn(`${LOG_PREFIX} ⚠️ No text extracted.`);
      return;
    }

    console.log(`${LOG_PREFIX} 🔍 Extracted ${text.length} characters.`);

    // 5. Chunking Strategy
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800, 
      chunkOverlap: 150,
    });

    const chunks = await splitter.createDocuments([text]);
    console.log(`${LOG_PREFIX} 🧩 Created ${chunks.length} semantic chunks.`);

    // 6. Embedding Generation
    console.log(`${LOG_PREFIX} 🧠 Generating embeddings for ${chunks.length} chunks...`);
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
      throw new Error(`All ${chunks.length} embedding calls failed — document indexed without AI chunks.`);
    }

    console.log(`${LOG_PREFIX} ${validChunks.length}/${chunks.length} chunks embedded successfully.`);

    // 7. Database Save
    console.log(`${LOG_PREFIX} 💾 Saving ${validChunks.length} chunks to Supabase...`);
    const { error: insertError } = await adminSupabase
      .from('document_chunks_internal')
      .insert(validChunks);

    if (insertError) {
      throw new Error(`Database insert failed: ${insertError.message}`);
    }

    console.log(`${LOG_PREFIX} ✅ SUCCESS. Document indexed.`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} 🚨 Processing failed: ${message}`);
    throw error; // Re-throw so the caller's .catch() handler is informed
  }
}
