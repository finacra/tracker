/**
 * Applicability Evaluator — Phase 3
 *
 * Given a company + financial year, decide which catalogue rules actually
 * apply and why. Writes ComplianceAssessment rows the tracker reads.
 *
 * Decision order, per rule:
 *   1. User override exists for (company, rule, FY) → respect it verbatim
 *   2. Entity scope mismatch (company type / state / industry / flags) → not applicable, reason cites the mismatch
 *   3. trigger_kind = "always" and entity matches → applicable
 *   4. trigger_kind with a threshold → compare facts in-period to the threshold:
 *      - Fact exceeds threshold → applicable, reason cites the fact
 *      - Fact clearly below threshold → not applicable, reason cites the fact
 *      - No facts + threshold rule → inconclusive (LLM fallback territory;
 *        for v0 we mark applicable = true with confidence 0.5 and a
 *        "please confirm" reasoning so CAs don't miss compliances)
 *
 * Non-goals for this file:
 *   - LLM fallback (separate module; evaluator just flags low-confidence
 *     cases so the LLM layer can pick them up)
 *   - Cross-rule reasoning (e.g., "GSTR-9 only applies if GST registered")
 *     is still encoded in entity_scope, not in the evaluator
 */

import { prisma } from '@/lib/prisma'
import type { ComplianceRule as CatalogueRule } from '@prisma/client'
import { getRulesInForce, fyPeriod } from './catalogue'
import { getFactsForPeriod } from './facts'
import type { CompanyRuleProfile, RuleConditions } from './rules/types'

// ── Inputs ─────────────────────────────────────────────────────────────────

export interface EvaluationInput {
  companyId: string
  financialYear: string           // "2026-27"
  profile: CompanyRuleProfile     // built from companies table + fy facts
  evaluatorVersion?: string       // stamped into assessed_by
}

// Confidence thresholds — the core of the "humble by default" philosophy.
// Wrong compliances on the tracker are worse than missing ones, because
// CAs lose trust. So we only auto-show what we're confident about.
export const CONFIDENCE_THRESHOLDS = {
  AUTO_SHOW: 0.85,     // ≥ this → appears on tracker automatically
  NEEDS_REVIEW: 0.50,  // ≥ this but < AUTO_SHOW → review queue for CA
  HIDDEN: 0.50,        // < this → not applicable, hidden
}

export interface EvaluationOutput {
  assessmentIds: string[]
  applicableCount: number
  notApplicableCount: number
  needsReviewCount: number        // between NEEDS_REVIEW and AUTO_SHOW
  autoShowCount: number           // ≥ AUTO_SHOW
  skippedRuleIds: string[]        // rules blocked by a user override
}

// ── Entity scope matcher ───────────────────────────────────────────────────
// Ports the same semantics as lib/compliance/rules/engine.ts but operates
// on the serialised `entity_scope` JSON from the catalogue row.

interface ScopeResult {
  matches: boolean
  reasons: string[]
  missingData: string[]
  skipReason?: string
}

function evaluateEntityScope(
  scope: RuleConditions,
  p: CompanyRuleProfile,
): ScopeResult {
  const reasons: string[] = []
  const missingData: string[] = []

  // Company type filter
  if (scope.companyTypes?.length) {
    if (!p.type) {
      missingData.push('company type unknown — included as precaution')
    } else if (!scope.companyTypes.includes(p.type)) {
      return { matches: false, reasons: [], missingData: [], skipReason: `Not applicable: type ${p.type} not in [${scope.companyTypes.join(', ')}]` }
    } else {
      reasons.push(`Company type: ${p.type}`)
    }
  }
  if (scope.excludeCompanyTypes?.length && p.type && scope.excludeCompanyTypes.includes(p.type)) {
    return { matches: false, reasons: [], missingData: [], skipReason: `Excluded type: ${p.type}` }
  }

  // Thresholds that historically lived in RuleConditions — these remain
  // categorical gates, not fact triggers (trigger_kind handles the
  // continuous side). For example `minTurnoverLakhs` still short-circuits
  // if we have a declared turnover, but if we don't we rely on trigger
  // evaluation against facts instead of silently dropping the rule.
  if (scope.minTurnoverLakhs !== undefined) {
    if (p.annualTurnoverLakhs === null) {
      missingData.push(`turnover unknown — rule requires >= ₹${scope.minTurnoverLakhs}L, included as precaution`)
    } else if (p.annualTurnoverLakhs < scope.minTurnoverLakhs) {
      return { matches: false, reasons: [], missingData: [], skipReason: `Turnover ₹${p.annualTurnoverLakhs}L < min ₹${scope.minTurnoverLakhs}L` }
    } else {
      reasons.push(`Turnover ₹${p.annualTurnoverLakhs}L (>= ₹${scope.minTurnoverLakhs}L)`)
    }
  }
  if (scope.maxTurnoverLakhs !== undefined) {
    if (p.annualTurnoverLakhs === null) {
      missingData.push(`turnover unknown — rule requires <= ₹${scope.maxTurnoverLakhs}L, included as precaution`)
    } else if (p.annualTurnoverLakhs > scope.maxTurnoverLakhs) {
      return { matches: false, reasons: [], missingData: [], skipReason: `Turnover ₹${p.annualTurnoverLakhs}L > max ₹${scope.maxTurnoverLakhs}L` }
    } else {
      reasons.push(`Turnover ₹${p.annualTurnoverLakhs}L (<= ₹${scope.maxTurnoverLakhs}L)`)
    }
  }
  if (scope.minEmployees !== undefined) {
    if (p.employeeCount === null) {
      missingData.push(`employee count unknown — rule requires >= ${scope.minEmployees}, included as precaution`)
    } else if (p.employeeCount < scope.minEmployees) {
      return { matches: false, reasons: [], missingData: [], skipReason: `Employees ${p.employeeCount} < ${scope.minEmployees}` }
    } else {
      reasons.push(`Employees ${p.employeeCount} (>= ${scope.minEmployees})`)
    }
  }
  if (scope.minNetWorthCrores !== undefined) {
    if (p.netWorthCrores === null) {
      missingData.push(`net worth unknown — rule requires >= ₹${scope.minNetWorthCrores}Cr, included as precaution`)
    } else if (p.netWorthCrores < scope.minNetWorthCrores) {
      return { matches: false, reasons: [], missingData: [], skipReason: `Net worth ₹${p.netWorthCrores}Cr < ₹${scope.minNetWorthCrores}Cr` }
    } else {
      reasons.push(`Net worth ₹${p.netWorthCrores}Cr (>= ₹${scope.minNetWorthCrores}Cr)`)
    }
  }

  // Boolean flags
  if (scope.isGstRegistered !== undefined && scope.isGstRegistered !== p.isGstRegistered) {
    return { matches: false, reasons: [], missingData: [], skipReason: `GST registration required: ${scope.isGstRegistered}` }
  }
  if (scope.isListed !== undefined && scope.isListed !== p.isListed) {
    return { matches: false, reasons: [], missingData: [], skipReason: `Listed required: ${scope.isListed}` }
  }
  if (scope.isMsme !== undefined && p.isMsme !== null && scope.isMsme !== p.isMsme) {
    return { matches: false, reasons: [], missingData: [], skipReason: `MSME required: ${scope.isMsme}` }
  }
  if (scope.hasImportsExports !== undefined && scope.hasImportsExports !== p.hasImportsExports) {
    return { matches: false, reasons: [], missingData: [], skipReason: `Imports/exports required: ${scope.hasImportsExports}` }
  }
  if (scope.isStartupDpiit !== undefined && scope.isStartupDpiit !== p.isStartupDpiit) {
    return { matches: false, reasons: [], missingData: [], skipReason: `DPIIT startup required: ${scope.isStartupDpiit}` }
  }

  // State filter
  if (scope.states?.length) {
    if (!p.state) {
      missingData.push('state unknown — included as precaution')
    } else if (!scope.states.includes(p.state)) {
      return { matches: false, reasons: [], missingData: [], skipReason: `State ${p.state} not in rule list` }
    } else {
      reasons.push(`State: ${p.state}`)
    }
  }

  // Industry filter (NIC code-based). If multiple conditions are set,
  // ANY-match kicks in only when `anyIndustryMatch` is true.
  const industryConditions: Array<() => boolean | null> = []
  if (scope.nicDivisions?.length) {
    industryConditions.push(() => p.nicDivision ? scope.nicDivisions!.includes(p.nicDivision) : null)
  }
  if (scope.nicSections?.length) {
    industryConditions.push(() => p.nicSection ? scope.nicSections!.includes(p.nicSection) : null)
  }
  if (scope.nicCodes?.length) {
    industryConditions.push(() => p.nicCode ? scope.nicCodes!.includes(p.nicCode) : null)
  }
  if (industryConditions.length) {
    const results = industryConditions.map((fn) => fn())
    const hasMatch = results.some((r) => r === true)
    const hasMiss = results.some((r) => r === false)
    if (scope.anyIndustryMatch) {
      if (!hasMatch && !results.some((r) => r === null)) {
        return { matches: false, reasons: [], missingData: [], skipReason: 'Industry does not match' }
      }
      if (hasMatch) reasons.push('Industry match')
    } else {
      if (hasMiss) {
        return { matches: false, reasons: [], missingData: [], skipReason: 'Industry does not match' }
      }
      if (hasMatch) reasons.push('Industry match')
    }
  }

  return { matches: true, reasons, missingData }
}

// ── Trigger evaluator (threshold vs facts) ────────────────────────────────

type FactRow = Awaited<ReturnType<typeof getFactsForPeriod>>[number]

interface TriggerResult {
  fired: 'yes' | 'no' | 'inconclusive'
  reason: string
  factsCited: string[]
  confidence: number
}

/**
 * Map a rule's trigger to the fact kinds that feed it. Extend as more
 * fact kinds and trigger shapes come online.
 */
function factKindsForTrigger(triggerKind: string): string[] {
  switch (triggerKind) {
    case 'turnover_above':            return ['turnover.annual']
    case 'employee_count_above':      return ['headcount.total']
    case 'net_worth_above':           return ['net_worth.total']
    case 'rent_payment_above':        return ['rent.monthly_payment']
    case 'contractor_payment_above':  return ['contractor.annual_spend', 'contractor.monthly_spend']
    case 'professional_fee_above':    return ['contractor.annual_spend'] // professional fees use same fact kind
    case 'salary_above':              return ['salary.annual_bill']
    case 'director_remuneration_above': return ['director.remuneration']
    case 'imports_above':             return ['imports.annual_value']
    case 'exports_above':             return ['exports.annual_value']
    default: return []
  }
}

function evaluateTrigger(rule: CatalogueRule, facts: FactRow[]): TriggerResult {
  if (rule.trigger_kind === 'always') {
    return { fired: 'yes', reason: 'Always applies while entity scope matches.', factsCited: [], confidence: 1 }
  }

  const threshold = rule.threshold_amount ? Number(rule.threshold_amount) : null
  if (threshold == null) {
    return {
      fired: 'yes',
      reason: `Trigger "${rule.trigger_kind}" without a threshold — treated as always-on.`,
      factsCited: [], confidence: 0.8,
    }
  }

  const kinds = factKindsForTrigger(rule.trigger_kind)
  const relevant = kinds.length ? facts.filter((f) => kinds.includes(f.kind)) : []

  if (relevant.length === 0) {
    // Threshold rule with no fact → inconclusive; err on the side of
    // showing it so CAs don't miss anything until the user declares or
    // we extract the fact.
    return {
      fired: 'inconclusive',
      reason: `Threshold rule (${rule.trigger_kind} ${threshold.toLocaleString('en-IN')}) — no matching fact yet. Add the declared value or upload supporting document to confirm applicability.`,
      factsCited: [],
      confidence: 0.5,
    }
  }

  // Pick the highest-confidence amount (ties go to the largest amount).
  const scored = relevant
    .filter((f) => f.amount !== null && f.amount !== undefined)
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence
      return Number(b.amount ?? 0) - Number(a.amount ?? 0)
    })
  if (scored.length === 0) {
    return { fired: 'inconclusive', reason: 'Facts present but no numeric amount.', factsCited: [], confidence: 0.5 }
  }
  const best = scored[0]
  const amount = Number(best.amount)

  if (amount >= threshold) {
    return {
      fired: 'yes',
      reason: `Fact ${best.kind} = ₹${amount.toLocaleString('en-IN')} is ≥ threshold ₹${threshold.toLocaleString('en-IN')}.`,
      factsCited: [best.id],
      confidence: Math.min(best.confidence, 0.95),
    }
  }
  return {
    fired: 'no',
    reason: `Fact ${best.kind} = ₹${amount.toLocaleString('en-IN')} is below threshold ₹${threshold.toLocaleString('en-IN')}.`,
    factsCited: [best.id],
    confidence: Math.min(best.confidence, 0.95),
  }
}

// ── Public entry point ────────────────────────────────────────────────────

export async function evaluateCompliance(input: EvaluationInput): Promise<EvaluationOutput> {
  const { periodStart, periodEnd } = fyPeriod(input.financialYear)
  const [rules, facts, existingOverrides] = await Promise.all([
    getRulesInForce({ periodStart, periodEnd }),
    getFactsForPeriod({ companyId: input.companyId, periodStart, periodEnd }),
    prisma.complianceAssessment.findMany({
      where: {
        company_id: input.companyId,
        financial_year: input.financialYear,
        user_overridden: true,
      },
      select: { rule_id: true },
    }),
  ])

  const overrideRuleIds = new Set(existingOverrides.map((o) => o.rule_id))
  const output: EvaluationOutput = {
    assessmentIds: [],
    applicableCount: 0,
    notApplicableCount: 0,
    needsReviewCount: 0,
    autoShowCount: 0,
    skippedRuleIds: [],
  }

  for (const rule of rules) {
    // Never clobber a user override — keep it and move on.
    if (overrideRuleIds.has(rule.id)) {
      output.skippedRuleIds.push(rule.id)
      continue
    }

    const scope = (rule.entity_scope || {}) as RuleConditions
    const scopeResult = evaluateEntityScope(scope, input.profile)

    let applicable: boolean
    let reasoning: string
    let confidence: number
    let factsCited: string[] = []

    if (!scopeResult.matches) {
      applicable = false
      reasoning = scopeResult.skipReason || 'Entity scope does not match.'
      confidence = 0.95
    } else {
      const trigger = evaluateTrigger(rule, facts)
      if (trigger.fired === 'yes') {
        applicable = true
        reasoning = [scopeResult.reasons.join('. '), trigger.reason].filter(Boolean).join(' ')
        confidence = trigger.confidence
      } else if (trigger.fired === 'no') {
        applicable = false
        reasoning = trigger.reason
        confidence = trigger.confidence
      } else {
        // Inconclusive — mark as "needs review" rather than auto-showing.
        // The CA must approve before this appears on the tracker.
        // This is the core of the "humble by default" philosophy:
        // wrong compliances on the tracker are worse than missing ones.
        applicable = true
        reasoning = trigger.reason + ' [NEEDS CA REVIEW — not auto-shown on tracker until approved]'
        confidence = trigger.confidence
      }
      factsCited = trigger.factsCited
      if (scopeResult.missingData.length) {
        reasoning += ` Notes: ${scopeResult.missingData.join('; ')}`
      }
    }

    // Classify into confidence tiers
    if (applicable && confidence >= CONFIDENCE_THRESHOLDS.AUTO_SHOW) {
      output.autoShowCount++
    } else if (applicable && confidence >= CONFIDENCE_THRESHOLDS.NEEDS_REVIEW) {
      output.needsReviewCount++
    }

    const row = await prisma.complianceAssessment.upsert({
      where: {
        company_id_rule_id_financial_year: {
          company_id: input.companyId,
          rule_id: rule.id,
          financial_year: input.financialYear,
        },
      },
      create: {
        company_id: input.companyId,
        rule_id: rule.id,
        financial_year: input.financialYear,
        applicable,
        reasoning,
        confidence,
        evaluator_kind: 'deterministic',
        facts_cited: factsCited,
        assessed_by: `agent:${input.evaluatorVersion || 'v1'}`,
      },
      update: {
        applicable,
        reasoning,
        confidence,
        evaluator_kind: 'deterministic',
        facts_cited: factsCited,
        assessed_at: new Date(),
        assessed_by: `agent:${input.evaluatorVersion || 'v1'}`,
      },
      select: { id: true },
    })

    output.assessmentIds.push(row.id)
    applicable ? output.applicableCount++ : output.notApplicableCount++
  }

  return output
}
