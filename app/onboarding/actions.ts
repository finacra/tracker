'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { generateEmbedding } from '@/lib/utils/embeddings'
import { processDocumentContent } from '@/lib/utils/document-processor'

export async function completeOnboarding(
  formData: {
    companyName: string
    companyType: string
    panNumber?: string
    cinNumber: string
    industry: string
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
    companyStage?: string
    confidenceScore?: string
    documents: Array<{ type: string; path: string; name: string }>
  },
  directors: any[]
) {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error('Unauthorized')
  }

  // 1. Insert Company into public schema
  const { data: company, error: companyError } = await adminSupabase
    .from('companies')
    .insert({
      user_id: user.id,
      name: formData.companyName,
      type: formData.companyType,
      pan: formData.panNumber || null,
      cin: formData.cinNumber,
      industry: formData.industry,
      industry_categories: formData.industryCategories,
      other_industry_category: formData.otherIndustryCategory || null,
      incorporation_date: formData.dateOfIncorporation,
      address: formData.address,
      city: formData.city,
      state: formData.state,
      pin_code: formData.pinCode,
      phone_number: formData.phoneNumber || null,
      email: formData.email || null,
      landline: formData.landline || null,
      other_info: formData.other || null,
      stage: formData.companyStage || null,
      confidence_score: formData.confidenceScore || null
    })
    .select()
    .single()

  if (companyError) {
    console.error('Company insertion error:', companyError)
    throw new Error('Failed to create company: ' + companyError.message)
  }

  // 1b. Assign admin role to the company creator
  const { error: roleError } = await adminSupabase
    .from('user_roles')
    .insert({
      user_id: user.id,
      company_id: company.id,
      role: 'admin'
    })

  if (roleError) {
    console.error('Role assignment error:', roleError)
    // Don't throw - the company owner can still access via user_id on companies table
  }

  // 2. Insert Directors into public schema
  if (directors.length > 0) {
    const directorsToInsert = directors.map(dir => ({
      company_id: company.id,
      first_name: dir.firstName,
      last_name: dir.lastName,
      middle_name: dir.middleName || null,
      din: dir.din || null,
      designation: dir.designation || null,
      dob: dir.dob || null,
      pan: dir.pan || null,
      email: dir.email || null,
      mobile: dir.mobile || null,
      is_verified: dir.verified || false,
      source: dir.source || 'manual'
    }))

    const { error: dirError } = await adminSupabase
      .from('directors')
      .insert(directorsToInsert)

    if (dirError) {
      console.error('Director insertion error:', dirError)
      // We might want to handle this differently, but for now we'll throw
      throw new Error('Failed to save directors: ' + dirError.message)
    }
  }

  // 3. Insert document metadata into internal table
  if (formData.documents.length > 0) {
    // Fetch templates to map folders and frequencies
    const { data: templates } = await adminSupabase
      .from('document_templates_internal')
      .select('document_name, folder_name, default_frequency')

    const { data: insertedDocs, error: internalError } = await adminSupabase
      .from('company_documents_internal')
      .insert(
        await Promise.all(formData.documents.map(async (doc) => {
          const template = templates?.find(t => t.document_name === doc.type)
          const embedding = await generateEmbedding(`${doc.type} ${doc.name}`)
          
          return {
            company_id: company.id,
            document_type: doc.type,
            file_path: doc.path,
            file_name: doc.name,
            folder_name: template?.folder_name || 'Constitutional Documents',
            registration_date: formData.dateOfIncorporation,
            frequency: template?.default_frequency || 'annually',
            embedding: embedding.length > 0 ? embedding : null
          }
        }))
      )
      .select()

    if (internalError) {
      console.error('Internal document metadata insertion error:', internalError)
      throw new Error('Failed to save document metadata: ' + internalError.message)
    }

    // Background process: Extract text content from each PDF for AI understanding
    if (insertedDocs) {
      for (const doc of insertedDocs) {
        // We don't await this so the user doesn't wait for parsing
        processDocumentContent(doc.id, company.id, doc.file_path).catch(err => 
          console.error(`Async processing failed for ${doc.id}:`, err)
        )
      }
    }
  }

  return { success: true, companyId: company.id }
}

export async function updateCompany(
  companyId: string,
  formData: {
    companyName?: string
    companyType?: string
    panNumber?: string
    industry?: string
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
  }
) {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error('Unauthorized')
  }

  // Update Company in public schema
  const { error: companyError } = await adminSupabase
    .from('companies')
    .update({
      name: formData.companyName,
      type: formData.companyType,
      pan: formData.panNumber,
      industry: formData.industry,
      industry_categories: formData.industryCategories,
      other_industry_category: formData.otherIndustryCategory,
      address: formData.address,
      city: formData.city,
      state: formData.state,
      pin_code: formData.pinCode,
      phone_number: formData.phoneNumber,
      email: formData.email,
      landline: formData.landline,
      other_info: formData.other
    })
    .eq('id', companyId)
    .eq('user_id', user.id)

  if (companyError) {
    console.error('Company update error:', companyError)
    throw new Error('Failed to update company: ' + companyError.message)
  }

  return { success: true }
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
  const supabase = await createClient()
  const adminSupabase = createAdminClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error('Unauthorized')
  }

  const embedding = await generateEmbedding(`${data.documentName} ${data.fileName}`)

  const { data: insertedDoc, error } = await adminSupabase
    .from('company_documents_internal')
    .insert({
      company_id: companyId,
      document_type: data.documentName,
      folder_name: data.folderName,
      registration_date: data.registrationDate || null,
      expiry_date: data.expiryDate || null,
      is_portal_required: data.isPortalRequired,
      portal_email: data.portalEmail || null,
      portal_password: data.portalPassword || null,
      frequency: data.frequency,
      file_path: data.filePath,
      file_name: data.fileName,
      embedding: embedding.length > 0 ? embedding : null,
      // Period metadata
      period_type: data.periodType || null,
      period_financial_year: data.periodFinancialYear || null,
      period_key: data.periodKey || null,
      period_start: data.periodStart || null,
      period_end: data.periodEnd || null,
      requirement_id: data.requirementId || null
    })
    .select()
    .single()

  if (error) {
    console.error('Document upload error:', error)
    throw new Error('Failed to save document metadata: ' + error.message)
  }

  // Trigger content processing in background
  if (insertedDoc) {
    processDocumentContent(insertedDoc.id, companyId, insertedDoc.file_path).catch(err => 
      console.error(`Async processing failed for ${insertedDoc.id}:`, err)
    )
  }

  return { success: true, documentId: insertedDoc?.id }
}

export async function getDownloadUrl(filePath: string) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    const { data, error } = await supabase.storage
      .from('company-documents')
      .createSignedUrl(filePath, 60) // 60 seconds expiry

    if (error) throw error
    return { success: true, url: data.signedUrl }
  } catch (err: any) {
    console.error('Error creating signed URL:', err)
    return { success: false, error: err.message }
  }
}

export async function deleteDocument(documentId: string, filePath: string) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // 1. Delete from Storage
    const { error: storageError } = await supabase.storage
      .from('company-documents')
      .remove([filePath])

    if (storageError) {
      console.error('Storage deletion error:', storageError)
      // Continue anyway to try and clean up metadata
    }

    // 2. Delete from Metadata table
    const { error: dbError } = await adminSupabase
      .from('company_documents_internal')
      .delete()
      .eq('id', documentId)

    if (dbError) throw dbError

    return { success: true }
  } catch (err: any) {
    console.error('Error deleting document:', err)
    return { success: false, error: err.message }
  }
}

export async function getDocumentTemplates() {
  try {
    const adminSupabase = createAdminClient()
    
    const { data, error } = await adminSupabase
      .from('document_templates_internal')
      .select('*')
      .order('folder_name', { ascending: true })

    if (error) {
      console.error('Supabase error fetching templates:', JSON.stringify(error, null, 2))
      if (error.code === 'PGRST106' || error.message?.includes('does not exist')) {
        return { success: true, templates: [] }
      }
      throw error
    }
    return { success: true, templates: data || [] }
  } catch (err: any) {
    console.error('Error fetching templates:', err)
    return { success: false, templates: [] }
  }
}

export async function getCompanyDocuments(companyId: string) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, documents: [], error: 'Unauthorized' }
    }

    console.log('Fetching documents for company:', companyId)

    // Fetch documents from internal table using admin client
    const { data, error } = await adminSupabase
      .from('company_documents_internal')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error fetching documents:', JSON.stringify(error, null, 2))
      // If the table doesn't exist, return empty instead of 500
      if (error.code === 'PGRST106' || error.message?.includes('does not exist')) {
        return { success: true, documents: [], warning: 'Storage table not found' }
      }
      return { success: false, documents: [], error: `Failed to fetch documents: ${error.message}` }
    }

    return { success: true, documents: data || [] }
  } catch (err: any) {
    console.error('Outer error in getCompanyDocuments:', err)
    return { success: false, error: err.message, documents: [] }
  }
}
