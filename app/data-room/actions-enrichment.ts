'use server'

import { type RegulatoryRequirement } from '@/app/data-room/actions'
import { queryReportEnrichment } from '@/lib/api/perplexity'
import { handleActionError } from '@/lib/errors/handle-error'

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
  const fixedMatch = trimmedPenalty.match(/₹[\d,]+(?:\.[\d]+)?/)
  if (fixedMatch) return fixedMatch[0]

  return 'Cannot calculate - Insufficient information'
}

function calculateDaysDelayed(dueDateStr: string, status: string): number | null {
  if (status === 'completed' || status === 'upcoming') return null
  try {
    const dueDate = new Date(dueDateStr)
    if (isNaN(dueDate.getTime())) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    dueDate.setHours(0, 0, 0, 0)
    const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : null
  } catch {
    return null
  }
}

function normalizeKeyPart(s: string): string {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s\-\/]/g, '').trim()
}

function buildUniqueKey(req: RegulatoryRequirement): string {
  const templateId = (req as any).template_id ?? null
  if (templateId) return `template:${templateId}`
  return `text:${normalizeKeyPart(req.category)}|${normalizeKeyPart(req.requirement)}`
}

/**
 * Server action to enrich compliance requirements with legal research and business impact
 * Uses Perplexity AI for web-grounded legal research + business impact analysis
 */
export async function enrichComplianceRequirements(
  requirements: RegulatoryRequirement[]
): Promise<EnrichedComplianceData[]> {
  if (!requirements || requirements.length === 0) return []

  try {
    // De-duplicate by unique key
    const keyToReqs = new Map<string, { category: string; requirement: string; penalty: string | null; items: RegulatoryRequirement[] }>()
    for (const r of requirements) {
      const key = buildUniqueKey(r)
      const existing = keyToReqs.get(key)
      if (existing) {
        existing.items.push(r)
      } else {
        keyToReqs.set(key, { category: r.category, requirement: r.requirement, penalty: r.penalty, items: [r] })
      }
    }

    // Build batch for Perplexity (max ~15 to keep prompt manageable)
    const batchEntries = Array.from(keyToReqs.entries()).slice(0, 15)
    const batchInput = batchEntries.map(([key, entry]) => ({
      key,
      category: entry.category,
      requirement: entry.requirement,
      penalty: entry.penalty,
    }))

    console.log(`[enrichComplianceRequirements] Enriching ${batchInput.length} unique items via Perplexity`)

    const result = await queryReportEnrichment(batchInput)

    // Build lookup map from Perplexity response
    const enrichmentMap = new Map<string, typeof result.items[0]>()
    for (const item of result.items) {
      enrichmentMap.set(item.requirementKey, item)
    }

    // Map enrichment back to all requirements
    const enriched: EnrichedComplianceData[] = []
    for (const req of requirements) {
      const key = buildUniqueKey(req)
      const data = enrichmentMap.get(key)
      const daysDelayed = calculateDaysDelayed(req.due_date, req.status)
      const exactPenalty = calculateExactPenalty(req.penalty, daysDelayed)

      enriched.push({
        requirementId: req.id,
        legalSection: data?.legalSection || 'Information not available',
        penaltyProvision: data?.penaltyProvision || req.penalty || 'Information not available',
        exactPenalty,
        businessImpact: data?.businessImpact || {
          financial: 'Business impact analysis unavailable. Direct financial penalty may apply.',
          reputation: 'Non-compliance may affect company reputation and credit rating.',
          operations: 'May cause operational delays and additional compliance burden.',
        },
      })
    }

    return enriched
  } catch (error) {
    handleActionError(error)
    // Return fallback data on error
    return requirements.map(req => {
      const daysDelayed = calculateDaysDelayed(req.due_date, req.status)
      const exactPenalty = calculateExactPenalty(req.penalty, daysDelayed)
      return {
        requirementId: req.id,
        legalSection: 'Information not available',
        penaltyProvision: req.penalty || 'Information not available',
        exactPenalty,
        businessImpact: {
          financial: 'Enrichment unavailable. Please refer to penalty information above.',
          reputation: 'Enrichment unavailable. Non-compliance may affect reputation.',
          operations: 'Enrichment unavailable. May cause operational disruptions.',
        },
      }
    })
  }
}
