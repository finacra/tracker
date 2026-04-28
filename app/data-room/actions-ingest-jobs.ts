'use server'

import { prisma } from '@/lib/prisma'
import { createServerContainer } from '@/lib/composition/server-container'
import { validateCompanyId, isValidUUID } from '@/lib/utils/input-validation'
import { handleActionError } from '@/lib/errors/handle-error'
import { upsertFiling } from '@/lib/compliance/filings'
import { stripPeriodSuffix } from '@/lib/utils/strip-period-suffix'

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

    // 5-minute "linked recently" tail. Originally 30s, but real-user
    // feedback showed the chip vanished before they could notice it.
    // 5 min is long enough to be visible across a typical browse
    // session, short enough that stale chips don't accumulate.
    const cutoff = new Date(Date.now() - 5 * 60 * 1000)

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

interface RequirementCandidate {
  id: string
  requirement: string
  category: string | null
  periodKey: string | null
  periodLabel: string | null
  dueDate: string | null
  status: string | null
  // 0-1 score: how good a match this is for the agent's extracted
  // (documentType, periodKey). Surfaced in the modal so the user can
  // pick the highest-confidence option without scanning everything.
  matchScore: number
}

interface ReviewCandidatesResult {
  success: boolean
  documentId?: string
  fileName?: string | null
  agent?: {
    documentType: string | null
    periodKey: string | null
    periodFY: string | null
    confidence: number | null
    folderSlug: string | null
    reasoning: string | null
  }
  candidates?: RequirementCandidate[]
  error?: string
}

/**
 * For a single document in needs_review, returns the agent's
 * extracted metadata + a ranked list of candidate requirements the
 * user can pick from. Drives the review modal (PR B.2.2).
 *
 * Ranking strategy (highest first):
 *   1. Exact period_key match (with FY-format tolerance) AND
 *      documentType matches the rule's stripped base name.
 *   2. Period match alone, doc-type substring match.
 *   3. Period match alone (any rule for this period).
 *   4. Doc-type match alone (any period).
 *   5. Other recurring rules (low score, surfaced last).
 *
 * Cap the result at 25 to keep the modal scannable.
 */
export async function getReviewCandidatesForDocument(
  companyId: string,
  documentId: string,
): Promise<ReviewCandidatesResult> {
  try {
    if (!validateCompanyId(companyId)) return { success: false, error: 'Invalid company ID' }
    if (!isValidUUID(documentId)) return { success: false, error: 'Invalid document ID' }

    const { authService, companyMembershipRepository, companyRepository } = createServerContainer()
    const user = await authService.requireCurrentUser()
    const company = await companyRepository.getDetailsById(companyId)
    if (!company) return { success: false, error: 'Company not found' }
    const isOwner = company.ownerUserId === user.id || company.ownerAppUserId === user.id
    if (!isOwner) {
      const m = await companyMembershipRepository.findRole(user.id, companyId)
      if (!m) return { success: false, error: 'Access denied' }
    }

    // Fetch doc + the most recent ingest job for it (the agent's
    // suggestion is on the job's `result` JSON or the doc's
    // `agent_suggestions`; prefer the latest job result).
    const [doc, latestJob] = await Promise.all([
      prisma.companyDocument.findFirst({
        where: { id: documentId, company_id: companyId, deleted_at: null },
        select: { id: true, file_name: true, agent_suggestions: true },
      }),
      prisma.documentIngestJob.findFirst({
        where: { document_id: documentId, company_id: companyId },
        orderBy: { enqueued_at: 'desc' },
        select: { result: true, last_error: true, status: true },
      }),
    ])
    if (!doc) return { success: false, error: 'Document not found' }

    const result = (latestJob?.result || {}) as any
    const fullAgent = (doc.agent_suggestions || {}) as any
    const agent = {
      documentType: result.documentType || fullAgent.documentType || null,
      periodKey: result.periodKey || fullAgent.periodKey || null,
      periodFY: result.periodFY || fullAgent.periodFY || null,
      confidence: typeof result.confidence === 'number'
        ? result.confidence
        : (typeof fullAgent.confidence === 'number' ? fullAgent.confidence : null),
      folderSlug: fullAgent.folderSlug || null,
      reasoning: fullAgent.reasoning || null,
    }

    // Build period-key candidates (FY-format tolerant)
    const pk = (agent.periodKey || agent.periodFY || '').trim()
    const periodCandidates = new Set<string>()
    if (pk) {
      periodCandidates.add(pk)
      periodCandidates.add(`FY${pk}`)
      periodCandidates.add(`FY ${pk}`)
      periodCandidates.add(pk.replace(/^FY\s*/i, ''))
    }

    // Pull all requirements for this company (cap query for safety).
    // We rank in JS — total count is bounded (~100s per company).
    const all = await prisma.regulatoryRequirement.findMany({
      where: { company_id: companyId },
      select: {
        id: true,
        requirement: true,
        category: true,
        period_key: true,
        period_label: true,
        due_date: true,
        status: true,
      },
      orderBy: [{ category: 'asc' }, { requirement: 'asc' }],
    })

    const docTypeLower = (agent.documentType || '').toLowerCase().trim()

    function scoreOf(r: typeof all[number]): number {
      const baseLower = stripPeriodSuffix(r.requirement).toLowerCase().trim()
      const periodHit = !!(r.period_key && periodCandidates.has(r.period_key))
      if (!docTypeLower && !periodHit) return 0
      // Exact base-name + period match — strongest signal
      if (periodHit && baseLower === docTypeLower) return 1.0
      if (periodHit && (baseLower.startsWith(docTypeLower) || baseLower.includes(docTypeLower))) return 0.9
      if (periodHit) return 0.6
      if (docTypeLower && baseLower === docTypeLower) return 0.5
      if (docTypeLower && (baseLower.startsWith(docTypeLower) || baseLower.includes(docTypeLower))) return 0.4
      return 0.05
    }

    const ranked: RequirementCandidate[] = all
      .map(r => ({
        id: r.id,
        requirement: r.requirement,
        category: r.category,
        periodKey: r.period_key,
        periodLabel: r.period_label,
        dueDate: r.due_date ? r.due_date.toISOString().slice(0, 10) : null,
        status: r.status,
        matchScore: scoreOf(r),
      }))
      .filter(c => c.matchScore > 0.05)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 25)

    // If filtering produced nothing, fall back to the top 25
    // category-matching rows so the user has something to scan.
    const candidates = ranked.length > 0
      ? ranked
      : all
          .slice(0, 25)
          .map(r => ({
            id: r.id,
            requirement: r.requirement,
            category: r.category,
            periodKey: r.period_key,
            periodLabel: r.period_label,
            dueDate: r.due_date ? r.due_date.toISOString().slice(0, 10) : null,
            status: r.status,
            matchScore: 0,
          }))

    return {
      success: true,
      documentId: doc.id,
      fileName: doc.file_name,
      agent,
      candidates,
    }
  } catch (error) {
    return handleActionError(error)
  }
}

/**
 * Manual link from the review modal: write the chosen requirement to
 * CompanyDocument.requirement_id, mark the latest ingest job linked,
 * and (when applicable) upsert the matching ComplianceFiling row.
 *
 * Auth: editor+ on the company (same gate as document mutations).
 */
export async function linkDocumentToRequirement(input: {
  companyId: string
  documentId: string
  requirementId: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { companyId, documentId, requirementId } = input
    if (!validateCompanyId(companyId)) return { success: false, error: 'Invalid company ID' }
    if (!isValidUUID(documentId)) return { success: false, error: 'Invalid document ID' }
    if (!isValidUUID(requirementId)) return { success: false, error: 'Invalid requirement ID' }

    const { authService, companyMembershipRepository, companyRepository } = createServerContainer()
    const user = await authService.requireCurrentUser()
    const company = await companyRepository.getDetailsById(companyId)
    if (!company) return { success: false, error: 'Company not found' }
    const isOwner = company.ownerUserId === user.id || company.ownerAppUserId === user.id
    let role: string | null = isOwner ? 'owner' : null
    if (!isOwner) {
      const m = await companyMembershipRepository.findRole(user.id, companyId)
      if (!m) return { success: false, error: 'Access denied' }
      role = m.role
    }
    if (role !== 'owner' && role !== 'admin' && role !== 'editor') {
      return { success: false, error: 'Insufficient permission' }
    }

    // Confirm the requirement actually belongs to this company.
    const req = await prisma.regulatoryRequirement.findFirst({
      where: { id: requirementId, company_id: companyId },
      select: { id: true, period_key: true, period_label: true, due_date: true },
    })
    if (!req) return { success: false, error: 'Requirement not found in this company' }

    await prisma.companyDocument.update({
      where: { id: documentId },
      data: {
        requirement_id: requirementId,
        period_key: req.period_key ?? null,
        updated_at: new Date(),
      },
    })

    // Find the latest job for this doc and flip it to linked. This
    // makes the chip disappear in the vault UI immediately.
    const latest = await prisma.documentIngestJob.findFirst({
      where: { document_id: documentId, company_id: companyId },
      orderBy: { enqueued_at: 'desc' },
      select: { id: true, result: true },
    })
    if (latest) {
      const prevResult = (latest.result || {}) as any
      await prisma.documentIngestJob.update({
        where: { id: latest.id },
        data: {
          status: 'linked',
          finished_at: new Date(),
          last_error: null,
          result: {
            ...prevResult,
            requirementId,
            linkedManually: true,
            linkedBy: user.id,
            linkedAt: new Date().toISOString(),
          } as any,
        },
      })
    }

    // Best-effort filing upsert; non-fatal if the slug-vs-uuid
    // mismatch (compliance_filings.rule_id is slug-typed) blocks it.
    if (req.period_key) {
      try {
        await upsertFiling({
          companyId,
          ruleId: requirementId,
          periodKey: req.period_key,
          financialYear: req.period_label || req.period_key,
          data: {
            status: 'filed',
            documentId,
            dueDate: req.due_date ? req.due_date.toISOString().slice(0, 10) : null,
            acknowledgement: null,
          },
          updatedBy: user.id,
        })
      } catch (filingErr) {
        console.error('[linkDocumentToRequirement] filing upsert failed (non-fatal):',
          filingErr instanceof Error ? filingErr.message : filingErr)
      }
    }

    return { success: true }
  } catch (error) {
    return handleActionError(error)
  }
}
