/**
 * Compliance Intelligence Service — Two-Layer Architecture
 *
 * LAYER 1 (DB Templates — fast, deterministic, CA-verified):
 *   Common compliances per company type + state are auto-applied from
 *   compliance_templates via DB trigger on company creation.
 *   These cover: ROC filings, GST, Income Tax, PF/ESI, TDS, etc.
 *
 * LAYER 2 (Perplexity AI — real-time, specialized):
 *   This service handles ONLY what templates don't cover:
 *   - Industry-specific regulations (NIC code based)
 *   - State-specific nuances (Professional Tax slabs, Shops & Est. Act)
 *   - Listing-specific obligations (SEBI LODR)
 *   - Recent regulatory changes, amendments, deadline extensions
 *   - Edge cases templates miss
 *
 * The Perplexity agent receives the list of already-covered compliances
 * and is instructed to find ONLY what's missing.
 */

import { NIC_CODES, type NicSubclass } from '@/data/nic-codes'
import {
  queryComplianceIntelligence,
  queryComplianceValidation,
  queryRegulatoryChanges,
  type PerplexityComplianceItem,
  type PerplexityComplianceResponse,
  type PerplexityValidationItem,
  type PerplexityChangeDetectionItem,
} from '@/lib/api/perplexity'
import {
  buildIndianFYProfile,
  computeNextDeadline,
  frequencyToComplianceType,
  type CompanyDateProfile,
} from './deadline-engine'

// ── Types ──────────────────────────────────────────────────────────────────

export interface CompanyProfile {
  id: string
  name: string
  type: string | null        // PLC, PTC, LLP, OPC, Section8
  nicCode: string | null     // 5-digit NIC code
  nicDescription: string
  nicDivision: string
  nicDivisionName: string
  nicSection: string
  nicSectionName: string
  state: string | null
  isListed: boolean
  incorporationDate: Date | null
  countryCode: string
  industries: string[]
  industryCategories: string[]
}

export interface ExistingCompliance {
  category: string
  requirement: string
  compliance_type: string | null
}

export interface GeneratedRequirement {
  category: string
  requirement: string
  description: string
  status: string             // 'pending_review' — not active until CA approves
  due_date: Date | null
  penalty: string | null
  is_critical: boolean
  compliance_type: string | null
  entity_type: string | null
  industry: string | null
  industry_category: string | null
  year_type: string
  country_code: string
  required_documents: string[]
  // AI-specific fields
  source: string             // 'ai_generated'
  confidence_score: number
  needs_ca_review: boolean
  source_url: string | null
  act: string | null
  section: string | null
  authority: string | null
  due_date_formula: string | null
  applicability_reason: string | null
  ai_batch_id: string
}

export interface ComplianceGenerationResult {
  success: boolean
  requirements: GeneratedRequirement[]
  batchId: string
  totalGenerated: number
  highConfidence: number
  needsReview: number
  skippedAsDuplicate: number
  citations: { title: string; url: string }[]
  error?: string
  usage?: { inputTokens: number; outputTokens: number; totalCost: number }
}

export interface ValidationResult {
  requirementName: string
  verdict: 'applicable' | 'not_applicable' | 'uncertain'
  reason: string
  sourceUrl: string | null
  correctedDueDate: string | null
  correctedFrequency: string | null
}

export interface DiscoveredCompliance {
  id: string
  name: string
  act: string
  section: string
  authority: string
  category: string
  frequency: string
  dueDate: string
  dueDateFormula: string
  penaltyOnMiss: string
  applicabilityReason: string
  documentsRequired: string[]
  sourceUrl: string
  confidenceScore: number
}

export interface ComplianceValidationResult {
  success: boolean
  validations: ValidationResult[]
  flaggedCount: number  // not_applicable + uncertain
  discoveredCompliances: DiscoveredCompliance[]
  error?: string
}

// ── Company Profile Builder ────────────────────────────────────────────────

export function buildCompanyProfile(company: {
  id: string
  name: string
  type: string | null
  nic_code: string | null
  state: string | null
  is_listed: boolean | null
  incorporation_date: Date | null
  country_code: string | null
  industries: string[]
  industry_categories: string[]
}): CompanyProfile {
  const nicData = company.nic_code
    ? NIC_CODES.find((n: NicSubclass) => n.code === company.nic_code)
    : null

  return {
    id: company.id,
    name: company.name,
    type: company.type,
    nicCode: company.nic_code,
    nicDescription: nicData?.description || 'Not specified',
    nicDivision: nicData?.divisionCode || '',
    nicDivisionName: nicData?.divisionName || '',
    nicSection: nicData?.section || '',
    nicSectionName: nicData?.sectionName || '',
    state: company.state,
    isListed: company.is_listed || false,
    incorporationDate: company.incorporation_date,
    countryCode: company.country_code || 'IN',
    industries: company.industries || [],
    industryCategories: company.industry_categories || [],
  }
}

// ── Prompt Builder ─────────────────────────────────────────────────────────

function getCompanyTypeName(type: string | null): string {
  const map: Record<string, string> = {
    'PLC': 'Public Limited Company',
    'PTC': 'Private Limited Company',
    'LLP': 'Limited Liability Partnership',
    'OPC': 'One Person Company',
    'Section8': 'Section 8 Company (Not-for-profit)',
    'Partnership': 'Partnership Firm',
    'Proprietorship': 'Sole Proprietorship',
  }
  return type ? (map[type] || type) : 'Not specified'
}

/**
 * Build the specialized prompt for Perplexity.
 * Tells the AI what's already covered so it focuses on what's MISSING.
 */
export function buildCompliancePrompt(
  profile: CompanyProfile,
  existingCompliances: ExistingCompliance[]
): string {
  const incorpDate = profile.incorporationDate
    ? profile.incorporationDate.toISOString().split('T')[0]
    : 'Not specified'

  // Build the "already covered" section
  const alreadyCoveredSection = existingCompliances.length > 0
    ? `
THE FOLLOWING COMPLIANCES ARE ALREADY TRACKED (do NOT include these — they come from our verified database):
${existingCompliances.map(c => `  - [${c.category}] ${c.requirement} (${c.compliance_type || 'general'})`).join('\n')}

DO NOT regenerate any of the above. Focus ONLY on what is MISSING from this list.`
    : ''

  return `You are analyzing a specific Indian company to find SPECIALIZED compliance requirements that go beyond the common/universal ones.

Company Profile:
- Company Type: ${profile.type || 'Not specified'} (${getCompanyTypeName(profile.type)})
- NIC Code: ${profile.nicCode || 'Not specified'} — ${profile.nicDescription}
- NIC Division: ${profile.nicDivision} — ${profile.nicDivisionName}
- NIC Section: ${profile.nicSection} — ${profile.nicSectionName}
- State: ${profile.state || 'Not specified'}
- Listed on stock exchange: ${profile.isListed ? 'Yes' : 'No'}
- Incorporated: ${incorpDate}
- Financial Year: April–March
${alreadyCoveredSection}

Find ALL ADDITIONAL mandatory compliances this company needs, focusing on:

1. **Industry-specific regulations** based on NIC ${profile.nicCode || 'code'} (${profile.nicDescription}):
   - FSSAI (food), RBI (banking/NBFC), IRDAI (insurance), DPIIT, Drugs & Cosmetics Act,
     Factories Act, Mines Act, Pollution Control Board (PCB/CPCB), BIS, DGFT,
     PESO (explosives), AERB (radiation), TRAI (telecom), CCPA (consumer protection),
     Petroleum Act, Environment Protection Act, Hazardous Waste Rules, etc.
   - Only include what ACTUALLY applies to NIC ${profile.nicCode || 'code'}

2. **State-specific compliances** for ${profile.state || 'the state'}:
   - Professional Tax (exact slabs, due dates, and registration requirements for ${profile.state})
   - Shops & Establishment Act (${profile.state}-specific renewal dates, registration)
   - State-level pollution consent (if manufacturing/industrial NIC code)
   - State labour welfare fund (if applicable)
   - Local body licenses (trade license, signage, fire NOC — if applicable)

3. **Listing-specific** (only if listed = ${profile.isListed}):
   - SEBI LODR quarterly/annual disclosures
   - Shareholding pattern quarterly filing
   - Board meeting intimation to stock exchange
   - Related party transaction disclosures

4. **Recent regulatory changes** (last 6 months):
   - Any NEW compliance requirements introduced
   - Due date extensions or amendments
   - New forms or filing requirements

5. **Edge cases** the standard template may miss:
   - MSME registration/update (Form 1 — if investment + turnover qualifies)
   - Startup India / DPIIT recognition (if age < 10 years)
   - CSR reporting (if turnover/net worth thresholds met)
   - Transfer pricing (if related party transactions)
   - Equalization levy (if digital services)

For each compliance item return the structured JSON with:
- id, name, act, section, authority, category, frequency, dueDate, dueDateFormula,
  penaltyOnMiss, applicabilityReason, documentsRequired, sourceUrl, confidenceScore

RULES:
- Each item must have a unique "id" slug (e.g., "fssai-annual-return", "mpcb-consent-renewal")
- "dueDateFormula" formats: "day:DD,offset:+1month", "quarterly:monDD,monDD,monDD,monDD", "annual:monDD", "months_after_fy_end:N", "half_yearly:monDD,monDD", "event:description"
- "category" must be one of: "Industry-Specific", "State Compliance", "SEBI", "Labour Law", "Renewals", "RoC", "GST", "Income Tax", "Payroll", "Others"
- "confidenceScore" 0.0 to 1.0 — be honest, mark uncertain items 0.85-0.90
- Include sourceUrl to the official government/authority website
- Prioritize industry-specific and state-specific items — that's where templates have gaps
- **The "name" MUST be year-agnostic.** Do NOT include "2024", "FY 2024-25", "2023-24",
  "for April 2026", or any other year/date token in "name". The same rule applies to
  past, present, and future financial years; the year lives in dueDate, not in the name.
  Examples — GOOD: "TDS Payment", "GSTR-3B Monthly Return", "FSSAI Annual Return".
  BAD: "TDS Payment 2026", "GSTR-3B for FY 2024-25", "AOC-4 Filing 2023-24".`
}

const SYSTEM_INSTRUCTIONS = `You are a senior Indian compliance expert (CA/CS qualified) specializing in industry-specific and state-specific regulations.

Your task is to find SPECIALIZED compliance requirements that a standard template-based system would MISS. The common compliances (ROC filings, GST returns, TDS, PF/ESI) are already handled by database templates.

You focus on:
- Industry-specific: regulations that apply ONLY because of the company's NIC code
- State-specific: variations in Professional Tax, Shops & Establishment Act, state pollution boards
- Listing-specific: SEBI LODR obligations for listed companies
- Recent changes: new regulations, amendments, deadline extensions from the last 6 months

CRITICAL:
1. Do NOT include items that are already listed as "already tracked"
2. Include REAL, VERIFIABLE source URLs from government websites
3. Due date formulas must be parseable — follow the exact format
4. Confidence scores must be honest — 0.95+ only for items you're certain about
5. Use web search to verify current due dates and any recent amendments`

// ── Response Processing Pipeline ───────────────────────────────────────────

const VALID_CATEGORIES = new Set([
  'RoC', 'GST', 'Income Tax', 'Payroll', 'Labour Law',
  'Industry-Specific', 'State Compliance', 'SEBI', 'Renewals', 'Others',
])

function validateItem(item: PerplexityComplianceItem): { valid: boolean; issues: string[] } {
  const issues: string[] = []

  if (!item.id || item.id.trim() === '') issues.push('Missing id')
  if (!item.name || item.name.trim() === '') issues.push('Missing name')
  if (!item.act || item.act.trim() === '') issues.push('Missing act')
  if (!item.category) issues.push('Missing category')
  if (!VALID_CATEGORIES.has(item.category)) {
    item.category = mapCategory(item.category)
    if (!VALID_CATEGORIES.has(item.category)) {
      issues.push(`Invalid category: ${item.category}`)
    }
  }
  if (typeof item.confidenceScore !== 'number' || item.confidenceScore < 0 || item.confidenceScore > 1) {
    issues.push(`Invalid confidence: ${item.confidenceScore}`)
  }

  return { valid: issues.length === 0, issues }
}

function mapCategory(raw: string): string {
  const lower = (raw || '').toLowerCase()
  if (lower.includes('roc') || lower.includes('mca') || lower.includes('companies act')) return 'RoC'
  if (lower.includes('gst') || lower.includes('goods and services')) return 'GST'
  if (lower.includes('income tax') || lower.includes('tds') || lower.includes('advance tax')) return 'Income Tax'
  if (lower.includes('pf') || lower.includes('esi') || lower.includes('epfo') || lower.includes('payroll')) return 'Payroll'
  if (lower.includes('labour') || lower.includes('labor') || lower.includes('posh') || lower.includes('gratuity')) return 'Labour Law'
  if (lower.includes('sebi') || lower.includes('lodr') || lower.includes('stock exchange')) return 'SEBI'
  if (lower.includes('industry') || lower.includes('fssai') || lower.includes('rbi') || lower.includes('pollution')) return 'Industry-Specific'
  if (lower.includes('state') || lower.includes('professional tax') || lower.includes('shops')) return 'State Compliance'
  if (lower.includes('renewal') || lower.includes('license') || lower.includes('registration')) return 'Renewals'
  return 'Others'
}

function deduplicateItems(items: PerplexityComplianceItem[]): PerplexityComplianceItem[] {
  const seen = new Set<string>()
  const result: PerplexityComplianceItem[] = []

  for (const item of items) {
    const key = item.id.toLowerCase().replace(/\s+/g, '-')
    if (!seen.has(key)) {
      seen.add(key)
      item.id = key
      result.push(item)
    }
  }

  return result
}

/**
 * Fuzzy-match an AI-generated item against existing requirements.
 * Returns true if this item is likely a duplicate of something already in DB.
 */
function isDuplicateOfExisting(
  item: PerplexityComplianceItem,
  existing: ExistingCompliance[]
): boolean {
  const itemName = item.name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const itemId = item.id.toLowerCase().replace(/[^a-z0-9]/g, '')

  for (const e of existing) {
    const existingName = e.requirement.toLowerCase().replace(/[^a-z0-9]/g, '')

    // Direct substring match (e.g., "GSTR-3B" in both)
    if (itemName.includes(existingName) || existingName.includes(itemName)) return true

    // Slug-based match
    const existingSlug = existingName.replace(/\s+/g, '')
    if (itemId.includes(existingSlug) || existingSlug.includes(itemId)) return true

    // Key term overlap (at least 3 significant words in common)
    const itemWords = new Set(item.name.toLowerCase().split(/\s+/).filter(w => w.length > 3))
    const existingWords = e.requirement.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    const overlap = existingWords.filter(w => itemWords.has(w)).length
    if (overlap >= 3) return true
  }

  return false
}

// ── Main Generation Function ───────────────────────────────────────────────

/**
 * Generate SPECIALIZED compliance items using Perplexity AI.
 *
 * @param company - Company details from DB
 * @param existingCompliances - Requirements already in DB (from templates).
 *   Pass these so the AI skips them and focuses on what's missing.
 */
export async function generateComplianceIntelligence(
  company: {
    id: string
    name: string
    type: string | null
    nic_code: string | null
    state: string | null
    is_listed: boolean | null
    incorporation_date: Date | null
    country_code: string | null
    industries: string[]
    industry_categories: string[]
  },
  existingCompliances: ExistingCompliance[] = []
): Promise<ComplianceGenerationResult> {
  const batchId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  try {
    // 1. Build company profile
    const profile = buildCompanyProfile(company)

    // 2. Build prompt (includes "already covered" list)
    const prompt = buildCompliancePrompt(profile, existingCompliances)

    // 3. Query Perplexity
    const response: PerplexityComplianceResponse = await queryComplianceIntelligence(
      prompt,
      SYSTEM_INSTRUCTIONS
    )

    if (!response.items || response.items.length === 0) {
      return {
        success: true,
        requirements: [],
        batchId,
        totalGenerated: 0,
        highConfidence: 0,
        needsReview: 0,
        skippedAsDuplicate: 0,
        citations: response.citations || [],
        usage: response.usage,
      }
    }

    // 4. Validate and deduplicate within AI response
    const deduped = deduplicateItems(response.items)
    const validated: PerplexityComplianceItem[] = []

    for (const item of deduped) {
      const { valid, issues } = validateItem(item)
      if (valid) {
        validated.push(item)
      } else {
        console.warn(`[ComplianceIntel] Skipping invalid item "${item.id}": ${issues.join(', ')}`)
      }
    }

    // 5. Filter by confidence threshold (>= 0.85)
    const confident = validated.filter(item => item.confidenceScore >= 0.85)

    // 6. Remove duplicates against existing DB requirements (safety net)
    let skippedAsDuplicate = 0
    const novel = confident.filter(item => {
      if (existingCompliances.length > 0 && isDuplicateOfExisting(item, existingCompliances)) {
        skippedAsDuplicate++
        console.log(`[ComplianceIntel] Skipping duplicate: "${item.name}" (matched existing DB requirement)`)
        return false
      }
      return true
    })

    // 7. Compute deadlines and build requirement records
    const incorporationDate = profile.incorporationDate || new Date()
    const dateProfile = buildIndianFYProfile(incorporationDate)

    // Strip year tokens from AI-returned names. Even with the strict
    // prompt rule, models occasionally slip "2026" or "FY 2024-25" into
    // the name. We dedupe at insert time on lowercased name, so a
    // year-suffixed duplicate of an existing rule would slip through —
    // hence the belt-and-suspenders sanitization here.
    const stripYearFromName = (name: string): string => {
      let out = name
      out = out.replace(/\s*[—–-]\s*for\s+[A-Za-z]+\s*\d{4}\s*$/i, '')
      out = out.replace(/\bF\.?Y\.?\s*\d{4}\s*[-–]\s*\d{2,4}\b/gi, '')
      out = out.replace(/\b\d{4}\s*[-–]\s*\d{2,4}\b/g, '')
      out = out.replace(/\b(19|20|21)\d{2}\b/g, '')
      out = out.replace(/\s+[—–-]\s*$/g, '')
      out = out.replace(/\s{2,}/g, ' ').trim()
      return out || name
    }

    const requirements: GeneratedRequirement[] = novel.map(item => {
      const nextDeadline = computeNextDeadline(item.dueDateFormula, dateProfile)
      const needsReview = item.confidenceScore < 0.95

      return {
        category: item.category,
        requirement: stripYearFromName(item.name),
        description: `${item.act} — ${item.section}. ${item.applicabilityReason}`,
        status: 'pending_review',
        due_date: nextDeadline,
        penalty: item.penaltyOnMiss || null,
        is_critical: item.confidenceScore >= 0.95,
        compliance_type: frequencyToComplianceType(item.frequency),
        entity_type: profile.type,
        industry: profile.nicSection || null,
        industry_category: profile.nicDivisionName || null,
        year_type: 'FY',
        country_code: profile.countryCode,
        required_documents: item.documentsRequired || [],
        source: 'ai_generated',
        confidence_score: item.confidenceScore,
        needs_ca_review: needsReview,
        source_url: item.sourceUrl || null,
        act: item.act || null,
        section: item.section || null,
        authority: item.authority || null,
        due_date_formula: item.dueDateFormula || null,
        applicability_reason: item.applicabilityReason || null,
        ai_batch_id: batchId,
      }
    })

    return {
      success: true,
      requirements,
      batchId,
      totalGenerated: response.items.length,
      highConfidence: novel.filter(i => i.confidenceScore >= 0.95).length,
      needsReview: novel.filter(i => i.confidenceScore < 0.95).length,
      skippedAsDuplicate,
      citations: response.citations,
      usage: response.usage,
    }
  } catch (error) {
    console.error('[ComplianceIntel] Generation failed:', error)
    return {
      success: false,
      requirements: [],
      batchId,
      totalGenerated: 0,
      highConfidence: 0,
      needsReview: 0,
      skippedAsDuplicate: 0,
      citations: [],
      error: error instanceof Error ? error.message : 'Failed to generate compliance intelligence',
    }
  }
}

// ── Change Detection ───────────────────────────────────────────────────────

export async function detectRegulatoryChanges(
  company: {
    type: string | null
    nic_code: string | null
    state: string | null
    is_listed: boolean | null
    country_code: string | null
  },
  lastCheckedDate: string
): Promise<{
  changes: PerplexityChangeDetectionItem[]
  error?: string
}> {
  try {
    const nicData = company.nic_code
      ? NIC_CODES.find((n: NicSubclass) => n.code === company.nic_code)
      : null

    const prompt = `Between ${lastCheckedDate} and today, have there been any new notifications, circulars, amendments, or due date extensions from MCA, CBDT, GSTN, SEBI, EPFO, or ESIC that affect a ${getCompanyTypeName(company.type)} company with NIC code ${company.nic_code || 'N/A'} (${nicData?.description || 'general business'}) in ${company.state || 'India'}?

${company.is_listed ? 'This company is listed on a stock exchange — include SEBI/LODR changes.' : ''}

If yes, list each change with:
- changeType: one of "new_filing", "due_date_extension", "exemption", "amendment", "new_regulation"
- affectedComplianceId: slug matching the compliance item affected (e.g., "gstr-3b-monthly", "aoc-4-annual"), or null if new
- description: clear description of the change
- effectiveDate: when it takes effect (YYYY-MM-DD)
- sourceUrl: official government notification URL
- actionRequired: what the company needs to do

If no changes found, return an empty array.`

    const changes = await queryRegulatoryChanges(prompt)
    return { changes }
  } catch (error) {
    console.error('[ComplianceIntel] Change detection failed:', error)
    return { changes: [], error: error instanceof Error ? error.message : 'Change detection failed' }
  }
}

// ── Validation Layer ────────────────────────────────────────────────────────
// Asks Perplexity to review rules engine output and flag incorrect items

export async function validateExistingCompliances(
  company: {
    id: string
    name: string
    type: string | null
    nic_code: string | null
    state: string | null
    is_listed: boolean | null
    incorporation_date: Date | null
    country_code: string | null
    industries: string[]
    industry_categories: string[]
    employee_count: number | null
    annual_turnover: any | null
    is_gst_registered: boolean | null
    net_worth: any | null
    is_msme: boolean | null
    has_imports_exports: boolean | null
    is_startup_dpiit: boolean | null
  },
  existingRequirements: {
    requirement: string
    category: string
    compliance_type: string | null
    due_date: string | null
    source: string | null
  }[]
): Promise<ComplianceValidationResult> {
  try {
    const profile = buildCompanyProfile(company)

    const requirementsList = existingRequirements
      .map((r, i) => `${i + 1}. [${r.category}] ${r.requirement} (${r.compliance_type || 'general'}) — Due: ${r.due_date || 'not set'} — Source: ${r.source || 'unknown'}`)
      .join('\n')

    const prompt = `You have TWO tasks for this Indian company:

**TASK 1: VALIDATE** — Review each existing compliance requirement and determine if it actually applies.
**TASK 2: DISCOVER** — Find any MISSING compliance requirements that should be tracked but aren't in the list.

Company Profile:
- Name: ${company.name}
- Type: ${company.type || 'Not specified'} (${getCompanyTypeName(company.type)})
- NIC Code: ${profile.nicCode || 'Not specified'} — ${profile.nicDescription}
- NIC Division: ${profile.nicDivision} — ${profile.nicDivisionName}
- NIC Section: ${profile.nicSection} — ${profile.nicSectionName}
- State: ${profile.state || 'Not specified'}
- Listed: ${profile.isListed ? 'Yes' : 'No'}
- Employee Count: ${company.employee_count ?? 'Unknown'}
- Annual Turnover: ${company.annual_turnover != null ? company.annual_turnover + ' lakhs' : 'Unknown'}
- GST Registered: ${company.is_gst_registered ?? 'Unknown'}
- Net Worth: ${company.net_worth != null ? company.net_worth + ' crores' : 'Unknown'}
- MSME: ${company.is_msme === true ? 'Yes' : company.is_msme === false ? 'No' : 'Unknown'}
- Imports/Exports: ${company.has_imports_exports ?? 'Unknown'}
- DPIIT Startup: ${company.is_startup_dpiit ?? 'Unknown'}
- Incorporated: ${company.incorporation_date ? new Date(company.incorporation_date).toISOString().split('T')[0] : 'Unknown'}

═══ TASK 1: VALIDATE EXISTING REQUIREMENTS ═══
${requirementsList}

For each requirement, determine:
- "applicable" — this requirement definitely applies to this company
- "not_applicable" — this requirement does NOT apply (explain why)
- "uncertain" — not enough information to determine

Also flag if the due date or frequency seems wrong.

═══ TASK 2: FIND MISSING COMPLIANCES ═══
Based on this company's profile (type, NIC code, state, employee count, turnover, etc.), identify any MANDATORY compliance requirements that are NOT in the list above. Focus on:

1. **Industry-specific** (NIC ${profile.nicCode || 'code'} — ${profile.nicDescription}):
   - FSSAI, RBI, IRDAI, Drugs & Cosmetics, Factories Act, Pollution Control, BIS, etc.
   - Only include what ACTUALLY applies to this NIC code

2. **State-specific** (${profile.state || 'state'}):
   - Professional Tax registration/returns (if not already listed)
   - Shops & Establishment Act renewal
   - State pollution board consent (if manufacturing)
   - State labour welfare fund

3. **Threshold-based** that may have been missed:
   - CSR (if turnover > 1000 crore or net worth > 500 crore or profit > 5 crore)
   - Tax Audit (if turnover thresholds met)
   - Internal auditor appointment
   - Cost audit (if applicable to NIC code)

4. **Recent regulatory changes** (last 6 months):
   - New filing requirements, forms, or registrations

Return ONLY genuinely missing items — do NOT duplicate anything already in the list above.

VALIDATION RULES:
- Use web search to verify thresholds (PF: 20+ employees, ESI: 10+, Tax Audit: turnover > 1 crore business / 50 lakh profession)
- Check state-specific applicability
- Verify NIC code based rules
- Be conservative: if unsure about validation, mark "applicable"; if unsure about discovery, include with lower confidence score
- "dueDateFormula" formats: "day:DD,offset:+1month", "quarterly:monDD,monDD,monDD,monDD", "annual:monDD", "fixed:monDD", "months_after_fy_end:N", "half_yearly:monDD,monDD", "event:description"
- "category" must be one of: "Industry-Specific", "State Compliance", "SEBI", "Labour Law", "Renewals", "RoC", "GST", "Income Tax", "Payroll", "Others"`

    const systemInstructions = `You are a senior Indian Chartered Accountant (CA/CS qualified) performing a comprehensive compliance audit. You have two jobs:

1. VALIDATE: Review each existing requirement and catch errors — items incorrectly applied based on thresholds, state, NIC code, or entity type.
2. DISCOVER: Find missing mandatory compliances this company should track but doesn't yet.

Focus on:
- Threshold-based rules: employee count, turnover, net worth thresholds
- State-specific rules: Professional Tax, Shops & Establishment, state pollution
- Industry-specific rules: NIC code triggers (FSSAI, RBI, Factories Act, etc.)
- Entity-type rules: PLC vs PTC vs LLP differences
- Recent changes: new regulations, amendments, deadline extensions from last 6 months

Be precise and cite sources. For validation: if borderline, mark "applicable" (conservative). For discovery: only include items you're genuinely confident about (0.85+ confidence).`

    const response = await queryComplianceValidation(prompt, systemInstructions)

    const validations: ValidationResult[] = response.validations.map(v => ({
      requirementName: v.requirementName,
      verdict: v.verdict,
      reason: v.reason,
      sourceUrl: v.sourceUrl || null,
      correctedDueDate: v.correctedDueDate || null,
      correctedFrequency: v.correctedFrequency || null,
    }))

    const flaggedCount = validations.filter(v => v.verdict !== 'applicable').length

    // Map discovered compliances
    const discoveredCompliances: DiscoveredCompliance[] = (response.missingCompliances || []).map(m => ({
      id: m.id,
      name: m.name,
      act: m.act,
      section: m.section,
      authority: m.authority,
      category: m.category,
      frequency: m.frequency,
      dueDate: m.dueDate,
      dueDateFormula: m.dueDateFormula,
      penaltyOnMiss: m.penaltyOnMiss,
      applicabilityReason: m.applicabilityReason,
      documentsRequired: m.documentsRequired || [],
      sourceUrl: m.sourceUrl,
      confidenceScore: m.confidenceScore,
    }))

    return {
      success: true,
      validations,
      flaggedCount,
      discoveredCompliances,
    }
  } catch (error) {
    console.error('[ComplianceIntel] Validation failed:', error)
    return { success: false, validations: [], flaggedCount: 0, discoveredCompliances: [], error: error instanceof Error ? error.message : 'Validation failed' }
  }
}
