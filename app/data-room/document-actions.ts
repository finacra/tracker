'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { validateCompanyId, sanitizeStringInput, isValidUUID } from '@/lib/utils/input-validation'
import { generateEmbedding } from '@/lib/utils/embeddings'
import { processDocumentContent } from '@/lib/utils/document-processor'
import { createServerContainer } from '@/lib/composition/server-container'

async function requireCurrentUser() {
  const { authService } = createServerContainer()
  return authService.requireCurrentUser()
}

/**
 * Role gate for any DOC-MUTATING action (upload / delete / storage
 * write). Previously these routes only checked requireCurrentUser() or
 * accessService.hasAccess — both of which return true for viewers.
 * That meant a viewer could upload and delete documents from the
 * tracker and the vault. This helper is the single source of truth for
 * who is allowed to mutate company documents.
 */
async function assertCanMutateCompanyDocs(companyId: string) {
  if (!validateCompanyId(companyId)) {
    throw new Error('Invalid company ID format')
  }
  const { authService, companyRepository, companyMembershipRepository } = createServerContainer()
  const user = await authService.requireCurrentUser()
  const company = await companyRepository.getDetailsById(companyId)
  if (!company) throw new Error('Company not found')

  const isOwner = company.ownerUserId === user.id || company.ownerAppUserId === user.id
  let role: string | null = isOwner ? 'owner' : null
  if (!isOwner) {
    const membership = await companyMembershipRepository.findRole(user.id, companyId)
    if (!membership) throw new Error('Access denied to this company')
    role = membership.role
  }
  if (role !== 'owner' && role !== 'admin' && role !== 'editor') {
    throw new Error('Insufficient permission — only owners / admins / editors can modify documents')
  }
  return { user, role }
}

export async function uploadDocument(
  companyId: string,
  data: {
    folderName: string
    folderId?: string | null
    documentName: string
    registrationDate?: string
    expiryDate?: string
    isPortalRequired: boolean
    portalEmail?: string
    portalPassword?: string
    frequency: string
    filePath: string
    fileName: string
    // New period metadata fields
    periodType?: 'one-time' | 'monthly' | 'quarterly' | 'annual'
    periodFinancialYear?: string
    periodKey?: string
    periodStart?: string
    periodEnd?: string
    requirementId?: string
  }
) {
  // SECURITY: Validate companyId to prevent injection
  if (!validateCompanyId(companyId)) {
    throw new Error('Invalid company ID format')
  }

  // SECURITY: Sanitize string inputs
  const sanitizedFolderName = sanitizeStringInput(data.folderName, 500)
  const sanitizedDocumentName = sanitizeStringInput(data.documentName, 500)
  const sanitizedFileName = sanitizeStringInput(data.fileName, 500)

  if (!sanitizedFolderName || !sanitizedDocumentName || !sanitizedFileName) {
    throw new Error('Invalid input: folder name, document name, or file name contains invalid characters')
  }

  // SECURITY: editor role required. Previously this was only
  // hasAccess, which let viewers upload.
  const { user } = await assertCanMutateCompanyDocs(companyId)
  void user
  const { documentRepository } = createServerContainer()

  const embedding = await generateEmbedding(`${sanitizedDocumentName} ${sanitizedFileName}`)

  const [insertedDoc] = await documentRepository.createCompanyDocuments([{
    companyId,
    documentType: sanitizedDocumentName,
    folderName: sanitizedFolderName,
    folderId: data.folderId ?? null,
    registrationDate: data.registrationDate || null,
    expiryDate: data.expiryDate || null,
    isPortalRequired: data.isPortalRequired,
    portalEmail: data.portalEmail || null,
    portalPassword: data.portalPassword || null,
    frequency: data.frequency,
    filePath: data.filePath,
    fileName: sanitizedFileName,
    embedding: embedding.length > 0 ? embedding : null,
    periodType: data.periodType || null,
    periodFinancialYear: data.periodFinancialYear || null,
    periodKey: data.periodKey || null,
    periodStart: data.periodStart || null,
    periodEnd: data.periodEnd || null,
    requirementId: data.requirementId || null,
  }])

  // Trigger content processing in background
  if (insertedDoc) {
    processDocumentContent(insertedDoc.id, companyId, insertedDoc.filePath).catch(err =>
      console.error(`Async processing failed for ${insertedDoc.id}:`, err)
    )
  }

  return { success: true, documentId: insertedDoc?.id }
}

/**
 * Re-index a document that failed processing (e.g., scanned PDFs uploaded before OCR was added).
 * Deletes any existing stale chunks then re-runs the full extraction + embedding pipeline.
 */
export async function reprocessDocument(documentId: string) {
  if (!isValidUUID(documentId)) throw new Error('Invalid document ID')

  const { authService } = createServerContainer()
  await authService.requireCurrentUser()

  const supabase = createAdminClient()

  // Look up the document directly
  const { data: doc, error } = await supabase
    .from('company_documents_internal')
    .select('id, company_id, file_path')
    .eq('id', documentId)
    .single()

  if (error || !doc) throw new Error('Document not found')
  const row = doc as { id: string; company_id: string; file_path: string }

  // Delete existing (failed) chunks so we don't get duplicates
  await supabase.from('document_chunks_internal').delete().eq('document_id', documentId)

  // Re-run processing — OCR fallback is now in the pipeline
  await processDocumentContent(row.id, row.company_id, row.file_path)

  return { success: true }
}

export async function uploadFileToStorage(filePath: string, fileData: ArrayBuffer, contentType: string) {
  try {
    // SECURITY: file paths in this app fall into one of two shapes:
    //   (a) Onboarding — "{userId}/{timestamp}/{filename}". The company
    //       doesn't exist yet; we can only check the path starts with
    //       the current user's id and reject anything else. Without
    //       this carve-out, company creation can never succeed because
    //       the doc-upload step has no companyId to role-check against.
    //   (b) Tracker / vault — "{companyId}/...". We derive the company
    //       from the first segment and require owner / admin / editor
    //       role on it.
    const sanitizedFilePath = sanitizeStringInput(filePath, 1000)
    if (!sanitizedFilePath) throw new Error('Invalid file path')

    const segments = sanitizedFilePath.split('/').filter(Boolean)
    const { companyRepository, authService, companyMembershipRepository } = createServerContainer()
    const user = await authService.requireCurrentUser()

    // (a) Onboarding path — first segment is the caller's own userId.
    const firstSeg = segments[0]
    if (firstSeg && (firstSeg === user.id || firstSeg === (user as any).canonicalId)) {
      const { createStorageAdapter } = await import('@/lib/storage/factory')
      const storage = createStorageAdapter()
      await storage.uploadFile('company-documents', sanitizedFilePath, fileData, {
        contentType: contentType,
        upsert: false,
      })
      return { success: true }
    }

    // (b) Company-scoped path — locate the companyId (first or second
    // segment) and require editor role.
    let resolvedCompanyId: string | null = null
    for (const seg of segments.slice(0, 2)) {
      if (validateCompanyId(seg)) {
        const company = await companyRepository.getDetailsById(seg)
        if (company) { resolvedCompanyId = seg; break }
      }
    }
    if (!resolvedCompanyId) throw new Error('Invalid upload path — no company in scope')

    const company = await companyRepository.getDetailsById(resolvedCompanyId)
    if (!company) throw new Error('Company not found')
    const isOwner = company.ownerUserId === user.id || company.ownerAppUserId === user.id
    let role: string | null = isOwner ? 'owner' : null
    if (!isOwner) {
      const membership = await companyMembershipRepository.findRole(user.id, resolvedCompanyId)
      if (!membership) throw new Error('Access denied to this company')
      role = membership.role
    }
    if (role !== 'owner' && role !== 'admin' && role !== 'editor') {
      throw new Error('Insufficient permission — viewers cannot upload files')
    }

    const { createStorageAdapter } = await import('@/lib/storage/factory')
    const storage = createStorageAdapter()
    await storage.uploadFile('company-documents', sanitizedFilePath, fileData, {
      contentType: contentType,
      upsert: false,
    })
    return { success: true }
  } catch (err) {
    console.error('Error uploading file to storage:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Something went wrong' }
  }
}

export async function getDownloadUrl(filePath: string) {
  try {
    await requireCurrentUser()

    // Create signed URL using storage adapter
    const { createStorageAdapter } = await import('@/lib/storage/factory')
    const storage = createStorageAdapter()
    const signedUrl = await storage.createSignedUrl('company-documents', filePath, 3600) // 1 hour expiry for preview
    
    return { success: true, url: signedUrl }
  } catch (err) {
    console.error('Error creating signed URL:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Something went wrong' }
  }
}

export async function deleteDocument(documentId: string, filePath: string) {
  try {
    // SECURITY: Validate documentId to prevent injection
    if (!isValidUUID(documentId)) {
      throw new Error('Invalid document ID format')
    }

    // SECURITY: Sanitize filePath
    const sanitizedFilePath = sanitizeStringInput(filePath, 1000)
    if (!sanitizedFilePath) {
      throw new Error('Invalid file path')
    }

    // SECURITY: resolve the owning company for this document and gate
    // on editor role. Previously any logged-in user could delete any
    // document by calling this action with a known documentId.
    const { prisma } = await import('@/lib/prisma')
    const doc = await prisma.companyDocument.findFirst({
      where: { id: documentId },
      select: { company_id: true },
    })
    if (!doc) throw new Error('Document not found')
    await assertCanMutateCompanyDocs(doc.company_id)

    const { documentRepository } = createServerContainer()

    // 1. Delete from Storage
    const { createStorageAdapter } = await import('@/lib/storage/factory')
    const storage = createStorageAdapter()
    try {
      await storage.deleteFile('company-documents', [sanitizedFilePath])
    } catch (storageError) {
      console.error('Storage deletion error:', storageError)
      // Continue anyway to try and clean up metadata
    }

    // 2. Delete from Metadata table
    await documentRepository.deleteCompanyDocument(documentId)

    return { success: true }
  } catch (err) {
    console.error('Error deleting document:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Something went wrong' }
  }
}

export async function getDocumentTemplates() {
  try {
    const { documentRepository } = createServerContainer()
    const templates = await documentRepository.getTemplateMappings()
    return {
      success: true,
      templates: templates.map(template => ({
        document_name: template.documentName,
        folder_name: template.folderName,
        default_frequency: template.defaultFrequency,
      })),
    }
  } catch (err) {
    console.error('Error fetching templates:', err)
    if ((err as any)?.code === 'PGRST106' || (err instanceof Error && err.message?.includes('does not exist'))) {
      return { success: true, templates: [] }
    }
    return { success: false, templates: [] }
  }
}

export async function getCompanyDocuments(companyId: string) {
  try {
    // SECURITY: Validate companyId to prevent injection
    if (!validateCompanyId(companyId)) {
      return { success: false, documents: [], error: 'Invalid company ID format' }
    }

    const { documentRepository, authService, accessService } = createServerContainer()

    // Check authentication
    const user = await authService.getCurrentUser()
    if (!user) {
      return { success: false, documents: [], error: 'Unauthorized' }
    }

    // Check access to company
    const accessSnapshot = await accessService.getCompanyAccessSnapshot(user.id, companyId)
    if (!accessSnapshot.hasAccess) {
      return { success: false, documents: [], error: 'Access denied to this company' }
    }

    const documents = await documentRepository.getCompanyDocuments(companyId)
    
    return {
      success: true,
      documents: documents.map(document => ({
        id: document.id,
        company_id: document.companyId,
        document_type: document.documentType,
        folder_name: document.folderName,
        file_path: document.filePath,
        file_name: document.fileName,
        created_at: document.createdAt,
        registration_date: document.registrationDate || null,
        expiry_date: document.expiryDate || null,
        period_type: document.periodType || null,
        period_financial_year: document.periodFinancialYear || null,
        period_key: document.periodKey || null,
        period_start: document.periodStart || null,
        period_end: document.periodEnd || null,
        requirement_id: document.requirementId || null,
      })),
    }
  } catch (err) {
    console.error('[getCompanyDocuments] Error:', err)
    if ((err as any)?.code === 'PGRST106' || (err instanceof Error && err.message?.includes('does not exist'))) {
      return { success: true, documents: [], warning: 'Storage table not found' }
    }
    return { success: false, error: err instanceof Error ? err.message : 'Something went wrong', documents: [] }
  }
}
