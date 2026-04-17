/**
 * Compliance Rules Engine — Evaluator
 *
 * Evaluates all registered rules against a company profile.
 * Returns applicable compliances with match reasons and missing-data warnings.
 *
 * Design principles:
 * - Conservative: if data is missing, INCLUDE the rule with a warning (miss nothing)
 * - Transparent: every match/skip has a human-readable reason
 * - Deterministic: same profile always produces same result (no randomness)
 * - Cacheable: result keyed by profile fingerprint
 */

import type {
  CompanyRuleProfile,
  ComplianceRule,
  RuleConditions,
  EvaluatedCompliance,
  RulesEngineResult,
} from './types'

// Import all rule sets
import { UNIVERSAL_RULES } from './sets/universal'
import { COMPANY_TYPE_RULES } from './sets/company-type'
import { CONDITIONAL_RULES } from './sets/conditional'
import { STATE_RULES } from './sets/state'
import { INDUSTRY_RULES } from './sets/industry'

// ── All Rules Registry ─────────────────────────────────────────────────────

function getAllRules(): ComplianceRule[] {
  return [
    ...UNIVERSAL_RULES,
    ...COMPANY_TYPE_RULES,
    ...CONDITIONAL_RULES,
    ...STATE_RULES,
    ...INDUSTRY_RULES,
  ]
}

// ── Profile Key (for caching) ──────────────────────────────────────────────

export function buildProfileKey(p: CompanyRuleProfile): string {
  // Normalize to a stable cache key
  const parts = [
    p.type || '_',
    p.nicDivision || '_',
    p.state || '_',
    p.isListed ? 'L' : 'U',
    p.isGstRegistered ? 'G' : '_',
    p.employeeCount !== null ? `E${bucketEmployees(p.employeeCount)}` : 'E?',
    p.annualTurnoverLakhs !== null ? `T${bucketTurnover(p.annualTurnoverLakhs)}` : 'T?',
    p.netWorthCrores !== null ? `N${bucketNetWorth(p.netWorthCrores)}` : 'N?',
    p.hasImportsExports ? 'IE' : '_',
    p.isStartupDpiit ? 'SU' : '_',
  ]
  return parts.join('|')
}

// Bucket thresholds for cache key stability
function bucketEmployees(n: number): string {
  if (n < 5) return '0-4'
  if (n < 10) return '5-9'
  if (n < 20) return '10-19'
  if (n < 50) return '20-49'
  if (n < 100) return '50-99'
  if (n < 500) return '100-499'
  return '500+'
}

function bucketTurnover(lakhs: number): string {
  if (lakhs < 20) return '<20L'
  if (lakhs < 100) return '20-100L'
  if (lakhs < 500) return '1-5Cr'
  if (lakhs < 1000) return '5-10Cr'
  if (lakhs < 5000) return '10-50Cr'
  return '50Cr+'
}

function bucketNetWorth(crores: number): string {
  if (crores < 1) return '<1Cr'
  if (crores < 50) return '1-50Cr'
  if (crores < 500) return '50-500Cr'
  return '500Cr+'
}

// ── Evaluator ──────────────────────────────────────────────────────────────

export function evaluateRules(profile: CompanyRuleProfile): RulesEngineResult {
  const allRules = getAllRules()
  const applicable: EvaluatedCompliance[] = []
  const skipped: { ruleId: string; reason: string }[] = []
  const missingFields = detectMissingFields(profile)

  for (const rule of allRules) {
    const result = evaluateRule(rule, profile)

    if (result.matches) {
      applicable.push({
        rule,
        matchedConditions: result.reasons,
        missingData: result.missingData,
      })
    } else {
      skipped.push({ ruleId: rule.id, reason: result.skipReason || 'Conditions not met' })
    }
  }

  // Deduplicate by rule ID (shouldn't happen, but safety)
  const seen = new Set<string>()
  const deduped = applicable.filter(a => {
    if (seen.has(a.rule.id)) return false
    seen.add(a.rule.id)
    return true
  })

  return {
    applicable: deduped,
    skipped,
    missingProfileFields: missingFields,
    profileKey: buildProfileKey(profile),
  }
}

// ── Single Rule Evaluation ─────────────────────────────────────────────────

interface EvalResult {
  matches: boolean
  reasons: string[]
  missingData: string[]
  skipReason?: string
}

function evaluateRule(rule: ComplianceRule, p: CompanyRuleProfile): EvalResult {
  const c = rule.conditions
  const reasons: string[] = []
  const missingData: string[] = []

  // ── Company Type ──
  if (c.companyTypes && c.companyTypes.length > 0) {
    if (!p.type) {
      missingData.push('company type unknown — included as precaution')
    } else if (!c.companyTypes.includes(p.type)) {
      return { matches: false, reasons: [], missingData: [], skipReason: `Company type ${p.type} not in [${c.companyTypes.join(', ')}]` }
    } else {
      reasons.push(`Company type: ${p.type}`)
    }
  }

  if (c.excludeCompanyTypes && c.excludeCompanyTypes.length > 0) {
    if (p.type && c.excludeCompanyTypes.includes(p.type)) {
      return { matches: false, reasons: [], missingData: [], skipReason: `Company type ${p.type} excluded` }
    }
  }

  // ── Employee Count ──
  if (c.minEmployees !== undefined) {
    if (p.employeeCount === null) {
      missingData.push(`employee count unknown — rule requires >= ${c.minEmployees}, included as precaution`)
    } else if (p.employeeCount < c.minEmployees) {
      return { matches: false, reasons: [], missingData: [], skipReason: `Employees ${p.employeeCount} < required ${c.minEmployees}` }
    } else {
      reasons.push(`Employees: ${p.employeeCount} (>= ${c.minEmployees})`)
    }
  }

  // ── Turnover ──
  if (c.minTurnoverLakhs !== undefined) {
    if (p.annualTurnoverLakhs === null) {
      missingData.push(`turnover unknown — rule requires >= ₹${c.minTurnoverLakhs}L, included as precaution`)
    } else if (p.annualTurnoverLakhs < c.minTurnoverLakhs) {
      return { matches: false, reasons: [], missingData: [], skipReason: `Turnover ₹${p.annualTurnoverLakhs}L < required ₹${c.minTurnoverLakhs}L` }
    } else {
      reasons.push(`Turnover: ₹${p.annualTurnoverLakhs}L (>= ₹${c.minTurnoverLakhs}L)`)
    }
  }

  // ── Max Turnover ──
  if (c.maxTurnoverLakhs !== undefined) {
    if (p.annualTurnoverLakhs === null) {
      missingData.push(`turnover unknown — rule requires <= ₹${c.maxTurnoverLakhs}L, included as precaution`)
    } else if (p.annualTurnoverLakhs > c.maxTurnoverLakhs) {
      return { matches: false, reasons: [], missingData: [], skipReason: `Turnover ₹${p.annualTurnoverLakhs}L > max ₹${c.maxTurnoverLakhs}L` }
    } else {
      reasons.push(`Turnover: ₹${p.annualTurnoverLakhs}L (<= ₹${c.maxTurnoverLakhs}L)`)
    }
  }

  // ── Net Worth ──
  if (c.minNetWorthCrores !== undefined) {
    if (p.netWorthCrores === null) {
      missingData.push(`net worth unknown — rule requires >= ₹${c.minNetWorthCrores}Cr, included as precaution`)
    } else if (p.netWorthCrores < c.minNetWorthCrores) {
      return { matches: false, reasons: [], missingData: [], skipReason: `Net worth ₹${p.netWorthCrores}Cr < required ₹${c.minNetWorthCrores}Cr` }
    } else {
      reasons.push(`Net worth: ₹${p.netWorthCrores}Cr (>= ₹${c.minNetWorthCrores}Cr)`)
    }
  }

  // ── Boolean flags ──
  if (c.isGstRegistered !== undefined) {
    if (!p.isGstRegistered && c.isGstRegistered) {
      return { matches: false, reasons: [], missingData: [], skipReason: 'Not GST registered' }
    }
    if (c.isGstRegistered) reasons.push('GST registered')
  }

  if (c.isListed !== undefined) {
    if (p.isListed !== c.isListed) {
      return { matches: false, reasons: [], missingData: [], skipReason: c.isListed ? 'Not listed' : 'Listed (excluded)' }
    }
    if (c.isListed) reasons.push('Listed on stock exchange')
  }

  if (c.isMsme !== undefined) {
    if (p.isMsme === null) {
      missingData.push('MSME status unknown — included as precaution')
    } else if (p.isMsme !== c.isMsme) {
      return { matches: false, reasons: [], missingData: [], skipReason: c.isMsme ? 'Not MSME' : 'Is MSME (excluded)' }
    }
    if (c.isMsme) reasons.push('MSME registered')
  }

  if (c.hasImportsExports !== undefined) {
    if (!p.hasImportsExports && c.hasImportsExports) {
      return { matches: false, reasons: [], missingData: [], skipReason: 'No imports/exports' }
    }
    if (c.hasImportsExports) reasons.push('Has imports/exports')
  }

  if (c.isStartupDpiit !== undefined) {
    if (!p.isStartupDpiit && c.isStartupDpiit) {
      return { matches: false, reasons: [], missingData: [], skipReason: 'Not DPIIT startup' }
    }
    if (c.isStartupDpiit) reasons.push('DPIIT-recognized startup')
  }

  // ── State ──
  if (c.states && c.states.length > 0) {
    if (!p.state) {
      missingData.push('state unknown — included as precaution')
    } else if (!c.states.includes(p.state)) {
      return { matches: false, reasons: [], missingData: [], skipReason: `State ${p.state} not in [${c.states.join(', ')}]` }
    } else {
      reasons.push(`State: ${p.state}`)
    }
  }

  // ── Industry (NIC) ──
  const hasIndustryCondition = (c.nicDivisions && c.nicDivisions.length > 0) ||
    (c.nicSections && c.nicSections.length > 0) ||
    (c.nicCodes && c.nicCodes.length > 0)

  if (hasIndustryCondition) {
    if (!p.nicCode && !p.nicDivision && !p.nicSection) {
      missingData.push('NIC code unknown — included as precaution')
    } else {
      let industryMatch = false
      const industryReasons: string[] = []

      if (c.nicDivisions && c.nicDivisions.length > 0 && p.nicDivision) {
        if (c.nicDivisions.includes(p.nicDivision)) {
          industryMatch = true
          industryReasons.push(`NIC division: ${p.nicDivision}`)
        }
      }
      if (c.nicSections && c.nicSections.length > 0 && p.nicSection) {
        if (c.nicSections.includes(p.nicSection)) {
          industryMatch = true
          industryReasons.push(`NIC section: ${p.nicSection}`)
        }
      }
      if (c.nicCodes && c.nicCodes.length > 0 && p.nicCode) {
        if (c.nicCodes.includes(p.nicCode)) {
          industryMatch = true
          industryReasons.push(`NIC code: ${p.nicCode}`)
        }
      }

      if (!industryMatch) {
        return { matches: false, reasons: [], missingData: [], skipReason: `NIC ${p.nicDivision || p.nicCode} not in required industry` }
      }
      reasons.push(...industryReasons)
    }
  }

  // If we got here, all conditions passed
  if (reasons.length === 0) {
    reasons.push('Universal — applies to all companies')
  }

  return { matches: true, reasons, missingData }
}

// ── Missing Fields Detection ───────────────────────────────────────────────

function detectMissingFields(p: CompanyRuleProfile): string[] {
  const missing: string[] = []
  if (!p.type) missing.push('company_type')
  if (p.employeeCount === null) missing.push('employee_count')
  if (p.annualTurnoverLakhs === null) missing.push('annual_turnover')
  if (!p.state) missing.push('state')
  if (!p.nicCode) missing.push('nic_code')
  if (p.netWorthCrores === null) missing.push('net_worth')
  return missing
}
