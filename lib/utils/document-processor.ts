import { createAdminClient } from '@/utils/supabase/admin';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { generateEmbedding } from './embeddings';

/**
 * PRODUCTION-GRADE PDF PROCESSOR
 * 
 * CRITICAL FIX: The 'pdf-parse' library has a bug in its index.js where it 
 * tries to load a test file if 'module.parent' is undefined (common in Next.js).
 * We bypass this by requiring the core logic directly.
 */
export async function processDocumentContent(documentId: string, companyId: string, filePath: string) {
  const adminSupabase = createAdminClient();
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
    const { data, error: downloadError } = await adminSupabase.storage
      .from('company-documents')
      .download(filePath);

    if (downloadError || !data) {
      throw new Error(`Download failed: ${downloadError?.message || 'Empty response'}`);
    }

    // 4. Extract Text
    const buffer = Buffer.from(await data.arrayBuffer());
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
        } catch (e) {
          return null;
        }
      })
    );

    const validChunks = chunkData.filter((c): c is NonNullable<typeof c> => c !== null && c.embedding !== null);

    if (validChunks.length === 0) {
      throw new Error('All embedding calls failed.');
    }

    // 7. Database Save
    console.log(`${LOG_PREFIX} 💾 Saving ${validChunks.length} chunks to Supabase...`);
    const { error: insertError } = await adminSupabase
      .from('document_chunks_internal')
      .insert(validChunks);

    if (insertError) {
      throw new Error(`Database insert failed: ${insertError.message}`);
    }

    console.log(`${LOG_PREFIX} ✅ SUCCESS. Document indexed.`);
  } catch (error: any) {
    console.error(`${LOG_PREFIX} 🚨 PRODUCTION ERROR:`, error.message);
  }
}
