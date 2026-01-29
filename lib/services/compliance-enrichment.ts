import { RegulatoryRequirement } from '@/app/data-room/actions'
import { searchLegalInfo, extractLegalInfo } from '@/lib/api/tavily'
import { generateBusinessImpact, BusinessImpact } from '@/lib/api/openai'

export interface EnrichedComplianceData {
  requirementId: string
  legalSection: string
  penaltyProvision: string
  exactPenalty: string
  businessImpact: BusinessImpact
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
