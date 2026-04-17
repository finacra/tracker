/**
 * Compliance Rules Engine — Type Definitions
 *
 * Every compliance rule is a typed object with:
 * - Applicability conditions (evaluated against company profile)
 * - Compliance details (act, section, due dates, penalties)
 * - Metadata (when verified, by whom, source URL)
 *
 * Rules are version-controlled TypeScript — changes require PR review.
 * CAs review diffs, not database rows.
 */

// ── Company Profile for Rule Evaluation ────────────────────────────────────

export interface CompanyRuleProfile {
  type: string | null                // PTC, PLC, LLP, OPC, Section8, Partnership, Proprietorship
  state: string | null
  nicCode: string | null             // 5-digit NIC code
  nicDivision: string                // 2-digit NIC division
  nicSection: string                 // 1-letter NIC section (A-U)
  isListed: boolean
  employeeCount: number | null
  annualTurnoverLakhs: number | null // in lakhs (₹)
  isGstRegistered: boolean
  netWorthCrores: number | null      // in crores (₹)
  isMsme: boolean | null
  msmeCategory: string | null        // micro, small, medium
  hasImportsExports: boolean
  isStartupDpiit: boolean
  incorporationDate: Date | null
  countryCode: string
}

// ── Compliance Rule ────────────────────────────────────────────────────────

export type ComplianceCategory =
  | 'RoC'
  | 'GST'
  | 'Income Tax'
  | 'Payroll'
  | 'Labour Law'
  | 'Industry-Specific'
  | 'State Compliance'
  | 'SEBI'
  | 'Renewals'
  | 'Others'

export type Frequency =
  | 'monthly'
  | 'quarterly'
  | 'half-yearly'
  | 'annual'
  | 'one-time'
  | 'event-based'

export interface ComplianceRule {
  id: string                         // unique slug, e.g., "pf-ecr-monthly"
  name: string                       // human-readable, e.g., "PF ECR — Monthly Payment & Return"
  category: ComplianceCategory
  act: string                        // e.g., "Employees' Provident Funds and Miscellaneous Provisions Act, 1952"
  section: string                    // e.g., "Section 6 read with Para 38"
  authority: string                  // e.g., "EPFO"
  frequency: Frequency
  dueDateFormula: string             // parseable by deadline-engine
  dueDescription: string             // human-readable, e.g., "15th of following month"
  penalty: string
  isCritical: boolean
  documentsRequired: string[]
  sourceUrl: string                  // official government URL

  // ── Applicability Conditions ──
  // ALL specified conditions must be true (AND logic).
  // Omitted/null conditions are ignored (match all).
  conditions: RuleConditions

  // ── Metadata ──
  effectiveFrom: string              // YYYY-MM-DD — when this rule became law
  lastVerified: string               // YYYY-MM-DD — when a CA last verified this
  verifiedBy?: string                // CA name/initials
  notes?: string                     // edge cases, exceptions, special notes
  applicabilityReason: string        // why this applies (shown to user)
}

export interface RuleConditions {
  // Entity type filter
  companyTypes?: string[]            // e.g., ['PTC', 'PLC', 'OPC'] — match if company type is in list
  excludeCompanyTypes?: string[]     // e.g., ['LLP'] — exclude these types

  // Threshold conditions
  minEmployees?: number              // company must have >= this many employees
  minTurnoverLakhs?: number          // annual turnover >= X lakhs
  maxTurnoverLakhs?: number          // annual turnover <= X lakhs (e.g., QRMP scheme eligibility)
  minNetWorthCrores?: number         // net worth >= X crores
  minProfitCrores?: number           // (future) net profit >= X crores

  // Boolean flags
  isGstRegistered?: boolean          // must be GST registered
  isListed?: boolean                 // must be listed on stock exchange
  isMsme?: boolean                   // must be MSME registered
  hasImportsExports?: boolean        // must do imports/exports
  isStartupDpiit?: boolean           // must be DPIIT-recognized startup

  // Location filter
  states?: string[]                  // e.g., ['Maharashtra', 'Karnataka'] — match if state is in list

  // Industry filter
  nicDivisions?: string[]            // e.g., ['10', '11', '12'] — food/beverage/tobacco
  nicSections?: string[]             // e.g., ['C'] — manufacturing
  nicCodes?: string[]                // specific 5-digit codes (rare, use divisions when possible)

  // Combination: set to true if this rule applies when ANY industry condition matches
  // (default is ALL conditions must match)
  anyIndustryMatch?: boolean
}

// ── Evaluation Result ──────────────────────────────────────────────────────

export interface EvaluatedCompliance {
  rule: ComplianceRule
  matchedConditions: string[]        // human-readable list of why this matched
  missingData: string[]              // which fields were null and assumed (e.g., "employee_count unknown, assumed applicable")
}

export interface RulesEngineResult {
  applicable: EvaluatedCompliance[]
  skipped: { ruleId: string; reason: string }[]
  missingProfileFields: string[]     // fields that are null — user should fill these for accuracy
  profileKey: string                 // cache key for this combo
}
