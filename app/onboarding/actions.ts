'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { createServerContainer } from '@/lib/composition/server-container'
import { generateEmbedding } from '@/lib/utils/embeddings'
import { processDocumentContent } from '@/lib/utils/document-processor'
import { validateCompanyId, sanitizeStringInput, isValidUUID } from '@/lib/utils/input-validation'

async function requireCurrentUser() {
  const { authService } = createServerContainer()
  return authService.requireCurrentUser()
}

export async function completeOnboarding(
  formData: {
    companyName: string
    companyType: string
    panNumber?: string
    cinNumber: string
    industries: string[]
    address: string
    city: string
    state: string
    pinCode: string
    phoneNumber?: string
    email?: string
    landline?: string
    other?: string
    dateOfIncorporation: string
    industryCategories: string[]
    otherIndustryCategory?: string
    yearType?: 'FY' | 'CY'
    countryCode?: string
    companyStage?: string
    confidenceScore?: string
    documents: Array<{ type: string; path: string; name: string }>
    exDirectors?: string
  },
  directors: any[]
) {
  const {
    companyRepository,
    companyMembershipRepository,
    directorRepository,
    documentRepository,
    subscriptionRepository
  } = createServerContainer()
  const user = await requireCurrentUser()

  // Get region from country code
  const { getCountryConfig } = await import('@/lib/config/countries')
  const countryConfig = getCountryConfig(formData.countryCode || 'IN')
  const region = countryConfig?.region || 'APAC'

  // 1. Insert Company
  // For backward compatibility, set industry to first industry from industries array
  const firstIndustry = formData.industries.length > 0 ? formData.industries[0] : null

  // Parse ex-directors: split by comma or newline, trim, and filter empty strings
  const exDirectorsArray = formData.exDirectors
    ? formData.exDirectors
      .split(/[,\n]/)
      .map((name: string) => name.trim())
      .filter((name: string) => name.length > 0)
    : null

  const company = await companyRepository.create({
    userId: user.id,
    appUserId: user.canonicalId,
    name: formData.companyName,
    type: formData.companyType,
    taxId: formData.panNumber || null,
    registrationId: formData.cinNumber,
    industry: firstIndustry,
    industries: formData.industries.length > 0 ? formData.industries : null,
    industryCategories: formData.industryCategories,
    otherIndustryCategory: formData.otherIndustryCategory || null,
    incorporationDate: formData.dateOfIncorporation,
    address: formData.address,
    city: formData.city,
    state: formData.state,
    pinCode: formData.pinCode,
    phoneNumber: formData.phoneNumber || null,
    email: formData.email || null,
    landline: formData.landline || null,
    otherInfo: formData.other || null,
    stage: formData.companyStage || null,
    confidenceScore: formData.confidenceScore || null,
    yearType: formData.yearType || 'FY',
    countryCode: formData.countryCode || 'IN',
    region: region,
    exDirectors: exDirectorsArray
  })

  // 1b. Assign admin role to the company creator
  try {
    // For Passport users, use app_user_id (user.id) and set user_id to NULL
    await companyMembershipRepository.addRole(
      user.id,
      company.id,
      'admin',
      user.id // Pass user.id as app_user_id for Passport users
    )
  } catch (roleError) {
    console.error('Role assignment error:', roleError)
    // Don't throw - the company owner can still access via user_id on companies table
  }

  // 2. Insert Directors
  if (directors.length > 0) {
    await directorRepository.createMany(
      directors.map((dir: any) => ({
        companyId: company.id,
        firstName: dir.firstName,
        lastName: dir.lastName,
        middleName: dir.middleName || null,
        din: dir.din || null,
        designation: dir.designation || null,
        dob: dir.dob || null,
        pan: dir.pan || null,
        email: dir.email || null,
        mobile: dir.mobile || null,
        isVerified: dir.verified || false,
        source: dir.source || 'manual'
      }))
    )
  }

  // 3. Insert document metadata into internal table
  if (formData.documents.length > 0) {
    const templates = await documentRepository.getTemplateMappings()
    const insertedDocs = await documentRepository.createCompanyDocuments(
      await Promise.all(formData.documents.map(async (doc: { type: string; path: string; name: string }) => {
        const template = templates.find(t => t.documentName === doc.type)
        const embedding = await generateEmbedding(`${doc.type} ${doc.name}`)

        return {
          companyId: company.id,
          documentType: doc.type,
          filePath: doc.path,
          fileName: doc.name,
          folderName: template?.folderName || 'Constitutional Documents',
          registrationDate: formData.dateOfIncorporation,
          frequency: template?.defaultFrequency || 'annually',
          embedding: embedding.length > 0 ? embedding : null,
        }
      }))
    )

    // Background process: Extract text content from each PDF for AI understanding
    if (insertedDocs) {
      for (const doc of insertedDocs) {
        // We don't await this so the user doesn't wait for parsing
        processDocumentContent(doc.id, company.id, doc.filePath).catch(err =>
          console.error(`Async processing failed for ${doc.id}:`, err)
        )
      }
    }
  }

  // 4. Ensure company has either trial or subscription
  // If user doesn't have a subscription, automatically create a trial for this company
  try {
    const [companySubData, userSubData] = await Promise.all([
      subscriptionRepository.getCompanySubscriptionState(company.id),
      subscriptionRepository.getUserSubscriptionState(user.id),
    ])

    const companyHasSubscription = companySubData?.hasSubscription === true
    const userHasSubscription = userSubData?.hasSubscription === true
    const userTier = userSubData?.tier ?? null
    const isEnterprise = userTier === 'enterprise'

    // #region agent log
    console.log('[completeOnboarding] Subscription check:', {
      companyId: company.id,
      companyHasSubscription,
      userHasSubscription,
      userTier,
      isEnterprise,
      companySubData,
      userSubData
    });
    // #endregion

    // Logic:
    // - Enterprise tier: User-level subscription/trial covers ALL companies (don't create company-level trial)
    // - Starter/Professional tiers: Each company needs its own subscription/trial (create company-level trial)
    // - If user has no subscription: Create company-level trial for the new company
    if (!companyHasSubscription && !isEnterprise) {
      console.log('[completeOnboarding] Creating company-level trial for new company (not Enterprise):', company.id)

      let trialError: Error | null = null
      let trialData: { created?: boolean } | null = null

      try {
        await subscriptionRepository.createCompanyTrial(user.id, company.id, user.canonicalId)
        trialData = { created: true }
      } catch (error: any) {
        trialError = error
      }

      // #region agent log
      console.log('[completeOnboarding] Trial creation result:', { trialData, trialError });
      // #endregion

      if (trialError) {
        console.error('[completeOnboarding] Error creating trial:', trialError)
        // Don't throw - company is created, trial creation can be retried
        // User can manually start trial via subscribe page
      } else {
        console.log('[completeOnboarding] Trial created successfully for company:', company.id)
      }
    } else if (isEnterprise) {
      console.log('[completeOnboarding] User has Enterprise subscription/trial, company will use it (no company-level trial needed)')
    } else {
      console.log('[completeOnboarding] Company already has subscription/trial, skipping trial creation')
    }
  } catch (trialErr) {
    console.error('[completeOnboarding] Error checking/creating trial:', trialErr)
    // Don't throw - company is created successfully
  }

  return { success: true, companyId: company.id }
}

export async function updateCompany(
  companyId: string,
  formData: {
    companyName?: string
    companyType?: string
    panNumber?: string
    industries?: string[]
    address?: string
    city?: string
    state?: string
    pinCode?: string
    phoneNumber?: string
    email?: string
    landline?: string
    other?: string
    industryCategories?: string[]
    otherIndustryCategory?: string
    directors?: any[]
    exDirectors?: string
  }
) {
  // SECURITY: Validate companyId to prevent injection
  if (!validateCompanyId(companyId)) {
    throw new Error('Invalid company ID format')
  }

  const {
    companyRepository,
    directorRepository
  } = createServerContainer()
  const user = await requireCurrentUser()

  // Update Company in public schema
  const updateData: import('@/application/interfaces/CompanyRepository').UpdateCompanyInput = {
    name: formData.companyName,
    type: formData.companyType,
    taxId: formData.panNumber,
    industryCategories: formData.industryCategories,
    otherIndustryCategory: formData.otherIndustryCategory,
    address: formData.address,
    city: formData.city,
    state: formData.state,
    pinCode: formData.pinCode,
    phoneNumber: formData.phoneNumber,
    email: formData.email,
    landline: formData.landline,
    otherInfo: formData.other
  }

  // Add industries if provided
  if (formData.industries !== undefined) {
    updateData.industries = formData.industries.length > 0 ? formData.industries : null
  }

  // Add ex-directors if provided
  if (formData.exDirectors !== undefined) {
    const exDirectorsArray = formData.exDirectors
      ? formData.exDirectors
        .split(/[,\n]/)
        .map((name: string) => name.trim())
        .filter((name: string) => name.length > 0)
      : null
    updateData.exDirectors = exDirectorsArray
  }

  try {
    await companyRepository.update(companyId, updateData)
  } catch (companyError) {
    console.error('Company update error:', companyError)
    throw new Error('Failed to update company')
  }

  // Update directors if provided
  if (formData.directors !== undefined) {
    // First, delete all existing directors for this company
    try {
      await directorRepository.deleteByCompanyId(companyId)
    } catch (deleteError) {
      console.error('Director deletion error:', deleteError)
      // Don't throw - continue with insert
    }

    // Then insert the new directors
    if (formData.directors.length > 0) {
      try {
        await directorRepository.createMany(
          formData.directors.map((dir: any) => ({
            companyId: companyId,
            firstName: dir.firstName,
            lastName: dir.lastName,
            middleName: dir.middleName || null,
            din: dir.din || null,
            designation: dir.designation || null,
            dob: dir.dob || null,
            pan: dir.pan || null,
            email: dir.email || null,
            mobile: dir.mobile || null,
            isVerified: dir.verified || false,
            source: dir.source || 'manual'
          }))
        )
      } catch (dirError) {
        console.error('Director insertion error:', dirError)
        // Don't throw - company update succeeded
      }
    }
  }

  return { success: true }
}

// Get directors for a company
export async function getCompanyDirectors(companyId: string) {
  // SECURITY: Validate companyId to prevent injection
  if (!validateCompanyId(companyId)) {
    return { success: false, directors: [], error: 'Invalid company ID format' }
  }

  const { directorRepository } = createServerContainer()

  try {
    await requireCurrentUser()
  } catch {
    return { success: false, directors: [], error: 'Unauthorized' }
  }

  try {
    const directors = await directorRepository.getByCompanyId(companyId)
    return { success: true, directors }
  } catch (error: any) {
    console.error('Error fetching directors:', error)
    return { success: false, directors: [], error: error.message }
  }
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
