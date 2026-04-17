/**
 * Compliance Rule Catalogue — read-side query helpers.
 *
 * Thin wrapper over the `compliance_rules` table. Primary job: return
 * the set of rules in force during a given period, optionally filtered
 * by category. The applicability evaluator (Phase 3) layers on top of
 * this: it reads catalogue rows, joins against CompanyFacts, and emits
 * ComplianceAssessment rows.
 */

import { prisma } from '@/lib/prisma'
import type { ComplianceRule as PrismaRule } from '@prisma/client'

export type { PrismaRule as CatalogueRule }

export interface PeriodFilter {
  /**
   * Start of the period the caller cares about (e.g., FY start).
   * A rule is "in force" if it overlaps this period at all.
   */
  periodStart: Date
  /**
   * End of the period. Inclusive.
   */
  periodEnd: Date
}

/**
 * Return every rule whose [effective_from, effective_to] window overlaps
 * the requested period. Rules with effective_to = null are still in force.
 *
 * Ordering: category first (so UI can group), then effective_from desc
 * (so the newest version of a superseded rule comes first when both
 * match — useful for transition windows like April 2026 where both
 * IT Act 1961 and IT Act 2025 rows can overlap).
 */
export async function getRulesInForce(
  filter: PeriodFilter & { category?: string },
): Promise<PrismaRule[]> {
  return prisma.complianceRule.findMany({
    where: {
      effective_from: { lte: filter.periodEnd },
      OR: [
        { effective_to: null },
        { effective_to: { gte: filter.periodStart } },
      ],
      ...(filter.category ? { category: filter.category } : {}),
    },
    orderBy: [
      { category: 'asc' },
      { effective_from: 'desc' },
    ],
  })
}

/**
 * Return the single rule in force for a given logical id + date.
 * Useful when following a supersedes_rule_id chain.
 */
export async function getRuleAsOf(
  idOrLegacyId: string,
  asOf: Date,
): Promise<PrismaRule | null> {
  // Try the exact id first (post-seed ids look like "tds-return-q1@itact2025").
  const direct = await prisma.complianceRule.findUnique({ where: { id: idOrLegacyId } })
  if (direct && direct.effective_from <= asOf && (!direct.effective_to || direct.effective_to >= asOf)) {
    return direct
  }

  // Fallback: match by prefix (so `"tds-return-q1"` finds the right version).
  const candidates = await prisma.complianceRule.findMany({
    where: {
      id: { startsWith: `${idOrLegacyId}@` },
      effective_from: { lte: asOf },
      OR: [{ effective_to: null }, { effective_to: { gte: asOf } }],
    },
    orderBy: { effective_from: 'desc' },
    take: 1,
  })
  return candidates[0] || null
}

/**
 * Return the full supersede chain for a rule — oldest first.
 * Used by the historical audit agent and by UI that shows provenance
 * ("this rule succeeded Section 194C under IT Act 1961").
 */
export async function getSupersedeChain(ruleId: string): Promise<PrismaRule[]> {
  const chain: PrismaRule[] = []
  const seen = new Set<string>()

  // Walk backwards to the oldest ancestor.
  let currentId: string | null = ruleId
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId)
    const rule: PrismaRule | null = await prisma.complianceRule.findUnique({ where: { id: currentId } })
    if (!rule) break
    chain.unshift(rule)
    currentId = rule.supersedes_rule_id
  }

  // Walk forward from the requested id's successors.
  currentId = (await prisma.complianceRule.findUnique({ where: { id: ruleId } }))?.superseded_by_rule_id ?? null
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId)
    const rule: PrismaRule | null = await prisma.complianceRule.findUnique({ where: { id: currentId } })
    if (!rule) break
    chain.push(rule)
    currentId = rule.superseded_by_rule_id
  }

  return chain
}

/**
 * Convenience: given an Indian financial year label ("FY2026-27" or
 * "2026-27"), return [Apr 1, Mar 31] as a PeriodFilter.
 */
export function fyPeriod(fy: string): PeriodFilter {
  const match = fy.match(/(\d{4})[\s-]+(\d{2,4})/)
  if (!match) throw new Error(`Invalid FY label: ${fy}`)
  const startYear = parseInt(match[1], 10)
  return {
    periodStart: new Date(`${startYear}-04-01`),
    periodEnd: new Date(`${startYear + 1}-03-31`),
  }
}
