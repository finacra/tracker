/**
 * Compliance Rules Engine — Public API
 *
 * Usage:
 *   import { evaluateRules, buildProfileKey } from '@/lib/compliance/rules'
 *
 *   const profile: CompanyRuleProfile = { ... }
 *   const result = evaluateRules(profile)
 *   // result.applicable — rules that match this company
 *   // result.skipped — rules that don't apply (with reason)
 *   // result.missingProfileFields — fields user should fill for accuracy
 */

export { evaluateRules, buildProfileKey } from './engine'
export { buildRuleProfile } from './profile-builder'
export type { CompanyForRuleEvaluation } from './profile-builder'
export type {
  CompanyRuleProfile,
  ComplianceRule,
  RuleConditions,
  EvaluatedCompliance,
  RulesEngineResult,
  ComplianceCategory,
  Frequency,
} from './types'
