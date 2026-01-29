import { tavily } from '@tavily/core'

// Get Tavily client - read API key from environment when needed
function getTavilyClient() {
  const apiKey = process.env.TAVILY_API_KEY
  
  if (!apiKey) {
    console.warn('TAVILY_API_KEY not found in environment variables')
    return null
  }
  
  return tavily({ apiKey })
}

export interface TavilySearchResult {
  title: string
  url: string
  content: string
  score: number
  published_date?: string
}

export interface TavilySearchResponse {
  query: string
  response_time: number
  results: TavilySearchResult[]
  images?: string[]
  answer?: string
}

/**
 * Search for legal information using Tavily API
 * @param query - Search query string
 * @param searchDepth - Search depth: "basic" | "advanced"
 * @returns Search results with legal information
 */
export async function searchLegalInfo(
  query: string,
  searchDepth: 'basic' | 'advanced' = 'advanced'
): Promise<TavilySearchResponse | null> {
  const client = getTavilyClient()
  
  if (!client) {
    console.error('Tavily client not initialized. Check TAVILY_API_KEY environment variable.')
    return null
  }

  try {
    const response = await client.search(query, {
      searchDepth,
      includeAnswer: true,
      includeImages: false,
      maxResults: 5
    })

      return response as unknown as TavilySearchResponse
  } catch (error: any) {
    console.error('Tavily API error:', error)
    return null
  }
}

/**
 * Extract legal sections and penalty information from search results
 * @param results - Tavily search results
 * @returns Extracted legal information
 */
export function extractLegalInfo(results: TavilySearchResponse | null): {
  legalSection: string
  penaltyProvision: string
} {
  if (!results || !results.results || results.results.length === 0) {
    return {
      legalSection: 'Information not available',
      penaltyProvision: 'Information not available'
    }
  }

  // Try to extract from answer if available
  if (results.answer) {
    const sectionMatch = results.answer.match(/Section\s+[\dA-Z]+(?:\s+of\s+[^\.]+)?/i)
    const penaltyMatch = results.answer.match(/penalty[^\.]*(?:₹|Rs\.?|INR)[^\.]*/i)
    
    if (sectionMatch || penaltyMatch) {
      return {
        legalSection: sectionMatch ? sectionMatch[0] : 'Information not available',
        penaltyProvision: penaltyMatch ? penaltyMatch[0] : 'Information not available'
      }
    }
  }

  // Extract from first result content
  const firstResult = results.results[0]
  const content = firstResult.content || firstResult.title || ''

  // Try to find section numbers
  const sectionPattern = /Section\s+[\dA-Z]+(?:\s+of\s+[^\.\n]+)?/gi
  const sections = content.match(sectionPattern)
  const legalSection = sections && sections.length > 0 
    ? sections[0] 
    : 'Information not available'

  // Try to find penalty information
  const penaltyPattern = /penalty[^\.\n]*(?:₹|Rs\.?|INR|rupees?)[^\.\n]*/gi
  const penalties = content.match(penaltyPattern)
  const penaltyProvision = penalties && penalties.length > 0
    ? penalties[0]
    : 'Information not available'

  return {
    legalSection,
    penaltyProvision
  }
}
