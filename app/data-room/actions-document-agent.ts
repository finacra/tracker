'use server'

import { createServerContainer } from '@/lib/composition/server-container'
import { handleActionError } from '@/lib/errors/handle-error'
import { validateCompanyId } from '@/lib/utils/input-validation'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { type DocumentAgentSuggestion } from '@/lib/compliance/document-agent'
import { getSystemFolderId } from '@/lib/vault/folders'
import { analyzeAndDraft, finalizeIngestion } from '@/lib/compliance/smart-ingest'

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
    const result = await analyzeAndDraft({
      companyId,
      userId: user.id,
      filePath: input.filePath,
      fileName: input.fileName,
    })
    console.log('[uploadAndAnalyze] ok', {
      documentId: result.documentId,
      hasSuggestion: !!result.suggestion,
      errors: result.errors,
    })
    return {
      success: true,
      documentId: result.documentId,
      suggestion: result.suggestion,
      analysisErrors: result.errors,
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
    const result = await finalizeIngestion({
      companyId,
      userId: user.id,
      documentId,
      confirmed,
    })
    console.log('[finalizeDocument] ok', {
      documentId: result.documentId,
      versionNumber: result.versionNumber,
    })
    return { success: true, documentId: result.documentId, versionNumber: result.versionNumber }
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
