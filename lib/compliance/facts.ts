/**
 * Fact ingestion — convert structured inputs (form fields, extraction
 * results, API pulls) into CompanyFact rows the evaluator will read.
 *
 * Kept minimal and synchronous. The Phase 3 evaluator queries these
 * rows; the Phase 2.3 extraction agent calls recordDocumentExtractedFact
 * for each fact it finds inside an uploaded document.
 */

import { prisma } from '@/lib/prisma'

export type FactSourceKind =
  | 'user_declared'       // typed into a form
  | 'document_extracted'  // found in an uploaded PDF / image
  | 'api_pull'            // fetched from MCA / GST portal / bank statement
  | 'system_derived'      // computed from other facts (e.g., annualised monthly rent)

export interface FactInput {
  companyId: string
  kind: string
  periodStart: Date
  periodEnd: Date
  amount?: number | null
  unit?: string | null
  payload?: unknown
  counterparty?: string | null
  sourceKind: FactSourceKind
  sourceDocId?: string | null
  sourceRef?: string | null
  confidence?: number          // 0..1, default 1 for user_declared / api_pull
  createdBy?: string | null
}

/**
 * Upsert semantics: if a user-declared fact of the same kind + period
 * already exists, replace its amount/payload and mark it as the current
 * row. Document-extracted or system-derived facts always insert a new
 * row so we keep an append-only history the evaluator can reason over.
 */
export async function recordFact(input: FactInput): Promise<string> {
  const confidence = input.confidence ?? (input.sourceKind === 'user_declared' || input.sourceKind === 'api_pull' ? 1 : 0.7)

  if (input.sourceKind === 'user_declared') {
    const existing = await prisma.companyFact.findFirst({
      where: {
        company_id: input.companyId,
        kind: input.kind,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        source_kind: 'user_declared',
        superseded_by_id: null,
      },
      select: { id: true },
    })
    if (existing) {
      await prisma.companyFact.update({
        where: { id: existing.id },
        data: {
          amount: input.amount ?? null,
          unit: input.unit ?? null,
          payload: (input.payload ?? {}) as any,
          counterparty: input.counterparty ?? null,
          confidence,
          updated_at: new Date(),
        },
      })
      return existing.id
    }
  }

  const row = await prisma.companyFact.create({
    data: {
      company_id: input.companyId,
      kind: input.kind,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      amount: input.amount ?? null,
      unit: input.unit ?? null,
      payload: (input.payload ?? {}) as any,
      counterparty: input.counterparty ?? null,
      source_kind: input.sourceKind,
      source_doc_id: input.sourceDocId ?? null,
      source_ref: input.sourceRef ?? null,
      confidence,
      created_by: input.createdBy ?? null,
    },
    select: { id: true },
  })
  return row.id
}

export async function supersedeFact(oldFactId: string, newFactId: string): Promise<void> {
  await prisma.companyFact.update({
    where: { id: oldFactId },
    data: { superseded_by_id: newFactId, updated_at: new Date() },
  })
}

/**
 * Current fact sheet for a company + period — latest non-superseded
 * fact per kind+counterparty. The evaluator calls this.
 */
export async function getFactsForPeriod(options: {
  companyId: string
  periodStart: Date
  periodEnd: Date
  kinds?: string[]
}) {
  return prisma.companyFact.findMany({
    where: {
      company_id: options.companyId,
      superseded_by_id: null,
      // Fact's window must overlap the requested period.
      period_start: { lte: options.periodEnd },
      period_end: { gte: options.periodStart },
      ...(options.kinds?.length ? { kind: { in: options.kinds } } : {}),
    },
    orderBy: [{ kind: 'asc' }, { period_start: 'desc' }],
  })
}

// ── Convenience wrappers for the ingestion sites we already control ──────

export function fyWindow(financialYear: string): { periodStart: Date; periodEnd: Date } {
  const match = financialYear.match(/(\d{4})/)
  if (!match) throw new Error(`Invalid FY: ${financialYear}`)
  const startYear = parseInt(match[1], 10)
  return {
    periodStart: new Date(`${startYear}-04-01`),
    periodEnd: new Date(`${startYear + 1}-03-31`),
  }
}

/**
 * Called from onboarding / manage-company save paths. Translates the
 * form's declared fields into atomic facts. Extend as more form fields
 * become compliance-relevant.
 */
export async function recordOnboardingFacts(options: {
  companyId: string
  createdBy: string | null
  financialYear?: string            // defaults to the current Indian FY
  employeeCount?: number | null
  annualTurnoverRupees?: number | null   // stored as rupees, not lakhs
  netWorthRupees?: number | null
  isGstRegistered?: boolean | null
  isMsme?: boolean | null
  msmeCategory?: string | null
  hasImportsExports?: boolean | null
  isStartupDpiit?: boolean | null
}): Promise<void> {
  const fy = options.financialYear ?? currentIndianFY()
  const { periodStart, periodEnd } = fyWindow(fy)

  const writes: Promise<string>[] = []

  if (options.employeeCount != null) {
    writes.push(
      recordFact({
        companyId: options.companyId,
        kind: 'headcount.total',
        periodStart,
        periodEnd,
        amount: options.employeeCount,
        unit: 'count',
        sourceKind: 'user_declared',
        createdBy: options.createdBy,
      }),
    )
  }

  if (options.annualTurnoverRupees != null) {
    writes.push(
      recordFact({
        companyId: options.companyId,
        kind: 'turnover.annual',
        periodStart,
        periodEnd,
        amount: options.annualTurnoverRupees,
        unit: 'rupees_per_year',
        sourceKind: 'user_declared',
        createdBy: options.createdBy,
      }),
    )
  }

  if (options.netWorthRupees != null) {
    writes.push(
      recordFact({
        companyId: options.companyId,
        kind: 'net_worth.total',
        periodStart,
        periodEnd,
        amount: options.netWorthRupees,
        unit: 'rupees',
        sourceKind: 'user_declared',
        createdBy: options.createdBy,
      }),
    )
  }

  if (options.isGstRegistered != null) {
    writes.push(
      recordFact({
        companyId: options.companyId,
        kind: 'gst.registered',
        periodStart,
        periodEnd,
        payload: { value: options.isGstRegistered },
        unit: 'boolean',
        sourceKind: 'user_declared',
        createdBy: options.createdBy,
      }),
    )
  }

  if (options.isMsme != null) {
    writes.push(
      recordFact({
        companyId: options.companyId,
        kind: 'msme.status',
        periodStart,
        periodEnd,
        payload: { isMsme: options.isMsme, category: options.msmeCategory ?? null },
        unit: 'boolean',
        sourceKind: 'user_declared',
        createdBy: options.createdBy,
      }),
    )
  }

  if (options.hasImportsExports != null) {
    writes.push(
      recordFact({
        companyId: options.companyId,
        kind: 'trade.imports_exports',
        periodStart,
        periodEnd,
        payload: { value: options.hasImportsExports },
        unit: 'boolean',
        sourceKind: 'user_declared',
        createdBy: options.createdBy,
      }),
    )
  }

  if (options.isStartupDpiit != null) {
    writes.push(
      recordFact({
        companyId: options.companyId,
        kind: 'startup.dpiit_recognized',
        periodStart,
        periodEnd,
        payload: { value: options.isStartupDpiit },
        unit: 'boolean',
        sourceKind: 'user_declared',
        createdBy: options.createdBy,
      }),
    )
  }

  await Promise.all(writes)
}

export function currentIndianFY(now: Date = new Date()): string {
  // India FY runs Apr 1 → Mar 31. Jan–Mar still belongs to the previous FY.
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-${String(year + 1).slice(2)}`
}
