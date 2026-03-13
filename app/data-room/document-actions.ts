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

export async function uploadDocument(
  companyId: string,
  data: {
    folderName: string
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

  const { documentRepository } = createServerContainer()
  await requireCurrentUser()

  const embedding = await generateEmbedding(`${sanitizedDocumentName} ${sanitizedFileName}`)

  const [insertedDoc] = await documentRepository.createCompanyDocuments([{
    companyId,
    documentType: sanitizedDocumentName,
    folderName: sanitizedFolderName,
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

export async function uploadFileToStorage(filePath: string, fileData: ArrayBuffer, contentType: string) {
  try {
    await requireCurrentUser()

    // SECURITY: Sanitize filePath
    const sanitizedFilePath = sanitizeStringInput(filePath, 1000)
    if (!sanitizedFilePath) {
      throw new Error('Invalid file path')
    }

    // Use admin client to bypass RLS for Passport users
    const adminSupabase = createAdminClient()

    const { error: uploadError } = await adminSupabase.storage
      .from('company-documents')
      .upload(sanitizedFilePath, fileData, {
        contentType: contentType,
        upsert: false, // Don't overwrite existing files
      })

    if (uploadError) throw uploadError
    return { success: true }
  } catch (err: any) {
    console.error('Error uploading file to storage:', err)
    return { success: false, error: err.message }
  }
}

export async function getDownloadUrl(filePath: string) {
  try {
    await requireCurrentUser()

    // Use admin client to bypass RLS for Passport users
    const adminSupabase = createAdminClient()

    const { data, error } = await adminSupabase.storage
      .from('company-documents')
      .createSignedUrl(filePath, 3600) // 1 hour expiry for preview

    if (error) throw error
    return { success: true, url: data.signedUrl }
  } catch (err: any) {
    console.error('Error creating signed URL:', err)
    return { success: false, error: err.message }
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

    const { documentRepository } = createServerContainer()
    await requireCurrentUser()

    // Use admin client to bypass RLS for Passport users
    const adminSupabase = createAdminClient()

    // 1. Delete from Storage
    const { error: storageError } = await adminSupabase.storage
      .from('company-documents')
      .remove([sanitizedFilePath])

    if (storageError) {
      console.error('Storage deletion error:', storageError)
      // Continue anyway to try and clean up metadata
    }

    // 2. Delete from Metadata table
    await documentRepository.deleteCompanyDocument(documentId)

    return { success: true }
  } catch (err: any) {
    console.error('Error deleting document:', err)
    return { success: false, error: err.message }
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
  } catch (err: any) {
    console.error('Error fetching templates:', err)
    if (err?.code === 'PGRST106' || err?.message?.includes('does not exist')) {
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
    console.log('[getCompanyDocuments] Checking access for user:', user.id, 'company:', companyId, 'isPassportUser:', !!user.canonicalId)
    const accessSnapshot = await accessService.getCompanyAccessSnapshot(user.id, companyId)
    console.log('[getCompanyDocuments] Access snapshot:', {
      hasAccess: accessSnapshot.hasAccess,
      accessType: accessSnapshot.accessType,
      isOwner: accessSnapshot.isOwner,
      ownerSubscriptionExpired: accessSnapshot.ownerSubscriptionExpired
    })
    
    if (!accessSnapshot.hasAccess) {
      console.log('[getCompanyDocuments] Access denied for user:', user.id, 'company:', companyId, 'reason:', {
        accessType: accessSnapshot.accessType,
        isOwner: accessSnapshot.isOwner,
        ownerSubscriptionExpired: accessSnapshot.ownerSubscriptionExpired
      })
      return { success: false, documents: [], error: 'Access denied to this company' }
    }

    console.log('[getCompanyDocuments] Fetching documents for company:', companyId, 'user:', user.id)

    const documents = await documentRepository.getCompanyDocuments(companyId)
    console.log('[getCompanyDocuments] Found', documents.length, 'documents for company:', companyId)
    
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
  } catch (err: any) {
    console.error('[getCompanyDocuments] Error:', err)
    if (err?.code === 'PGRST106' || err?.message?.includes('does not exist')) {
      return { success: true, documents: [], warning: 'Storage table not found' }
    }
    return { success: false, error: err.message, documents: [] }
  }
}
