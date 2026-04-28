'use server'

import { prisma } from '@/lib/prisma'
import { createServerContainer } from '@/lib/composition/server-container'
import { validateCompanyId } from '@/lib/utils/input-validation'
import { handleActionError } from '@/lib/errors/handle-error'

/**
 * Returns the active or recently-finished ingest jobs for a company,
 * keyed by document_id. Used by the vault UI to render per-tile
 * progress chips (Uploading → Extracting → Matching → Linked / Needs
 * review).
 *
 * "Active" =
 *   - in-flight (pending / extracting / matching), OR
 *   - finished within the last 30s (so the linked checkmark shows
 *     briefly before fading), OR
 *   - in needs_review (always — the chip persists until the user
 *     resolves it).
 *
 * Auth: editor+ on this company. Read-only action — viewers can call
 * it too, since it's just status data they'd see in the vault anyway.
 */
export async function getActiveIngestJobsForCompany(
  companyId: string
): Promise<{
  success: boolean
  jobs?: Record<string, {
    status: string
    suggestedRequirementId: string | null
    documentType: string | null
    confidence: number | null
    lastError: string | null
    finishedAt: string | null
  }>
  error?: string
}> {
  try {
    if (!validateCompanyId(companyId)) {
      return { success: false, error: 'Invalid company ID' }
    }

    const { authService, companyMembershipRepository, companyRepository } = createServerContainer()
    const user = await authService.requireCurrentUser()
    const company = await companyRepository.getDetailsById(companyId)
    if (!company) return { success: false, error: 'Company not found' }
    const isOwner = company.ownerUserId === user.id || company.ownerAppUserId === user.id
    if (!isOwner) {
      const membership = await companyMembershipRepository.findRole(user.id, companyId)
      if (!membership) return { success: false, error: 'Access denied' }
    }

    const cutoff = new Date(Date.now() - 30 * 1000) // 30s "linked recently" tail

    const rows = await prisma.documentIngestJob.findMany({
      where: {
        company_id: companyId,
        OR: [
          { status: { in: ['pending', 'extracting', 'matching', 'needs_review'] } },
          { status: 'linked', finished_at: { gte: cutoff } },
        ],
      },
      select: {
        document_id: true,
        status: true,
        result: true,
        last_error: true,
        finished_at: true,
      },
      orderBy: { enqueued_at: 'desc' },
    })

    const jobs: Record<string, {
      status: string
      suggestedRequirementId: string | null
      documentType: string | null
      confidence: number | null
      lastError: string | null
      finishedAt: string | null
    }> = {}

    for (const r of rows) {
      // Multiple jobs per document are possible if a re-ingest happened.
      // The orderBy enqueued_at desc means the FIRST iteration we see
      // for a given doc is the most recent — keep that.
      if (jobs[r.document_id]) continue
      const result = (r.result || {}) as any
      jobs[r.document_id] = {
        status: r.status,
        suggestedRequirementId: result.suggestedRequirementId || result.requirementId || null,
        documentType: result.documentType || null,
        confidence: typeof result.confidence === 'number' ? result.confidence : null,
        lastError: r.last_error,
        finishedAt: r.finished_at ? r.finished_at.toISOString() : null,
      }
    }

    return { success: true, jobs }
  } catch (error) {
    return handleActionError(error)
  }
}
