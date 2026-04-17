import 'server-only'
import { prisma } from '@/lib/prisma'
import { currentIndianFY, fyWindow } from './facts'

/**
 * Compliance Filing Register — the operational layer.
 *
 * ComplianceAssessment says "does this apply?"
 * ComplianceFiling says "was it filed, when, how much, with what docs?"
 *
 * Filing rows are auto-generated from applicable assessments when the
 * evaluator runs. Users + the vault agent update them as filings happen.
 */

// ── Period key generation ─────────────────────────────────────────────────

/**
 * Generate period keys for a rule's frequency within a financial year.
 * Monthly → 12 keys (YYYY-MM), Quarterly → 4 (YYYY-Q1..Q4),
 * Annual → 1 (the FY label), Half-yearly → 2 (YYYY-H1, YYYY-H2),
 * One-time → 1 ("once").
 */
export function generatePeriodKeys(frequency: string, financialYear: string): string[] {
  const match = financialYear.match(/(\d{4})/)
  if (!match) return [financialYear]
  const startYear = parseInt(match[1], 10)

  switch (frequency) {
    case 'monthly':
      return [
        `${startYear}-04`, `${startYear}-05`, `${startYear}-06`,
        `${startYear}-07`, `${startYear}-08`, `${startYear}-09`,
        `${startYear}-10`, `${startYear}-11`, `${startYear}-12`,
        `${startYear + 1}-01`, `${startYear + 1}-02`, `${startYear + 1}-03`,
      ]
    case 'quarterly':
      return [`${startYear}-Q1`, `${startYear}-Q2`, `${startYear}-Q3`, `${startYear + 1}-Q4`]
    case 'half-yearly':
      return [`${startYear}-H1`, `${startYear}-H2`]
    case 'annual':
      return [financialYear]
    case 'one-time':
    case 'event-based':
      return ['once']
    default:
      return [financialYear]
  }
}

// ── Due date computation ──────────────────────────────────────────────────

/**
 * Compute the due date for a given period key using the rule's formula.
 * Formulas: "fixed:jul31" → 31 July, "offset:7" → 7th of following month,
 * "fixed:may31" → 31 May, etc.
 */
export function computeDueDate(formula: string | null, periodKey: string, financialYear: string): Date | null {
  if (!formula) return null

  const match = financialYear.match(/(\d{4})/)
  if (!match) return null
  const fyStart = parseInt(match[1], 10)

  // Fixed date formulas: "fixed:jul31", "fixed:oct31", etc.
  const fixedMatch = formula.match(/^fixed:(\w{3})(\d{1,2})$/)
  if (fixedMatch) {
    const monthMap: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    }
    const month = monthMap[fixedMatch[1].toLowerCase()]
    const day = parseInt(fixedMatch[2], 10)
    if (month === undefined) return null

    // For FY filing, due dates in Apr-Dec are in fyStart+1 year
    // (e.g., FY 2024-25, due Jul 31 = Jul 31, 2025)
    const year = month >= 3 ? fyStart + 1 : fyStart + 1 // next calendar year for most
    return new Date(year, month, day)
  }

  // Monthly offset: "offset:7" → 7th of the month after the period
  const offsetMatch = formula.match(/^offset:(\d+)$/)
  if (offsetMatch) {
    const dayOfMonth = parseInt(offsetMatch[1], 10)
    const periodMonth = periodKey.match(/(\d{4})-(\d{2})$/)
    if (periodMonth) {
      const y = parseInt(periodMonth[1], 10)
      const m = parseInt(periodMonth[2], 10) // 1-based
      // Due in the FOLLOWING month
      return new Date(y, m, dayOfMonth) // m is already next month (0-based = m)
    }
  }

  return null
}

// ── Auto-generation from assessments ──────────────────────────────────────

/**
 * Given a company + FY, generate ComplianceFiling rows for every
 * applicable assessment. Idempotent: existing rows are not overwritten
 * (user data like amount_paid is preserved).
 */
export async function generateFilingsFromAssessments(options: {
  companyId: string
  financialYear?: string
  createdBy?: string | null
}): Promise<{ created: number; existed: number }> {
  const fy = options.financialYear || currentIndianFY()
  let created = 0
  let existed = 0

  // Get all applicable assessments for this company + FY
  const assessments = await prisma.complianceAssessment.findMany({
    where: {
      company_id: options.companyId,
      financial_year: fy,
      applicable: true,
    },
    select: { id: true, rule_id: true },
  })

  if (assessments.length === 0) return { created, existed }

  // Load the rules to get frequency + due date formula
  const ruleIds = assessments.map(a => a.rule_id)
  const rules = await prisma.complianceRule.findMany({
    where: { id: { in: ruleIds } },
    select: { id: true, frequency: true, due_date_formula: true },
  })
  const ruleById = new Map(rules.map(r => [r.id, r]))

  for (const assessment of assessments) {
    const rule = ruleById.get(assessment.rule_id)
    if (!rule) continue

    const periodKeys = generatePeriodKeys(rule.frequency, fy)

    for (const periodKey of periodKeys) {
      // Check if filing already exists (don't overwrite user data)
      const existing = await prisma.complianceFiling.findUnique({
        where: {
          company_id_rule_id_period_key: {
            company_id: options.companyId,
            rule_id: assessment.rule_id,
            period_key: periodKey,
          },
        },
        select: { id: true },
      })

      if (existing) {
        existed++
        continue
      }

      const dueDate = computeDueDate(rule.due_date_formula, periodKey, fy)

      await prisma.complianceFiling.create({
        data: {
          company_id: options.companyId,
          rule_id: assessment.rule_id,
          assessment_id: assessment.id,
          financial_year: fy,
          period_key: periodKey,
          due_date: dueDate,
          status: dueDate && dueDate < new Date() ? 'overdue' : 'pending',
          created_by: options.createdBy,
        },
      })
      created++
    }
  }

  return { created, existed }
}

// ── Read filings ──────────────────────────────────────────────────────────

export async function getFilingsForCompany(options: {
  companyId: string
  financialYear?: string
  status?: string
  category?: string
}) {
  const fy = options.financialYear || currentIndianFY()

  const filings = await prisma.complianceFiling.findMany({
    where: {
      company_id: options.companyId,
      financial_year: fy,
      ...(options.status ? { status: options.status } : {}),
    },
    orderBy: [{ due_date: 'asc' }, { rule_id: 'asc' }, { period_key: 'asc' }],
  })

  if (filings.length === 0) return { filings: [], rules: [] }

  // Batch-load rule metadata
  const ruleIds = [...new Set(filings.map(f => f.rule_id))]
  const rules = await prisma.complianceRule.findMany({
    where: { id: { in: ruleIds } },
    select: {
      id: true, name: true, category: true, act: true,
      section_ref: true, legacy_section_ref: true, frequency: true,
      due_description: true, penalty: true, is_critical: true,
      form_refs: true, source_url: true,
    },
  })

  // Filter by category if requested
  if (options.category) {
    const categoryRuleIds = new Set(rules.filter(r => r.category === options.category).map(r => r.id))
    return {
      filings: filings.filter(f => categoryRuleIds.has(f.rule_id)),
      rules: rules.filter(r => r.category === options.category),
    }
  }

  return { filings, rules }
}

// ── Upsert a single filing (from vault agent or user edit) ────────────────

export async function upsertFiling(options: {
  companyId: string
  ruleId: string
  periodKey: string
  financialYear: string
  data: {
    status?: string
    amountPayable?: number | null
    amountPaid?: number | null
    shortDeduction?: number | null
    dateOfPayment?: string | null
    dateOfFiling?: string | null
    interestOnShort?: number | null
    interestOnLate?: number | null
    challanNumber?: string | null
    acknowledgement?: string | null
    formReference?: string | null
    workingNotes?: string | null
    documentId?: string | null
    dueDate?: string | null
  }
  updatedBy?: string | null
}) {
  const dueDate = options.data.dueDate ? new Date(options.data.dueDate) : undefined
  const dateOfFiling = options.data.dateOfFiling ? new Date(options.data.dateOfFiling) : undefined

  // Auto-compute days delay
  let daysDelay: number | undefined
  if (dateOfFiling && dueDate) {
    daysDelay = Math.ceil((dateOfFiling.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
    if (daysDelay < 0) daysDelay = 0
  }

  // Auto-compute short deduction
  let shortDeduction = options.data.shortDeduction
  if (shortDeduction === undefined && options.data.amountPayable != null && options.data.amountPaid != null) {
    shortDeduction = Math.max(0, options.data.amountPayable - options.data.amountPaid)
  }

  return prisma.complianceFiling.upsert({
    where: {
      company_id_rule_id_period_key: {
        company_id: options.companyId,
        rule_id: options.ruleId,
        period_key: options.periodKey,
      },
    },
    create: {
      company_id: options.companyId,
      rule_id: options.ruleId,
      financial_year: options.financialYear,
      period_key: options.periodKey,
      due_date: dueDate ?? null,
      status: options.data.status ?? 'pending',
      amount_payable: options.data.amountPayable ?? null,
      amount_paid: options.data.amountPaid ?? null,
      short_deduction: shortDeduction ?? null,
      date_of_payment: options.data.dateOfPayment ? new Date(options.data.dateOfPayment) : null,
      date_of_filing: dateOfFiling ?? null,
      days_delay: daysDelay ?? null,
      interest_on_short: options.data.interestOnShort ?? null,
      interest_on_late: options.data.interestOnLate ?? null,
      challan_number: options.data.challanNumber ?? null,
      acknowledgement: options.data.acknowledgement ?? null,
      form_reference: options.data.formReference ?? null,
      working_notes: options.data.workingNotes ?? null,
      document_id: options.data.documentId ?? null,
      created_by: options.updatedBy,
    },
    update: {
      ...(options.data.status !== undefined ? { status: options.data.status } : {}),
      ...(options.data.amountPayable !== undefined ? { amount_payable: options.data.amountPayable } : {}),
      ...(options.data.amountPaid !== undefined ? { amount_paid: options.data.amountPaid } : {}),
      ...(shortDeduction !== undefined ? { short_deduction: shortDeduction } : {}),
      ...(options.data.dateOfPayment !== undefined ? { date_of_payment: options.data.dateOfPayment ? new Date(options.data.dateOfPayment) : null } : {}),
      ...(dateOfFiling !== undefined ? { date_of_filing: dateOfFiling } : {}),
      ...(daysDelay !== undefined ? { days_delay: daysDelay } : {}),
      ...(options.data.interestOnShort !== undefined ? { interest_on_short: options.data.interestOnShort } : {}),
      ...(options.data.interestOnLate !== undefined ? { interest_on_late: options.data.interestOnLate } : {}),
      ...(options.data.challanNumber !== undefined ? { challan_number: options.data.challanNumber } : {}),
      ...(options.data.acknowledgement !== undefined ? { acknowledgement: options.data.acknowledgement } : {}),
      ...(options.data.formReference !== undefined ? { form_reference: options.data.formReference } : {}),
      ...(options.data.workingNotes !== undefined ? { working_notes: options.data.workingNotes } : {}),
      ...(options.data.documentId !== undefined ? { document_id: options.data.documentId } : {}),
      updated_by: options.updatedBy,
    },
  })
}
