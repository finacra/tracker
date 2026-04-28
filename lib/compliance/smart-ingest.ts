/**
 * Smart-ingest service — the single, reusable pipeline for ingesting an
 * uploaded document and producing structured metadata + tracker linkage.
 *
 * This is the foundation for unifying upload across:
 *   • tracker upload (calls it synchronously today, surfaces a confirm UI)
 *   • vault upload   (PR B will call it asynchronously from a queue)
 *   • onboarding     (PR D will call it asynchronously for cert files)
 *
 * The service is auth-agnostic on purpose. Callers are responsible for
 * verifying the user has access to `companyId` BEFORE invoking. Every
 * function takes an explicit `userId` so it can record provenance
 * without reaching for auth context. This makes the service callable
 * from server actions, cron workers, and tests alike.
 *
 * The two entry points mirror the two-step "draft → confirm" UX:
 *   1. `analyzeAndDraft`   — create the draft row, run AI extraction,
 *                            stash the suggestion. Idempotent at the
 *                            row level (only one draft per file path).
 *   2. `finalizeIngestion` — persist confirmed metadata, embedding,
 *                            facts, and tracker filing link.
 *
 * PR A: behaviour-preserving extraction. Tracker upload still calls
 * the same code paths via thin server-action wrappers — no functional
 * change. PR B/C/D will add: requirement auto-resolution, missing-period
 * auto-generation, and async progress tracking.
 */

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { analyzeAndStoreSuggestion, type DocumentAgentSuggestion } from '@/lib/compliance/document-agent'
import { recordFact, currentIndianFY } from '@/lib/compliance/facts'
import { ensureSystemFolders } from '@/lib/vault/folders'
import { generateEmbedding } from '@/lib/utils/embeddings'
import { upsertFiling } from '@/lib/compliance/filings'
import { sanitizeStringInput } from '@/lib/utils/input-validation'

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export interface AnalyzeAndDraftInput {
  companyId: string
  userId: string
  filePath: string
  fileName: string
}

export interface AnalyzeAndDraftResult {
  documentId: string
  suggestion: DocumentAgentSuggestion | null
  errors: string[]
}

/**
 * Stage 1: create draft → run AI extraction → return suggestion.
 *
 * Never throws on AI failure. If the agent times out, the draft still
 * exists and the caller can surface a "manual entry" path. Errors are
 * accumulated in the returned `errors` array.
 */
export async function analyzeAndDraft(input: AnalyzeAndDraftInput): Promise<AnalyzeAndDraftResult> {
  const cleanName = sanitizeStringInput(input.fileName, 500)
  const cleanPath = sanitizeStringInput(input.filePath, 1000)
  if (!cleanName || !cleanPath) {
    throw new Error('Invalid file name or path')
  }

  await ensureSystemFolders(input.companyId)

  const draft = await prisma.companyDocument.create({
    data: {
      company_id: input.companyId,
      file_path: cleanPath,
      file_name: cleanName,
      is_draft: true,
      is_latest: true,
      created_by: input.userId,
    },
    select: { id: true },
  })

  const analysis = await analyzeAndStoreSuggestion({
    companyId: input.companyId,
    documentId: draft.id,
  })

  return {
    documentId: draft.id,
    suggestion: analysis.suggestion,
    errors: analysis.errors,
  }
}

export interface FinalizeIngestionInput {
  companyId: string
  userId: string
  documentId: string
  confirmed: {
    documentName: string
    fileName: string
    folderId: string
    periodType?: 'one-time' | 'monthly' | 'quarterly' | 'annual'
    periodFinancialYear?: string
    periodKey?: string
    periodStart?: string
    periodEnd?: string
    frequency?: string
    registrationDate?: string
    expiryDate?: string
    requirementId?: string
    isPortalRequired?: boolean
    portalEmail?: string
    portalPassword?: string
    supersedesDocumentId?: string
    persistFacts?: boolean
  }
}

export interface FinalizeIngestionResult {
  documentId: string
  versionNumber: number
}

/**
 * Stage 2: write confirmed metadata to the draft, refresh embedding,
 * persist agent-emitted facts, and (if requirement+period are set)
 * upsert the matching ComplianceFiling row to wire vault → tracker.
 *
 * All side-effects after the main update (embedding, facts, filing)
 * are wrapped in try/catch — they MUST NOT fail the save after the
 * user already clicked confirm. Errors logged, not thrown.
 */
export async function finalizeIngestion(input: FinalizeIngestionInput): Promise<FinalizeIngestionResult> {
  const { companyId, userId, documentId, confirmed } = input

  const draft = await prisma.companyDocument.findFirst({
    where: { id: documentId, company_id: companyId, deleted_at: null },
    select: { id: true, is_draft: true, agent_suggestions: true, file_path: true, file_name: true },
  })
  if (!draft) throw new Error('Draft not found')

  const folder = await prisma.vaultFolder.findFirst({
    where: { id: confirmed.folderId, company_id: companyId },
    select: { id: true, name: true },
  })
  if (!folder) throw new Error('Target folder not found')

  // Two ID spaces converge here. ComplianceRule.id is a slug
  // ("dir3-kyc-annual"). CompanyDocument.requirement_id is @db.Uuid
  // pointing at RegulatoryRequirement.id. Writing a slug into the UUID
  // column blows up Prisma. Accept only UUIDs that resolve to a row
  // owned by this company; clear otherwise.
  let requirementId = confirmed.requirementId
  if (requirementId) {
    if (!UUID_RE.test(requirementId)) {
      console.warn('[smart-ingest] requirementId is not a UUID, clearing:', requirementId)
      requirementId = undefined
    } else {
      const req = await prisma.regulatoryRequirement.findFirst({
        where: { id: requirementId, company_id: companyId },
        select: { id: true },
      }).catch(() => null)
      if (!req) {
        console.warn('[smart-ingest] requirementId UUID not in this company, clearing:', requirementId)
        requirementId = undefined
      }
    }
  }

  // Versioning — chain new doc as a new version of supersedes target.
  let versionNumber = 1
  let parentDocumentId: string | null = null
  if (confirmed.supersedesDocumentId) {
    const previous = await prisma.companyDocument.findFirst({
      where: {
        id: confirmed.supersedesDocumentId,
        company_id: companyId,
        deleted_at: null,
      },
      select: { id: true, version_number: true },
    })
    if (previous) {
      versionNumber = (previous.version_number || 1) + 1
      parentDocumentId = previous.id
      await prisma.companyDocument.update({
        where: { id: previous.id },
        data: { is_latest: false, updated_at: new Date() },
      })
    }
  }

  const cleanDocType = sanitizeStringInput(confirmed.documentName, 500)
  const cleanFileName = sanitizeStringInput(confirmed.fileName, 500)
  if (!cleanDocType || !cleanFileName) {
    throw new Error('Document name and file name are required')
  }

  await prisma.companyDocument.update({
    where: { id: draft.id },
    data: {
      is_draft: false,
      agent_suggestions: Prisma.JsonNull,
      document_type: cleanDocType,
      file_name: cleanFileName,
      folder_id: folder.id,
      folder_name: folder.name,
      period_type: confirmed.periodType ?? null,
      period_financial_year: confirmed.periodFinancialYear ?? null,
      period_key: confirmed.periodKey ?? null,
      period_start: confirmed.periodStart ? new Date(confirmed.periodStart) : null,
      period_end: confirmed.periodEnd ? new Date(confirmed.periodEnd) : null,
      frequency: confirmed.frequency ?? null,
      registration_date: confirmed.registrationDate ? new Date(confirmed.registrationDate) : null,
      expiry_date: confirmed.expiryDate ? new Date(confirmed.expiryDate) : null,
      requirement_id: requirementId ?? null,
      is_portal_required: confirmed.isPortalRequired ?? false,
      portal_email: confirmed.portalEmail ?? null,
      portal_password: confirmed.portalPassword ?? null,
      parent_document_id: parentDocumentId,
      version_number: versionNumber,
      is_latest: true,
      updated_at: new Date(),
    },
  })

  // Embedding refresh — non-fatal.
  try {
    const embedding = await generateEmbedding(`${cleanDocType} ${cleanFileName}`)
    if (embedding.length > 0) {
      const vectorLiteral = `[${embedding.join(',')}]`
      await prisma.$executeRaw`
        UPDATE public.company_documents_internal
        SET embedding = ${vectorLiteral}::vector
        WHERE id = ${draft.id}::uuid
      `
    }
  } catch (embedErr) {
    console.error('[smart-ingest] embedding refresh failed (non-fatal):',
      embedErr instanceof Error ? embedErr.message : embedErr)
  }

  // Persist agent-emitted facts — non-fatal per fact.
  if (confirmed.persistFacts !== false && draft.agent_suggestions) {
    const suggestion = draft.agent_suggestions as unknown as DocumentAgentSuggestion
    if (Array.isArray(suggestion?.facts)) {
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
            sourceDocId: draft.id,
            confidence: f.confidence,
            createdBy: userId,
          })
        } catch (factErr) {
          console.error('[smart-ingest] fact persist failed (non-fatal):',
            factErr instanceof Error ? factErr.message : factErr)
        }
      }
    }
  }

  // Vault → Tracker wiring: requirement + period set → upsert filing.
  if (requirementId && (confirmed.periodKey || confirmed.periodFinancialYear)) {
    try {
      const fy = confirmed.periodFinancialYear || currentIndianFY()
      const pk = confirmed.periodKey || fy
      await upsertFiling({
        companyId,
        ruleId: requirementId,
        periodKey: pk,
        financialYear: fy,
        data: {
          status: 'filed',
          dateOfFiling: confirmed.registrationDate || new Date().toISOString().slice(0, 10),
          documentId: draft.id,
          acknowledgement: null,
          dueDate: null,
        },
        updatedBy: userId,
      })
    } catch (filingErr) {
      console.error('[smart-ingest] filing upsert failed (non-fatal):',
        filingErr instanceof Error ? filingErr.message : filingErr)
    }
  }

  return { documentId: draft.id, versionNumber }
}
