'use server'

import { createServerContainer } from '@/lib/composition/server-container'
import { handleActionError } from '@/lib/errors/handle-error'
import { validateCompanyId } from '@/lib/utils/input-validation'
import { extractFactsFromDocument } from '@/lib/compliance/fact-extraction'
import { getFactsForPeriod } from '@/lib/compliance/facts'

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
