'use server'

import { type RegulatoryRequirement } from '@/app/data-room/actions'
import { enrichComplianceItemsOptimized as enrichComplianceItemsService } from '@/lib/services/compliance-enrichment'

// Define the type locally to avoid import issues with server actions
export interface EnrichedComplianceData {
  requirementId: string
  legalSection: string
  penaltyProvision: string
  exactPenalty: string
  businessImpact: {
    financial: string
    reputation: string
    operations: string
  }
}

/**
 * Server action to enrich compliance requirements with legal research and business impact
 * This must be a server action because Tavily uses Node.js-only modules (net, tls)
 */
export async function enrichComplianceRequirements(
  requirements: RegulatoryRequirement[]
): Promise<EnrichedComplianceData[]> {
  try {
    return await enrichComplianceItemsService(requirements, {
      maxTavilySearches: 10,
      tavilyConcurrency: 3,
      cacheTtlDays: 60
    })
  } catch (error: any) {
    console.error('Error enriching compliance requirements:', error)
    // Return empty array on error - client will handle fallback
    return []
  }
}
