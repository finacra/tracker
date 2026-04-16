'use server'

import { createServerContainer } from '@/lib/composition/server-container'
import { handleActionError } from '@/lib/errors/handle-error'
import { validateCompanyId, sanitizeStringInput } from '@/lib/utils/input-validation'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { analyzeAndStoreSuggestion, type DocumentAgentSuggestion } from '@/lib/compliance/document-agent'
import { recordFact } from '@/lib/compliance/facts'
import { ensureSystemFolders, getSystemFolderId } from '@/lib/vault/folders'
import { generateEmbedding } from '@/lib/utils/embeddings'

async function assertCompanyAccess(companyId: string) {
  if (!validateCompanyId(companyId)) throw new Error('Invalid company ID')
  const { authService, companyMembershipRepository, companyRepository } = createServerContainer()
  const user = await authService.requireCurrentUser()

  const company = await companyRepository.getDetailsById(companyId)
  if (!company) throw new Error('Company not found')

  const isOwner = company.ownerUserId === user.id || company.ownerAppUserId === user.id
  let role: string | null = null
  if (!isOwner) {
    const membership = await companyMembershipRepository.findRole(user.id, companyId)
    if (!membership) throw new Error('Access denied')
    role = membership.role
  } else {
    role = 'owner'
  }
  if (role !== 'owner' && role !== 'admin' && role !== 'editor') {
    throw new Error('Insufficient permission')
  }
  return { user, company, role }
}

// ── 1. Create draft + analyze ─────────────────────────────────────────────

/**
 * Stage 1 of the agent-assisted upload flow.
 *
 * The client has already pushed the file to object storage via the
 * existing uploadFileToStorage helper. This action:
 *   - creates a draft CompanyDocument row (is_draft = true; no metadata)
 *   - kicks off content processing (OCR + chunks + embeddings)
 *   - runs the Document Intelligence Agent
 *   - persists the suggestion on the draft row
 *   - returns the suggestion for the client to show in its review UI
 *
 * Never blocks on the LLM — if the agent times out or fails, the draft
 * is still created and the user can fill fields manually via finalize.
 */
export async function uploadAndAnalyze(
  companyId: string,
  input: { filePath: string; fileName: string },
): Promise<{
  success: boolean
  documentId?: string
  suggestion?: DocumentAgentSuggestion | null
  analysisErrors?: string[]
  error?: string
}> {
  try {
    const { user } = await assertCompanyAccess(companyId)

    const cleanName = sanitizeStringInput(input.fileName, 500)
    const cleanPath = sanitizeStringInput(input.filePath, 1000)
    if (!cleanName || !cleanPath) {
      return { success: false, error: 'Invalid file name or path' }
    }

    await ensureSystemFolders(companyId)

    const draft = await prisma.companyDocument.create({
      data: {
        company_id: companyId,
        file_path: cleanPath,
        file_name: cleanName,
        is_draft: true,
        is_latest: true,
        created_by: user.id,
      },
      select: { id: true },
    })

    const analysis = await analyzeAndStoreSuggestion({
      companyId,
      documentId: draft.id,
    })

    console.log('[uploadAndAnalyze] ok', {
      documentId: draft.id,
      hasSuggestion: !!analysis.suggestion,
      errors: analysis.errors,
    })

    return {
      success: true,
      documentId: draft.id,
      suggestion: analysis.suggestion,
      analysisErrors: analysis.errors,
    }
  } catch (error) {
    console.error('[uploadAndAnalyze] threw',
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error.stack : '')
    return handleActionError(error)
  }
}

// ── 2. Finalize with confirmed metadata ──────────────────────────────────

export interface FinalizeDocumentInput {
  documentName: string                  // the "document_type" — GSTR-3B, PAN, etc.
  fileName: string                      // display file name
  folderId: string                      // FK into vault_folders
  periodType?: 'one-time' | 'monthly' | 'quarterly' | 'annual'
  periodFinancialYear?: string
  periodKey?: string
  periodStart?: string
  periodEnd?: string
  frequency?: string
  registrationDate?: string
  expiryDate?: string
  requirementId?: string                // ComplianceRule id this evidences
  isPortalRequired?: boolean
  portalEmail?: string
  portalPassword?: string
  supersedesDocumentId?: string         // link as new version of an existing doc
  persistFacts?: boolean                // default true — write agent's facts
}

export async function finalizeDocument(
  companyId: string,
  documentId: string,
  confirmed: FinalizeDocumentInput,
): Promise<{ success: boolean; documentId?: string; versionNumber?: number; error?: string }> {
  try {
    const { user } = await assertCompanyAccess(companyId)

    const draft = await prisma.companyDocument.findFirst({
      where: { id: documentId, company_id: companyId, deleted_at: null },
      select: { id: true, is_draft: true, agent_suggestions: true, file_path: true, file_name: true },
    })
    if (!draft) return { success: false, error: 'Draft not found' }

    // Validate folder belongs to this company
    const folder = await prisma.vaultFolder.findFirst({
      where: { id: confirmed.folderId, company_id: companyId },
      select: { id: true },
    })
    if (!folder) return { success: false, error: 'Target folder not found' }

    // Validate optional requirement id — if the agent hallucinated an ID
    // that doesn't exist, silently clear it rather than blocking the save.
    if (confirmed.requirementId) {
      const ruleExists = await prisma.complianceRule.findUnique({
        where: { id: confirmed.requirementId },
        select: { id: true },
      })
      if (!ruleExists) {
        console.warn('[finalizeDocument] agent-suggested requirementId not in catalogue, clearing:', confirmed.requirementId)
        confirmed.requirementId = undefined
      }
    }

    // Versioning — if supersedesDocumentId is set, mark the old doc
    // is_latest = false and chain the new one. Do it BEFORE the finalize
    // update so the version_number is correct.
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
      return { success: false, error: 'Document name and file name are required' }
    }

    await prisma.companyDocument.update({
      where: { id: draft.id },
      data: {
        is_draft: false,
        agent_suggestions: Prisma.JsonNull,
        document_type: cleanDocType,
        file_name: cleanFileName,
        folder_id: folder.id,
        folder_name: null,                      // retiring legacy column for new rows
        period_type: confirmed.periodType ?? null,
        period_financial_year: confirmed.periodFinancialYear ?? null,
        period_key: confirmed.periodKey ?? null,
        period_start: confirmed.periodStart ? new Date(confirmed.periodStart) : null,
        period_end: confirmed.periodEnd ? new Date(confirmed.periodEnd) : null,
        frequency: confirmed.frequency ?? null,
        registration_date: confirmed.registrationDate ? new Date(confirmed.registrationDate) : null,
        expiry_date: confirmed.expiryDate ? new Date(confirmed.expiryDate) : null,
        requirement_id: confirmed.requirementId ?? null,
        is_portal_required: confirmed.isPortalRequired ?? false,
        portal_email: confirmed.portalEmail ?? null,
        portal_password: confirmed.portalPassword ?? null,
        parent_document_id: parentDocumentId,
        version_number: versionNumber,
        is_latest: true,
        updated_at: new Date(),
      },
    })

    // Refresh the pgvector embedding to reflect the confirmed name —
    // Prisma doesn't type the Unsupported("vector") column so this goes
    // via raw SQL. Wrap in try/catch so an embedding failure (Azure
    // hiccup, pgvector cast edge case) can't fail the whole save after
    // the user already clicked confirm.
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
      console.error('[finalizeDocument] embedding refresh failed (non-fatal):',
        embedErr instanceof Error ? embedErr.message : embedErr)
    }

    // Persist any facts the agent emitted — only the ones still backed
    // by confirmed metadata (period must be present for the evaluator
    // to use them).
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
              createdBy: user.id,
            })
          } catch (factErr) {
            console.error('[finalizeDocument] fact persist failed (non-fatal):',
              factErr instanceof Error ? factErr.message : factErr)
          }
        }
      }
    }

    console.log('[finalizeDocument] ok', { documentId: draft.id, versionNumber })
    return { success: true, documentId: draft.id, versionNumber }
  } catch (error) {
    console.error('[finalizeDocument] threw',
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error.stack : '')
    return handleActionError(error)
  }
}

// ── 3. Discard a draft ────────────────────────────────────────────────────

export async function discardDraft(
  companyId: string,
  documentId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertCompanyAccess(companyId)
    const draft = await prisma.companyDocument.findFirst({
      where: {
        id: documentId,
        company_id: companyId,
        is_draft: true,
      },
      select: { id: true },
    })
    if (!draft) return { success: false, error: 'Draft not found' }

    // Hard delete the draft + any chunks we wrote during processing —
    // drafts carry no audit value, unlike soft-deleted finalized docs.
    await prisma.$executeRaw`
      DELETE FROM public.document_chunks_internal WHERE document_id = ${draft.id}::uuid
    `
    await prisma.companyDocument.delete({ where: { id: draft.id } })

    return { success: true }
  } catch (error) {
    return handleActionError(error)
  }
}

// ── 4. Resolve a folder slug to a folder id for this company ─────────────

export async function resolveFolderId(
  companyId: string,
  folderSlug: string,
  subFolderSlug?: string | null,
): Promise<{ success: boolean; folderId?: string | null; error?: string }> {
  try {
    await assertCompanyAccess(companyId)
    const targetSlug = subFolderSlug || folderSlug
    const id = await getSystemFolderId(companyId, targetSlug)
    return { success: true, folderId: id }
  } catch (error) {
    return handleActionError(error)
  }
}
