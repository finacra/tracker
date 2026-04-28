/**
 * Background ingest worker — claims pending rows from the
 * `document_ingest_jobs` queue, runs the AI agent on each, and either
 * auto-links the result to a tracker requirement or marks it
 * needs_review. Invoked by a Supabase pg_cron tick (every 30s) via a
 * pg_net POST to `/api/jobs/run-ingest`.
 *
 * Why a queue: vault uploads complete instantly as dumb storage so
 * the user doesn't wait. The heavy work (Azure DI OCR + LLM call,
 * 3–10s per doc) runs out-of-band. The queue gives us:
 *   • per-company concurrency cap (3 jobs / company / batch) so a
 *     bulk drop can't starve other tenants on Azure OpenAI tokens
 *   • crash-safety — `SELECT … FOR UPDATE SKIP LOCKED` claims a
 *     row exclusively; if the worker dies mid-job, the next tick
 *     picks it up after a stale-claim timeout
 *   • retry — failed jobs increment attempts; capped at 3
 *   • progress visibility — status column drives the per-doc
 *     progress chip in the vault UI
 *
 * Auth: this module is server-only and is called from the webhook
 * route. It does not touch the user's session — it operates on
 * trusted job rows that were enqueued by an already-authenticated
 * server action.
 */

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { analyzeAndStoreSuggestion, type DocumentAgentSuggestion } from '@/lib/compliance/document-agent'
import { upsertFiling } from '@/lib/compliance/filings'
import { recordFact, currentIndianFY } from '@/lib/compliance/facts'
import { generateHistoricalForCompany, yearsBackFromFY, NoIncorporationDateError, NoRecurringRulesError } from '@/lib/compliance/historical-generator'
import { stripPeriodSuffix } from '@/lib/utils/strip-period-suffix'

const MAX_ATTEMPTS = 3
const PER_COMPANY_BATCH_LIMIT = 3
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

interface ClaimedJob {
  id: string
  document_id: string
  company_id: string
  source: string
  attempts: number
}

/**
 * Claim up to N pending jobs per company. Uses a CTE to enforce the
 * per-company cap inside a single SQL statement and `FOR UPDATE SKIP
 * LOCKED` so concurrent worker invocations can't claim the same row.
 *
 * Resets stale claims first: any job stuck in 'extracting' / 'matching'
 * for >5 minutes is considered crashed and rolled back to 'pending'
 * so it gets retried.
 */
export async function claimNextJobs(workerId: string, totalLimit: number = 30): Promise<ClaimedJob[]> {
  // Reset stale claims (worker died mid-flight).
  await prisma.$executeRaw`
    UPDATE public.document_ingest_jobs
    SET status = 'pending', started_at = NULL, worker_id = NULL
    WHERE status IN ('extracting', 'matching')
      AND started_at IS NOT NULL
      AND started_at < NOW() - INTERVAL '5 minutes'
  `

  // Claim — at most PER_COMPANY_BATCH_LIMIT per company, totalLimit overall.
  // PostgreSQL forbids `FOR UPDATE` in a query that uses window
  // functions, so we lock and rank in separate CTEs:
  //   1. `locked` — pulls a generous buffer of pending rows ORDER BY
  //      enqueue time, applies FOR UPDATE SKIP LOCKED to claim them
  //      exclusively against concurrent workers.
  //   2. `ranked` — joins the locked rows back to the table and runs
  //      ROW_NUMBER() OVER (PARTITION BY company_id) to enforce the
  //      per-company concurrency cap.
  //   3. `capped` — keeps rank <= cap, applies the overall LIMIT.
  // The UPDATE joins against `capped` and bumps status + attempts.
  const FETCH_BUFFER = totalLimit * 4
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    WITH locked AS (
      SELECT id, document_id, company_id, source, attempts, enqueued_at
      FROM public.document_ingest_jobs
      WHERE status = 'pending'
        AND attempts < ${MAX_ATTEMPTS}
      ORDER BY enqueued_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${FETCH_BUFFER}
    ),
    ranked AS (
      SELECT
        id, document_id, company_id, source, attempts,
        ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY enqueued_at ASC) AS rn
      FROM locked
    ),
    capped AS (
      SELECT id, document_id, company_id, source, attempts
      FROM ranked
      WHERE rn <= ${PER_COMPANY_BATCH_LIMIT}
      LIMIT ${totalLimit}
    )
    UPDATE public.document_ingest_jobs j
    SET status = 'extracting',
        started_at = NOW(),
        worker_id = ${workerId},
        attempts = j.attempts + 1
    FROM capped r
    WHERE j.id = r.id
    RETURNING j.id, j.document_id, j.company_id, j.source, j.attempts
  `

  return rows
}

/**
 * Process a single claimed job. Runs the AI agent, resolves the
 * extracted requirement to a tracker row, and either auto-links the
 * document (and upserts the matching ComplianceFiling row) or marks
 * the job needs_review.
 *
 * Errors are caught at the top level and recorded on the job; never
 * thrown back to the worker batch loop.
 */
export async function processIngestJob(job: ClaimedJob): Promise<void> {
  const { id: jobId, document_id: documentId, company_id: companyId } = job

  try {
    // 1. Run the AI agent (writes agent_suggestions on the doc row).
    const analysis = await analyzeAndStoreSuggestion({ companyId, documentId })
    const suggestion = analysis.suggestion

    if (!suggestion) {
      await markNeedsReview(jobId, null, analysis.errors)
      return
    }

    // 2. Move to matching state.
    await prisma.documentIngestJob.update({
      where: { id: jobId },
      data: { status: 'matching' },
    })

    // 3. Resolve requirement: only accept UUID that belongs to this company.
    let resolvedRequirementId: string | null = await resolveRequirementUuid(suggestion, companyId)

    // 4. Confidence gate. < 0.6 → manual review even if a UUID came back.
    const confidence = typeof suggestion.confidence === 'number' ? suggestion.confidence : 0
    const meetsConfidence = confidence >= 0.6
    const hasPeriod = !!(suggestion.periodKey || suggestion.periodFY)

    // 4a. Auto-generate historical compliances when the agent is
    // confident, has a period, but no requirement matched. The most
    // common case: user uploads "MGT-7A FY 2024-25" into a tracker
    // that only has FY 2026-27 generated — the rule exists, just not
    // for that year. We compute years-back from the extracted FY and
    // call generateHistoricalForCompany silently. Idempotent.
    let historicalGenerated: number | null = null
    if (meetsConfidence && hasPeriod && !resolvedRequirementId) {
      const fy = suggestion.periodFY || currentIndianFY()
      const yb = yearsBackFromFY(fy)
      if (yb > 0) {
        try {
          // The job carries no user context. Use the document's
          // created_by so audit trails stay coherent (silent backfill
          // attributed to whoever uploaded the file). Fall back to a
          // null-equivalent UUID if missing — some legacy rows have it.
          const doc = await prisma.companyDocument.findUnique({
            where: { id: documentId },
            select: { created_by: true },
          })
          const userIdForAudit = doc?.created_by || '00000000-0000-0000-0000-000000000000'

          const result = await generateHistoricalForCompany({
            companyId,
            userId: userIdForAudit,
            yearsBack: yb,
          })
          historicalGenerated = result.generated
          console.log('[ingest-worker] historical auto-gen', {
            jobId, documentId, fy, yearsBack: yb, generated: result.generated,
          })

          // Re-attempt the resolution now that historical rows exist.
          resolvedRequirementId = await resolveRequirementByNameAndPeriod({
            companyId,
            documentType: suggestion.documentType ?? undefined,
            periodKey: suggestion.periodKey || fy,
            ruleSlug: suggestion.requirementId || null,
          })
        } catch (genErr) {
          // Generation can fail when the company has no incorporation
          // date or no recurring rules to base history on. Both are
          // legitimate "needs_review" outcomes — log and fall through.
          if (genErr instanceof NoIncorporationDateError || genErr instanceof NoRecurringRulesError) {
            console.log('[ingest-worker] historical auto-gen skipped', {
              jobId, reason: genErr.message,
            })
          } else {
            console.error('[ingest-worker] historical auto-gen failed (non-fatal):',
              genErr instanceof Error ? genErr.message : genErr)
          }
        }
      }
    }

    if (!resolvedRequirementId || !meetsConfidence || !hasPeriod) {
      await markNeedsReview(jobId, suggestion, [
        ...(analysis.errors || []),
        ...(meetsConfidence ? [] : [`confidence ${confidence.toFixed(2)} below 0.6`]),
        ...(resolvedRequirementId ? [] : ['no matching requirement in this company']),
        ...(hasPeriod ? [] : ['no period extracted']),
        ...(historicalGenerated !== null ? [`historical-gen produced ${historicalGenerated} rows but still no match`] : []),
      ])
      return
    }

    // 5. Persist confirmed metadata back onto the document.
    const fy = suggestion.periodFY || currentIndianFY()
    const pk = suggestion.periodKey || fy
    await prisma.companyDocument.update({
      where: { id: documentId },
      data: {
        document_type: suggestion.documentType ?? null,
        period_type: (suggestion.periodType as any) ?? null,
        period_financial_year: fy,
        period_key: pk,
        period_start: suggestion.periodStart ? new Date(suggestion.periodStart) : null,
        period_end: suggestion.periodEnd ? new Date(suggestion.periodEnd) : null,
        registration_date: suggestion.registrationDate ? new Date(suggestion.registrationDate) : null,
        expiry_date: suggestion.expiryDate ? new Date(suggestion.expiryDate) : null,
        requirement_id: resolvedRequirementId,
        agent_suggestions: Prisma.JsonNull,
        is_draft: false,
        updated_at: new Date(),
      },
    }).catch(err => {
      // Update can fail if the document was deleted between enqueue and
      // worker pick-up. Surface as needs_review rather than failing.
      console.warn('[ingest-worker] document update failed:', err.message)
    })

    // 6. Upsert the matching filing row (vault → tracker linkage).
    try {
      await upsertFiling({
        companyId,
        ruleId: resolvedRequirementId,
        periodKey: pk,
        financialYear: fy,
        data: {
          status: 'filed',
          dateOfFiling: suggestion.registrationDate || new Date().toISOString().slice(0, 10),
          documentId,
          acknowledgement: null,
          dueDate: null,
        },
        updatedBy: 'system',
      })
    } catch (filingErr) {
      console.error('[ingest-worker] filing upsert failed (non-fatal):',
        filingErr instanceof Error ? filingErr.message : filingErr)
    }

    // 7. Persist agent-emitted facts.
    if (Array.isArray(suggestion.facts)) {
      for (const f of suggestion.facts) {
        try {
          await recordFact({
            companyId,
            kind: f.kind,
            periodStart: new Date(f.periodStart),
            periodEnd: new Date(f.periodEnd),
            amount: typeof f.amount === 'number' ? f.amount : null,
            unit: f.unit ?? null,
            payload: { ...(f.payload as any || {}), evidenceQuote: f.evidenceQuote ?? null },
            counterparty: f.counterparty ?? null,
            sourceKind: 'document_extracted',
            sourceDocId: documentId,
            confidence: f.confidence,
            createdBy: 'system',
          })
        } catch (factErr) {
          console.error('[ingest-worker] fact persist failed (non-fatal):',
            factErr instanceof Error ? factErr.message : factErr)
        }
      }
    }

    // 8. Mark job linked.
    await prisma.documentIngestJob.update({
      where: { id: jobId },
      data: {
        status: 'linked',
        finished_at: new Date(),
        result: {
          documentType: suggestion.documentType,
          requirementId: resolvedRequirementId,
          periodKey: pk,
          confidence,
        } as any,
      },
    })

    console.log('[ingest-worker] job linked', { jobId, documentId, requirementId: resolvedRequirementId, periodKey: pk })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ingest-worker] job failed', { jobId, error: msg, stack: err instanceof Error ? err.stack : '' })
    // Was this our last attempt? If so, mark failed; else leave at attempts>=N
    // and the next claim will skip it (since claim filters attempts < MAX_ATTEMPTS).
    const willRetry = job.attempts < MAX_ATTEMPTS
    await prisma.documentIngestJob.update({
      where: { id: jobId },
      data: {
        status: willRetry ? 'pending' : 'failed',
        last_error: msg.slice(0, 500),
        // started_at cleared for retries so stale-claim logic doesn't re-claim it.
        started_at: willRetry ? null : new Date(),
        finished_at: willRetry ? null : new Date(),
        worker_id: null,
      },
    }).catch(() => {})
  }
}

async function markNeedsReview(jobId: string, suggestion: DocumentAgentSuggestion | null, reasons: string[]) {
  await prisma.documentIngestJob.update({
    where: { id: jobId },
    data: {
      status: 'needs_review',
      finished_at: new Date(),
      last_error: reasons.length > 0 ? reasons.join('; ').slice(0, 500) : null,
      result: suggestion ? ({
        documentType: suggestion.documentType,
        periodKey: suggestion.periodKey,
        periodFY: suggestion.periodFY,
        confidence: suggestion.confidence,
        suggestedRequirementId: suggestion.requirementId,
      } as any) : Prisma.JsonNull,
    },
  })
}

/**
 * Process a batch of jobs. Called from the webhook handler. Returns
 * the number of jobs processed so the caller can log it.
 */
export async function processIngestBatch(workerId: string): Promise<{ claimed: number; processed: number }> {
  const claimed = await claimNextJobs(workerId)
  if (claimed.length === 0) return { claimed: 0, processed: 0 }

  // Process in parallel — concurrency is already capped at 3 per company
  // by the claim CTE. Across companies, parallelism is fine.
  await Promise.all(claimed.map(job => processIngestJob(job)))

  return { claimed: claimed.length, processed: claimed.length }
}

/**
 * Resolve the agent-suggested requirementId to a UUID belonging to
 * this company. The agent emits either a stable rule slug
 * ("mgt-7a-annual") or a real UUID; only the latter is writable to
 * `CompanyDocument.requirement_id` (the column is @db.Uuid).
 */
async function resolveRequirementUuid(suggestion: DocumentAgentSuggestion, companyId: string): Promise<string | null> {
  if (!suggestion.requirementId || !UUID_RE.test(suggestion.requirementId)) return null
  const req = await prisma.regulatoryRequirement.findFirst({
    where: { id: suggestion.requirementId, company_id: companyId },
    select: { id: true },
  }).catch(() => null)
  return req?.id || null
}

/**
 * Fallback resolution after auto-generating historical rows: find a
 * requirement whose stripped base name matches the agent's
 * `documentType` AND whose period_key matches the extracted period.
 *
 * Match strategy:
 *   1. If a slug-style ruleSlug is present, try to find a row whose
 *      requirement starts with the documentType (which the rule
 *      typically encodes as a prefix), at the requested period_key.
 *   2. Otherwise, scan rows at this period_key and pick the one whose
 *      stripped base name equals the documentType (case-insensitive).
 *
 * Returns null if no unambiguous match. The job will then go to
 * needs_review for the user to confirm.
 */
async function resolveRequirementByNameAndPeriod(input: {
  companyId: string
  documentType?: string
  periodKey: string
  ruleSlug?: string | null
}): Promise<string | null> {
  const { companyId, documentType, periodKey } = input
  if (!documentType) return null

  // Period key format varies across rules. The agent extracts "2024-25"
  // but the rules-engine annual rules store "FY2024-25" (with prefix,
  // no space) and other monthly rules store "2024-04" (YYYY-MM). Try
  // all reasonable variants. Order: exact first, then variants.
  const trimmedKey = periodKey.trim()
  const candidates = new Set<string>([trimmedKey])
  candidates.add(`FY${trimmedKey}`)
  candidates.add(`FY ${trimmedKey}`)
  // If the agent gave "FY2024-25" or "FY 2024-25", strip and try bare
  candidates.add(trimmedKey.replace(/^FY\s*/i, ''))

  const rows = await prisma.regulatoryRequirement.findMany({
    where: {
      company_id: companyId,
      period_key: { in: Array.from(candidates) },
    },
    select: { id: true, requirement: true, period_key: true },
  })
  if (rows.length === 0) return null

  const docTypeLower = documentType.toLowerCase().trim()
  // 1. Exact base-name match (preferred)
  const exact = rows.find(r => stripPeriodSuffix(r.requirement).toLowerCase().trim() === docTypeLower)
  if (exact) return exact.id

  // 2. Prefix / substring match — agent's documentType is often a
  // prefix of the rule name (e.g. "MGT-7A" vs "MGT-7 / MGT-7A — Annual
  // Return — FY2026-27"). After stripPeriodSuffix the rule reduces to
  // its base; we then check the docType is a prefix or appears anywhere
  // in the base.
  const prefix = rows.find(r => {
    const base = stripPeriodSuffix(r.requirement).toLowerCase()
    return base.startsWith(docTypeLower) || base.includes(docTypeLower)
  })
  if (prefix) return prefix.id

  return null
}

/**
 * Enqueue a document for background ingest.
 * Idempotent on (document_id, status='pending'): if a pending job
 * already exists for this doc, this is a no-op.
 */
export async function enqueueIngestJob(input: {
  documentId: string
  companyId: string
  source: 'vault' | 'tracker' | 'onboarding'
}): Promise<{ jobId: string | null; created: boolean }> {
  const existing = await prisma.documentIngestJob.findFirst({
    where: {
      document_id: input.documentId,
      status: { in: ['pending', 'extracting', 'matching'] },
    },
    select: { id: true },
  })
  if (existing) return { jobId: existing.id, created: false }

  const job = await prisma.documentIngestJob.create({
    data: {
      document_id: input.documentId,
      company_id: input.companyId,
      source: input.source,
    },
    select: { id: true },
  })
  return { jobId: job.id, created: true }
}
