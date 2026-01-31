import { RegulatoryRequirement } from '@/app/data-room/actions'
import { searchLegalInfo, extractLegalInfo } from '@/lib/api/tavily'
import { generateBatchBusinessImpact, generateBusinessImpact, type BatchImpactItem, BusinessImpact } from '@/lib/api/openai'
import { createAdminClient } from '@/utils/supabase/admin'

export interface EnrichedComplianceData {
  requirementId: string
  legalSection: string
  penaltyProvision: string
  exactPenalty: string
  businessImpact: BusinessImpact
}

type LegalCacheRow = {
  cache_key: string
  template_id: string | null
  query: string
  jurisdiction: string
  legal_section: string | null
  penalty_provision: string | null
  sources: string[] | null
  answer_json: any | null
  expires_at: string | null
  updated_at: string
}

type UniqueComplianceKey = {
  cacheKey: string
  templateId: string | null
  category: string
  requirement: string
}

function normalizeKeyPart(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-\/]/g, '') // keep words, spaces, dash, slash
    .trim()
}

function buildUniqueKey(req: RegulatoryRequirement): UniqueComplianceKey {
  const templateId = (req as any).template_id ?? null
  if (templateId) {
    return {
      cacheKey: `template:${templateId}`,
      templateId,
      category: req.category,
      requirement: req.requirement,
    }
  }

  // Fallback: stable normalized key (no period/month specific bits should be in requirement anyway,
  // but we keep it robust)
  const category = normalizeKeyPart(req.category)
  const requirement = normalizeKeyPart(req.requirement)
  return {
    cacheKey: `text:${category}|${requirement}`,
    templateId: null,
    category: req.category,
    requirement: req.requirement,
  }
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  const t = new Date(expiresAt).getTime()
  return Number.isFinite(t) ? t <= Date.now() : false
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length) as any
  let idx = 0

  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (idx < tasks.length) {
      const current = idx++
      results[current] = await tasks[current]()
    }
  })

  await Promise.all(workers)
  return results
}

/**
 * Map compliance category to legal framework for better search queries
 */
function mapCategoryToLegalFramework(category: string): string {
  const mapping: Record<string, string> = {
    'Income Tax': 'Income Tax Act',
    'GST': 'GST Act',
    'RoC': 'Companies Act',
    'MCA': 'Companies Act',
    'Payroll': 'Labour Act',
    'Renewals': 'Regulatory',
    'Others': 'Regulatory'
  }

  return mapping[category] || 'Regulatory'
}

/**
 * Build search query for Tavily based on compliance requirement
 */
function buildSearchQuery(category: string, requirement: string, legalFramework: string): string {
  const baseQuery = `${legalFramework} ${requirement} penalty section India`
  
  // Add category-specific keywords
  if (category === 'Income Tax') {
    return `Income Tax Act 1961 ${requirement} penalty late filing section`
  } else if (category === 'GST') {
    return `GST Act 2017 ${requirement} penalty late filing section`
  } else if (category === 'RoC' || category === 'MCA') {
    return `Companies Act 2013 ${requirement} penalty MCA section`
  }
  
  return baseQuery
}

/**
 * Calculate exact penalty amount from penalty string and days delayed
 */
function calculateExactPenalty(penaltyStr: string | null, daysDelayed: number | null): string {
  if (!penaltyStr || daysDelayed === null || daysDelayed <= 0) {
    return 'Not applicable'
  }

  const trimmedPenalty = penaltyStr.trim()

  // Extract daily rate
  const dailyRateMatch = trimmedPenalty.match(/(?:₹|Rs\.?|INR)?[\d,]+(?:\.[\d]+)?\/day/i)
  if (dailyRateMatch) {
    const rateStr = dailyRateMatch[0].replace(/₹|Rs\.?|INR|\/day/gi, '').replace(/,/g, '')
    const dailyRate = parseFloat(rateStr)
    if (!isNaN(dailyRate) && dailyRate > 0) {
      let calculatedPenalty = dailyRate * daysDelayed
      
      // Check for max limit
      const maxMatch = trimmedPenalty.match(/max\s*(?:₹|Rs\.?|INR)?[\d,]+(?:\.[\d]+)?/i)
      if (maxMatch) {
        const maxStr = maxMatch[0].replace(/max\s*(?:₹|Rs\.?|INR)?/gi, '').replace(/,/g, '')
        const maxAmount = parseFloat(maxStr)
        if (!isNaN(maxAmount) && maxAmount > 0) {
          calculatedPenalty = Math.min(calculatedPenalty, maxAmount)
        }
      }
      
      return `₹${calculatedPenalty.toLocaleString('en-IN')}`
    }
  }

  // Check for fixed penalty
  const fixedKeywords = /(?:fixed|one-time|one time|flat|lump)/i
  if (fixedKeywords.test(trimmedPenalty)) {
    const fixedMatch = trimmedPenalty.match(/₹[\d,]+(?:\.[\d]+)?/i)
    if (fixedMatch) {
      return fixedMatch[0]
    }
    const plainNumberMatch = trimmedPenalty.match(/[\d,]+(?:\.[\d]+)?/i)
    if (plainNumberMatch) {
      const amount = plainNumberMatch[0].replace(/,/g, '')
      const numAmount = parseFloat(amount)
      if (!isNaN(numAmount) && numAmount > 0) {
        return `₹${numAmount.toLocaleString('en-IN')}`
      }
    }
  }

  // If penalty is just a plain number, treat as daily rate
  const plainNumberMatch = trimmedPenalty.match(/^[\d,]+(?:\.[\d]+)?$/i)
  if (plainNumberMatch && !trimmedPenalty.includes('/day') && !trimmedPenalty.includes('Interest') && !trimmedPenalty.includes('+')) {
    const amount = plainNumberMatch[0].replace(/,/g, '')
    const numAmount = parseFloat(amount)
    if (!isNaN(numAmount) && numAmount > 0) {
      const calculatedPenalty = numAmount * daysDelayed
      return `₹${calculatedPenalty.toLocaleString('en-IN')}`
    }
  }

  return 'Cannot calculate - Insufficient information'
}

/**
 * Calculate days delayed from due date
 */
function calculateDaysDelayed(dueDateStr: string, status: string): number | null {
  if (status === 'completed' || status === 'upcoming') return null
  
  try {
    const dueDate = new Date(dueDateStr)
    if (isNaN(dueDate.getTime())) return null
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    dueDate.setHours(0, 0, 0, 0)
    
    const diffTime = today.getTime() - dueDate.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    
    return diffDays > 0 ? diffDays : null
  } catch {
    return null
  }
}

/**
 * Enrich a compliance requirement with legal research and business impact analysis
 * @param requirement - The compliance requirement to enrich
 * @param onProgress - Optional callback for progress updates
 * @returns Enriched compliance data or null if enrichment fails
 */
export async function enrichComplianceItem(
  requirement: RegulatoryRequirement,
  onProgress?: (step: string) => void
): Promise<EnrichedComplianceData | null> {
  try {
    onProgress?.('Searching for legal information...')
    
    // Map category to legal framework
    const legalFramework = mapCategoryToLegalFramework(requirement.category)
    const searchQuery = buildSearchQuery(requirement.category, requirement.requirement, legalFramework)
    
    // Search for legal information using Tavily
    const searchResults = await searchLegalInfo(searchQuery, 'advanced')
    
    // Extract legal section and penalty provision
    const { legalSection, penaltyProvision } = extractLegalInfo(searchResults)
    
    // Calculate days delayed and exact penalty
    const daysDelayed = calculateDaysDelayed(requirement.due_date, requirement.status)
    const exactPenalty = calculateExactPenalty(requirement.penalty, daysDelayed)
    
    onProgress?.('Generating business impact analysis...')
    
    // Generate business impact using OpenAI
    const businessImpact = await generateBusinessImpact(
      requirement.requirement,
      requirement.penalty || penaltyProvision,
      legalSection
    )
    
    // If OpenAI fails, use fallback
    const finalBusinessImpact: BusinessImpact = businessImpact || {
      financial: 'Business impact analysis unavailable. Direct financial penalty may apply.',
      reputation: 'Non-compliance may affect company reputation and credit rating.',
      operations: 'May cause operational delays and additional compliance burden.'
    }
    
    return {
      requirementId: requirement.id,
      legalSection: legalSection || 'Information not available',
      penaltyProvision: penaltyProvision || requirement.penalty || 'Information not available',
      exactPenalty: exactPenalty || 'Not applicable',
      businessImpact: finalBusinessImpact
    }
  } catch (error: any) {
    console.error('Error enriching compliance item:', error)
    
    // Return fallback data
    const daysDelayed = calculateDaysDelayed(requirement.due_date, requirement.status)
    const exactPenalty = calculateExactPenalty(requirement.penalty, daysDelayed)
    
    return {
      requirementId: requirement.id,
      legalSection: 'Information not available',
      penaltyProvision: requirement.penalty || 'Information not available',
      exactPenalty: exactPenalty || 'Not applicable',
      businessImpact: {
        financial: 'Enrichment unavailable. Please refer to penalty information above.',
        reputation: 'Enrichment unavailable. Non-compliance may affect reputation.',
        operations: 'Enrichment unavailable. May cause operational disruptions.'
      }
    }
  }
}

/**
 * Enrich multiple compliance requirements
 * @param requirements - Array of compliance requirements to enrich
 * @param onProgress - Optional callback for progress updates
 * @returns Array of enriched compliance data
 */
export async function enrichComplianceItems(
  requirements: RegulatoryRequirement[],
  onProgress?: (current: number, total: number, step: string) => void
): Promise<EnrichedComplianceData[]> {
  const enrichedData: EnrichedComplianceData[] = []
  
  for (let i = 0; i < requirements.length; i++) {
    const requirement = requirements[i]
    onProgress?.(i + 1, requirements.length, `Enriching ${requirement.requirement}...`)
    
    const enriched = await enrichComplianceItem(requirement)
    if (enriched) {
      enrichedData.push(enriched)
    }
    
    // Add small delay to respect rate limits
    if (i < requirements.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  
  return enrichedData
}

/**
 * Optimized enrichment:
 * - De-dupe by template_id (fallback to normalized key)
 * - Shared cache in DB (legal_research_cache)
 * - Hard max Tavily searches per report (default 10)
 * - Parallel Tavily with small concurrency to avoid rate limits
 *
 * NOTE: Business impact is still computed per requirement for now via generateBusinessImpact.
 * Next step will collapse it to a single batch call (see TODO openai-batch-impact).
 */
export async function enrichComplianceItemsOptimized(
  requirements: RegulatoryRequirement[],
  opts?: {
    maxTavilySearches?: number
    tavilyConcurrency?: number
    cacheTtlDays?: number
  }
): Promise<EnrichedComplianceData[]> {
  const maxTavilySearches = Math.max(0, opts?.maxTavilySearches ?? 10)
  const tavilyConcurrency = Math.max(1, opts?.tavilyConcurrency ?? 3)
  const cacheTtlDays = Math.max(1, opts?.cacheTtlDays ?? 60)

  if (!requirements || requirements.length === 0) return []

  const adminSupabase = createAdminClient()

  // Build unique keys map
  const keyToReqs = new Map<string, { key: UniqueComplianceKey; items: RegulatoryRequirement[] }>()
  for (const r of requirements) {
    const key = buildUniqueKey(r)
    const existing = keyToReqs.get(key.cacheKey)
    if (existing) existing.items.push(r)
    else keyToReqs.set(key.cacheKey, { key, items: [r] })
  }

  const uniqueKeys = Array.from(keyToReqs.keys())

  // Fetch cache rows for these keys
  const { data: cacheRows, error: cacheErr } = await adminSupabase
    .from('legal_research_cache')
    .select('cache_key,template_id,query,jurisdiction,legal_section,penalty_provision,sources,answer_json,expires_at,updated_at')
    .in('cache_key', uniqueKeys)

  if (cacheErr) {
    console.error('[enrichComplianceItemsOptimized] cache fetch error:', cacheErr)
  }

  const cacheByKey = new Map<string, LegalCacheRow>()
  ;(cacheRows || []).forEach((row: any) => cacheByKey.set(row.cache_key, row as LegalCacheRow))

  // Determine which keys need Tavily (miss or expired)
  const needsFetch: Array<{ cacheKey: string; key: UniqueComplianceKey; items: RegulatoryRequirement[] }> = []
  for (const [cacheKey, entry] of keyToReqs.entries()) {
    const cached = cacheByKey.get(cacheKey)
    if (!cached) {
      needsFetch.push({ cacheKey, key: entry.key, items: entry.items })
    } else if (isExpired(cached.expires_at)) {
      needsFetch.push({ cacheKey, key: entry.key, items: entry.items })
    }
  }

  // Priority score: focus Tavily on the highest-risk unique types
  const categoryWeight: Record<string, number> = {
    'RoC': 1.2,
    'MCA': 1.2,
    'GST': 1.1,
    'Income Tax': 1.1,
    'Labour Law': 1.05,
  }
  function scoreKey(items: RegulatoryRequirement[]): number {
    let maxDelay = 0
    let critical = false
    let category = items[0]?.category || ''
    for (const it of items) {
      critical = critical || !!it.is_critical
      const d = calculateDaysDelayed(it.due_date, it.status)
      if (d && d > maxDelay) maxDelay = d
    }
    const base = maxDelay || 1
    const w = categoryWeight[category] ?? 1
    return base * w * (critical ? 1.5 : 1)
  }

  needsFetch.sort((a, b) => scoreKey(b.items) - scoreKey(a.items))
  const limitedFetch = needsFetch.slice(0, maxTavilySearches)

  // Perform Tavily searches (limited + parallel)
  const fetchTasks = limitedFetch.map(({ cacheKey, key }) => async () => {
    const legalFramework = mapCategoryToLegalFramework(key.category)
    const query = buildSearchQuery(key.category, key.requirement, legalFramework)
    const searchResults = await searchLegalInfo(query, 'advanced')
    const extracted = extractLegalInfo(searchResults)

    // Best-effort sources extraction
    const sources = (searchResults?.results || [])
      .map(r => r.url)
      .filter(Boolean)
      .slice(0, 5)

    // Upsert to cache (service role)
    const expiresAt = new Date(Date.now() + cacheTtlDays * 24 * 60 * 60 * 1000).toISOString()
    const upsertRow = {
      cache_key: cacheKey,
      template_id: key.templateId,
      query,
      jurisdiction: 'IN',
      legal_section: extracted.legalSection || null,
      penalty_provision: extracted.penaltyProvision || null,
      sources,
      answer_json: searchResults as any,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }

    const { error: upsertErr } = await adminSupabase
      .from('legal_research_cache')
      .upsert(upsertRow, { onConflict: 'cache_key' })

    if (upsertErr) {
      console.error('[enrichComplianceItemsOptimized] cache upsert error:', upsertErr)
    }

    return { cacheKey, row: upsertRow }
  })

  try {
    const fetched = await runWithConcurrency(fetchTasks, tavilyConcurrency)
    fetched.forEach(({ cacheKey, row }: any) => {
      cacheByKey.set(cacheKey, row as any)
    })
  } catch (e) {
    console.error('[enrichComplianceItemsOptimized] Tavily batch error:', e)
  }

  // Build one batch prompt per unique key (apply to all occurrences of that compliance type)
  const batchItems: BatchImpactItem[] = []
  for (const [cacheKey, entry] of keyToReqs.entries()) {
    const cached = cacheByKey.get(cacheKey)
    const legalSection =
      cached?.legal_section ||
      'Refer to Act/Rules'

    const penaltyProvision =
      cached?.penalty_provision ||
      // Use a representative penalty string if present on any item
      entry.items.find(i => i.penalty)?.penalty ||
      'Refer to Act/Rules'

    batchItems.push({
      key: cacheKey,
      category: entry.key.category,
      requirement: entry.key.requirement,
      legalSection,
      penaltyProvision,
    })
  }

  const batchImpactMap =
    (await generateBatchBusinessImpact(batchItems)) || {}

  // Build enriched output per requirement (fast mapping)
  const enriched: EnrichedComplianceData[] = []
  for (const req of requirements) {
    const k = buildUniqueKey(req)
    const cached = cacheByKey.get(k.cacheKey)

    const legalSection =
      cached?.legal_section ||
      'Refer to Act / rules (cached legal section unavailable)'

    const penaltyProvision =
      cached?.penalty_provision ||
      req.penalty ||
      'Refer to Act / rules (cached penalty provision unavailable)'

    const daysDelayed = calculateDaysDelayed(req.due_date, req.status)
    const exactPenalty = calculateExactPenalty(req.penalty, daysDelayed)

    const businessImpact =
      batchImpactMap[k.cacheKey] || {
        financial: 'Business impact analysis unavailable. Direct financial penalty may apply.',
        reputation: 'Non-compliance may affect company reputation and credit rating.',
        operations: 'May cause operational delays and additional compliance burden.',
      }

    enriched.push({
      requirementId: req.id,
      legalSection,
      penaltyProvision,
      exactPenalty,
      businessImpact,
    })
  }

  return enriched
}
