/**
 * Seed the compliance_rules catalogue from the existing TS rule sets.
 *
 * Idempotent: each row is keyed by the rule's logical id plus an effective-
 * date suffix. Re-runs update existing rows in place.
 *
 * Dual-Act handling: for Income Tax rules that have known IT Act 1961
 * provenance AND a continuing 2025-Act form (mostly the TDS quarterly
 * returns we touched earlier), we insert TWO rows — a legacy row with
 * effective_to = 2026-03-31 and a new-Act row with effective_from = 2026-04-01.
 * Every other category gets a single row with effective_to = null.
 *
 * Usage:
 *   npx tsx scripts/seed-compliance-rules.ts
 */

import { PrismaClient, Prisma } from '@prisma/client'
import type { ComplianceRule as TsRule, RuleConditions } from '@/lib/compliance/rules/types'
import { UNIVERSAL_RULES } from '@/lib/compliance/rules/sets/universal'
import { COMPANY_TYPE_RULES } from '@/lib/compliance/rules/sets/company-type'
import { CONDITIONAL_RULES } from '@/lib/compliance/rules/sets/conditional'
import { INDUSTRY_RULES } from '@/lib/compliance/rules/sets/industry'
import { STATE_RULES } from '@/lib/compliance/rules/sets/state'
import { IT_ACT_2025_EFFECTIVE_FROM } from '@/lib/compliance/it-act-2025'

const prisma = new PrismaClient()

const IT_ACT_2025_START = new Date(IT_ACT_2025_EFFECTIVE_FROM)
const IT_ACT_1961_END = new Date('2026-03-31')

// ── Trigger inference ──────────────────────────────────────────────────────

/**
 * Turn the old RuleConditions into a (trigger_kind, threshold_amount,
 * threshold_basis) triple the evaluator can act on without re-reading
 * entity_scope. We only promote threshold-shaped conditions; categorical
 * filters like companyTypes remain inside entity_scope.
 */
function inferTrigger(c: RuleConditions): {
  trigger_kind: string
  threshold_amount: Prisma.Decimal | null
  threshold_basis: string | null
} {
  // Annual turnover floors like "applies if turnover >= ₹X lakhs"
  if (c.minTurnoverLakhs !== undefined) {
    return {
      trigger_kind: 'turnover_above',
      threshold_amount: new Prisma.Decimal(c.minTurnoverLakhs * 100000),
      threshold_basis: 'annual_turnover',
    }
  }
  // Employee-count floors (e.g., PF/ESI)
  if (c.minEmployees !== undefined) {
    return {
      trigger_kind: 'employee_count_above',
      threshold_amount: new Prisma.Decimal(c.minEmployees),
      threshold_basis: 'employee_count',
    }
  }
  // Net-worth floors (CSR, CARO)
  if (c.minNetWorthCrores !== undefined) {
    return {
      trigger_kind: 'net_worth_above',
      threshold_amount: new Prisma.Decimal(c.minNetWorthCrores * 10000000),
      threshold_basis: 'net_worth',
    }
  }
  // Default: rule fires whenever entity_scope matches.
  return { trigger_kind: 'always', threshold_amount: null, threshold_basis: null }
}

// ── Upsert ────────────────────────────────────────────────────────────────

type CatalogueRow = {
  id: string
  category: string
  name: string
  description: string | null
  act: string
  section_ref: string
  legacy_section_ref: string | null
  authority: string
  frequency: string
  due_date_formula: string | null
  due_description: string | null
  penalty: string | null
  is_critical: boolean
  documents_required: string[]
  form_refs: Prisma.InputJsonValue | typeof Prisma.JsonNull
  source_url: string | null
  effective_from: Date
  effective_to: Date | null
  supersedes_rule_id: string | null
  superseded_by_rule_id: string | null
  trigger_kind: string
  threshold_amount: Prisma.Decimal | null
  threshold_basis: string | null
  entity_scope: Prisma.InputJsonValue
  applicability_reason: string | null
  notes: string | null
  last_verified: Date | null
  verified_by: string | null
}

function parseDate(ymd: string | undefined, fallback: Date): Date {
  if (!ymd) return fallback
  const d = new Date(ymd)
  return isNaN(d.getTime()) ? fallback : d
}

function baseRow(r: TsRule): CatalogueRow {
  const trig = inferTrigger(r.conditions)
  return {
    id: r.id,
    category: r.category,
    name: r.name,
    description: null,
    act: r.act,
    section_ref: r.section,
    legacy_section_ref: null,
    authority: r.authority,
    frequency: r.frequency,
    due_date_formula: r.dueDateFormula || null,
    due_description: r.dueDescription || null,
    penalty: r.penalty || null,
    is_critical: Boolean(r.isCritical),
    documents_required: r.documentsRequired || [],
    form_refs: Prisma.JsonNull,
    source_url: r.sourceUrl || null,
    effective_from: parseDate(r.effectiveFrom, new Date('1961-04-01')),
    effective_to: null,
    supersedes_rule_id: null,
    superseded_by_rule_id: null,
    trigger_kind: trig.trigger_kind,
    threshold_amount: trig.threshold_amount,
    threshold_basis: trig.threshold_basis,
    entity_scope: (r.conditions || {}) as Prisma.InputJsonValue,
    applicability_reason: r.applicabilityReason || null,
    notes: r.notes || null,
    last_verified: r.lastVerified ? parseDate(r.lastVerified, new Date()) : null,
    verified_by: r.verifiedBy || null,
  }
}

/**
 * For TDS quarterly returns: write a legacy 1961-Act row and a 2025-Act row
 * linked via supersedes_rule_id. Everything else: single row.
 */
function rowsFor(r: TsRule): CatalogueRow[] {
  const isTdsQuarterly = /^tds-return-q[1-4]$/.test(r.id)
  if (!isTdsQuarterly) {
    return [baseRow(r)]
  }

  const legacyId = `${r.id}@itact1961`
  const modernId = `${r.id}@itact2025`

  // Legacy 1961-Act row: forms are 24Q/26Q/27Q; section is 200(3).
  const legacy: CatalogueRow = {
    ...baseRow(r),
    id: legacyId,
    act: 'Income Tax Act, 1961',
    section_ref: 'Section 200(3)',
    legacy_section_ref: null,
    name: r.name.replace(/Form 140[^)]*\)/, 'Form 24Q/26Q'),
    documents_required: [
      'Form 24Q (salary TDS)',
      'Form 26Q (non-salary TDS)',
      'Form 27Q (non-resident TDS)',
      'Challan details',
    ],
    form_refs: { primary: 'Form 24Q/26Q', legacy: [] },
    effective_from: new Date('1961-04-01'),
    effective_to: IT_ACT_1961_END,
    supersedes_rule_id: null,
    superseded_by_rule_id: modernId,
    penalty: '₹200/day late fee u/s 234E (max = TDS amount). Penalty u/s 271H: ₹10,000–₹1,00,000.',
    notes: 'IT Act 1961 provenance retained for historical filings on or before 31 March 2026.',
  }

  // 2025-Act row: TS rule's act/section already carry the new-Act text
  // ("Income Tax Act, 2025 (formerly Income Tax Act, 1961)" /
  // "Section 393 (formerly Section 200(3))") because we updated universal.ts
  // earlier in this session.
  const modern: CatalogueRow = {
    ...baseRow(r),
    id: modernId,
    act: 'Income Tax Act, 2025',
    section_ref: 'Section 393',
    legacy_section_ref: 'Section 200(3)',
    form_refs: { primary: 'Form 140', legacy: ['24Q', '26Q', '27Q'] },
    effective_from: IT_ACT_2025_START,
    effective_to: null,
    supersedes_rule_id: legacyId,
    superseded_by_rule_id: null,
  }

  return [legacy, modern]
}

async function main() {
  const allTsRules: TsRule[] = [
    ...UNIVERSAL_RULES,
    ...COMPANY_TYPE_RULES,
    ...CONDITIONAL_RULES,
    ...INDUSTRY_RULES,
    ...STATE_RULES,
  ]

  const rows = allTsRules.flatMap(rowsFor)

  // Sanity-check ids are unique before hitting the DB.
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.id)) throw new Error(`Duplicate rule id: ${row.id}`)
    seen.add(row.id)
  }

  console.log(`Seeding ${rows.length} compliance rules (from ${allTsRules.length} TS rules)…`)

  let inserted = 0
  let updated = 0
  for (const row of rows) {
    const existing = await prisma.complianceRule.findUnique({ where: { id: row.id } })
    await prisma.complianceRule.upsert({
      where: { id: row.id },
      create: row,
      update: row,
    })
    existing ? updated++ : inserted++
  }

  console.log(`Done. Inserted ${inserted}, updated ${updated}.`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
