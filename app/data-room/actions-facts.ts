'use server'

import { createServerContainer } from '@/lib/composition/server-container'
import { handleActionError } from '@/lib/errors/handle-error'
import { validateCompanyId } from '@/lib/utils/input-validation'
import { extractFactsFromDocument } from '@/lib/compliance/fact-extraction'
import { getFactsForPeriod, recordFact, fyWindow } from '@/lib/compliance/facts'

async function assertCompanyAccess(companyId: string) {
  if (!validateCompanyId(companyId)) throw new Error('Invalid company ID')
  const { authService, companyMembershipRepository, companyRepository } = createServerContainer()
  const user = await authService.requireCurrentUser()

  const company = await companyRepository.getDetailsById(companyId)
  if (!company) throw new Error('Company not found')

  const isOwner = company.ownerUserId === user.id || company.ownerAppUserId === user.id
  if (!isOwner) {
    const membership = await companyMembershipRepository.findRole(user.id, companyId)
    if (!membership) throw new Error('Access denied')
  }
  return { user, company }
}

/**
 * Run the fact-extraction agent against a single uploaded document.
 * Returns the ids of any facts it wrote plus per-run diagnostics.
 */
export async function runFactExtraction(
  companyId: string,
  documentId: string,
): Promise<{
  success: boolean
  factsWritten?: string[]
  skipped?: number
  errors?: string[]
  error?: string
}> {
  try {
    const { user } = await assertCompanyAccess(companyId)
    const result = await extractFactsFromDocument({
      companyId,
      documentId,
      createdBy: user.id,
    })
    return {
      success: true,
      factsWritten: result.factsWritten,
      skipped: result.skipped,
      errors: result.errors,
    }
  } catch (error) {
    return handleActionError(error)
  }
}

/**
 * List facts for a company + period — used by the evaluator and
 * a future "facts explorer" admin view.
 */
/**
 * Record a user-declared fact for an Indian FY. Thin wrapper over
 * recordFact that re-checks company access and resolves the FY window.
 * Used by the tracker evaluation panel and the intake form so nothing
 * in the client bundle imports prisma directly.
 */
export async function recordUserFact(
  companyId: string,
  input: {
    kind: string
    financialYear: string
    amount?: number | null
    unit?: string | null
    payload?: unknown
    counterparty?: string | null
  },
): Promise<{ success: boolean; factId?: string; error?: string }> {
  try {
    const { user } = await assertCompanyAccess(companyId)
    const { periodStart, periodEnd } = fyWindow(input.financialYear)
    const factId = await recordFact({
      companyId,
      kind: input.kind,
      periodStart,
      periodEnd,
      amount: typeof input.amount === 'number' ? input.amount : null,
      unit: input.unit ?? null,
      payload: input.payload,
      counterparty: input.counterparty ?? null,
      sourceKind: 'user_declared',
      confidence: 1,
      createdBy: user.id,
    })
    return { success: true, factId }
  } catch (error) {
    console.error('[recordUserFact] threw',
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error.stack : '')
    return handleActionError(error)
  }
}

/**
 * Batched variant of recordUserFact. The intake form was previously
 * calling recordUserFact in a sequential for-loop — with ~10 facts
 * and a 3–5s Vercel cold-start per call, "Saving..." could hang for
 * 30–50 seconds before either succeeding silently or surfacing an
 * error. This collapses everything into one server roundtrip with
 * Promise.all internally.
 */
export async function recordUserFacts(
  companyId: string,
  inputs: Array<{
    kind: string
    financialYear: string
    amount?: number | null
    unit?: string | null
    payload?: unknown
    counterparty?: string | null
  }>,
): Promise<{ success: boolean; factIds?: string[]; error?: string }> {
  if (!inputs || inputs.length === 0) {
    return { success: true, factIds: [] }
  }
  console.log('[recordUserFacts] enter', { companyId, factCount: inputs.length })
  try {
    const { user } = await assertCompanyAccess(companyId)
    const factIds = await Promise.all(
      inputs.map(async (input) => {
        const { periodStart, periodEnd } = fyWindow(input.financialYear)
        return recordFact({
          companyId,
          kind: input.kind,
          periodStart,
          periodEnd,
          amount: typeof input.amount === 'number' ? input.amount : null,
          unit: input.unit ?? null,
          payload: input.payload,
          counterparty: input.counterparty ?? null,
          sourceKind: 'user_declared',
          confidence: 1,
          createdBy: user.id,
        })
      }),
    )
    console.log('[recordUserFacts] ok', { factCount: factIds.length })
    return { success: true, factIds }
  } catch (error) {
    console.error('[recordUserFacts] threw',
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error.stack : '')
    return handleActionError(error)
  }
}

export async function listFacts(
  companyId: string,
  periodStart: string,
  periodEnd: string,
  kinds?: string[],
): Promise<{
  success: boolean
  facts?: Array<{
    id: string
    kind: string
    amount: number | null
    unit: string | null
    periodStart: string
    periodEnd: string
    counterparty: string | null
    sourceKind: string
    confidence: number
  }>
  error?: string
}> {
  try {
    await assertCompanyAccess(companyId)
    const rows = await getFactsForPeriod({
      companyId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      kinds,
    })
    return {
      success: true,
      facts: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        amount: r.amount ? Number(r.amount) : null,
        unit: r.unit,
        periodStart: r.period_start.toISOString().slice(0, 10),
        periodEnd: r.period_end.toISOString().slice(0, 10),
        counterparty: r.counterparty,
        sourceKind: r.source_kind,
        confidence: r.confidence,
      })),
    }
  } catch (error) {
    return handleActionError(error)
  }
}

/**
 * FY-aware variant of listFacts. Takes the financialYear string the
 * UI already has (e.g. "FY 2026-27" or "2026-27") and resolves the
 * window server-side via fyWindow — the SAME function recordUserFact
 * and recordOnboardingFacts use to write the period_start/period_end
 * columns. This keeps reads aligned with writes.
 *
 * The previous read path had each caller (CIP, IntakeForm) compute
 * `fyStart = financialYear.slice(0, 4) + "-04-01"`. That works for
 * "2026-27" but for "FY 2026-27" returns "FY 2-04-01" — an invalid
 * date string. listFacts then casts it via `new Date(...)` which
 * yields Invalid Date, and the resulting Prisma date comparison
 * never matches anything. Result: facts existed in the DB but the
 * UI saw 0 of them, which made the panel regress to "STEP 1 of 2"
 * after every reload despite a successful save.
 */
/**
 * FY-INDEPENDENT gate for the intake form. Returns true iff the user
 * has ever recorded any user_declared fact for this company, in any FY.
 *
 * Why a separate action: the STEP-1 gate is a one-time onboarding
 * decision, not a per-FY question. Switching the FY filter (or
 * selecting "All Years" which has no FY at all) must NOT regress
 * the gate. listFactsForFY is FY-scoped by definition, so we keep
 * this separate.
 */
export async function hasUserAnsweredIntake(
  companyId: string,
): Promise<{ success: boolean; hasFacts?: boolean; error?: string }> {
  try {
    await assertCompanyAccess(companyId)
    const { prisma } = await import('@/lib/prisma')
    const count = await prisma.companyFact.count({
      where: {
        company_id: companyId,
        source_kind: 'user_declared',
        superseded_by_id: null,
      },
      take: 1,
    })
    return { success: true, hasFacts: count > 0 }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function listFactsForFY(
  companyId: string,
  financialYear: string,
  kinds?: string[],
): Promise<{
  success: boolean
  facts?: Array<{
    id: string
    kind: string
    amount: number | null
    unit: string | null
    periodStart: string
    periodEnd: string
    counterparty: string | null
    sourceKind: string
    confidence: number
  }>
  /**
   * Has the user EVER answered intake (any FY)? Distinct from
   * `facts.length` because intake is a one-time onboarding gate —
   * once the user told us they pay rent / have N employees once,
   * we shouldn't re-prompt just because they're viewing a different
   * year's tracker. UI uses this for the STEP-1 gate decision while
   * still using `facts` (this FY) for IntakeForm prefill.
   */
  hasAnyUserDeclaredFacts?: boolean
  error?: string
}> {
  try {
    await assertCompanyAccess(companyId)
    const { periodStart, periodEnd } = fyWindow(financialYear)
    const { prisma } = await import('@/lib/prisma')
    const [rows, anyUserDeclared] = await Promise.all([
      getFactsForPeriod({ companyId, periodStart, periodEnd, kinds }),
      prisma.companyFact.count({
        where: {
          company_id: companyId,
          source_kind: 'user_declared',
          superseded_by_id: null,
        },
        take: 1, // we only need to know "any" — exists semantics
      }),
    ])
    return {
      success: true,
      facts: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        amount: r.amount ? Number(r.amount) : null,
        unit: r.unit,
        periodStart: r.period_start.toISOString().slice(0, 10),
        periodEnd: r.period_end.toISOString().slice(0, 10),
        counterparty: r.counterparty,
        sourceKind: r.source_kind,
        confidence: r.confidence,
      })),
      hasAnyUserDeclaredFacts: anyUserDeclared > 0,
    }
  } catch (error) {
    return handleActionError(error)
  }
}
