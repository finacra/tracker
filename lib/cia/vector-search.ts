import { generateEmbedding } from '@/lib/utils/embeddings'
import { createAdminClient } from '@/utils/supabase/admin'

export interface SearchResult {
  content: string
  similarity: number
  metadata: Record<string, any>
  documentId: string
}

/**
 * Search document chunks using pgvector cosine similarity.
 * Returns the top-K most relevant chunks for the given query.
 */
export async function searchDocumentChunks(
  query: string,
  companyId: string,
  topK: number = 5
): Promise<SearchResult[]> {
  // Generate embedding for the user query
  const queryEmbedding = await generateEmbedding(query)
  if (!queryEmbedding || queryEmbedding.length === 0) {
    console.warn('[CIA] Could not generate embedding for query')
    return []
  }

  const supabase = createAdminClient()

  // pgvector cosine distance: <=> operator
  // similarity = 1 - cosine_distance
  const embeddingStr = `[${queryEmbedding.join(',')}]`

  const { data, error } = await (supabase as any).rpc('match_document_chunks', {
    query_embedding: embeddingStr,
    match_company_id: companyId,
    match_count: topK,
    match_threshold: 0.3,
  })

  if (error) {
    // Fallback: try raw SQL if RPC doesn't exist yet
    console.warn('[CIA] RPC match_document_chunks not found, using raw query:', error.message)
    return await fallbackVectorSearch(supabase, embeddingStr, companyId, topK)
  }

  return ((data as any[]) || []).map((row: any) => ({
    content: row.content,
    similarity: row.similarity,
    metadata: row.metadata || {},
    documentId: row.document_id,
  }))
}

async function fallbackVectorSearch(
  supabase: any,
  embeddingStr: string,
  companyId: string,
  topK: number
): Promise<SearchResult[]> {
  // Direct query using pgvector operators
  const { data, error } = await supabase
    .from('document_chunks_internal')
    .select('content, metadata, document_id, embedding')
    .eq('company_id', companyId)
    .not('embedding', 'is', null)
    .limit(100) // Fetch more and sort client-side as fallback

  if (error || !data) {
    console.error('[CIA] Fallback vector search failed:', error?.message)
    return []
  }

  // Client-side cosine similarity (fallback when RPC not available)
  const queryVec = embeddingStr.slice(1, -1).split(',').map(Number)

  const scored = data
    .map((row: any) => {
      const chunkVec = Array.isArray(row.embedding)
        ? row.embedding
        : typeof row.embedding === 'string'
          ? JSON.parse(row.embedding)
          : null
      if (!chunkVec) return null
      const sim = cosineSimilarity(queryVec, chunkVec)
      return {
        content: row.content as string,
        similarity: sim,
        metadata: (row.metadata || {}) as Record<string, any>,
        documentId: row.document_id as string,
      }
    })
    .filter((r: any): r is SearchResult => r !== null && r.similarity > 0.3)
    .sort((a: SearchResult, b: SearchResult) => b.similarity - a.similarity)
    .slice(0, topK)

  return scored
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
