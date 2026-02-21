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
  const supabase = await createClient()
  const adminSupabase = createAdminClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error('Unauthorized')
  }

  // Get region from country code
  const { getCountryConfig } = await import('@/lib/config/countries')
  const countryConfig = getCountryConfig(formData.countryCode || 'IN')
  const region = countryConfig?.region || 'APAC'

  // 1. Insert Company into public schema
  // For backward compatibility, set industry to first industry from industries array
  const firstIndustry = formData.industries.length > 0 ? formData.industries[0] : null
  
  // Parse ex-directors: split by comma or newline, trim, and filter empty strings
  const exDirectorsArray = formData.exDirectors
    ? formData.exDirectors
        .split(/[,\n]/)
        .map(name => name.trim())
        .filter(name => name.length > 0)
    : null
  
  const { data: company, error: companyError } = await adminSupabase
    .from('companies')
    .insert({
      user_id: user.id,
      name: formData.companyName,
      type: formData.companyType,
      pan: formData.panNumber || null,
      cin: formData.cinNumber,
      industry: firstIndustry,  // Set for backward compatibility (NOT NULL constraint)
      industries: formData.industries.length > 0 ? formData.industries : null,  // Store as array
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
      confidence_score: formData.confidenceScore || null,
      year_type: formData.yearType || 'FY',  // Default to FY for backward compatibility
      country_code: formData.countryCode || 'IN',  // Default to India for backward compatibility
      region: region,
      ex_directors: exDirectorsArray  // Store as TEXT[] array
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

  // 4. Ensure company has either trial or subscription
  // If user doesn't have a subscription, automatically create a trial for this company
  try {
    // Check if company already has a subscription or trial (company-level for Starter/Professional)
    const { data: companySubData } = await adminSupabase
      .rpc('check_company_subscription', { p_company_id: company.id })
      .single()

    const companyHasSubscription = companySubData && (companySubData as any).has_subscription

    // Check if user has Enterprise subscription (covers all companies)
    const { data: userSubData } = await adminSupabase
      .rpc('check_user_subscription', { target_user_id: user.id })
      .single()

    const userHasSubscription = userSubData && (userSubData as any).has_subscription

    // #region agent log
    console.log('[completeOnboarding] Subscription check:', {
      companyId: company.id,
      companyHasSubscription,
      userHasSubscription,
      companySubData,
      userSubData
    });
    // #endregion

    // Always create a company-level trial for new companies, regardless of user-level subscription
    // This ensures each company gets its own 15-day trial period
    if (!companyHasSubscription) {
      console.log('[completeOnboarding] Creating company-level trial for new company:', company.id)
      
      // Use RPC function to create company trial
      const { data: trialData, error: trialError } = await adminSupabase
        .rpc('create_company_trial', {
          p_user_id: user.id,
          p_company_id: company.id
        })

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
  const supabase = await createClient()
  const adminSupabase = createAdminClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error('Unauthorized')
  }

  // Update Company in public schema
  const updateData: any = {
      name: formData.companyName,
      type: formData.companyType,
      pan: formData.panNumber,
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
          .map(name => name.trim())
          .filter(name => name.length > 0)
      : null
    updateData.ex_directors = exDirectorsArray
  }

  const { error: companyError } = await adminSupabase
    .from('companies')
    .update(updateData)
    .eq('id', companyId)
    .eq('user_id', user.id)

  if (companyError) {
    console.error('Company update error:', companyError)
    throw new Error('Failed to update company: ' + companyError.message)
  }

  // Update directors if provided
  if (formData.directors !== undefined) {
    // First, delete all existing directors for this company
    const { error: deleteError } = await adminSupabase
      .from('directors')
      .delete()
      .eq('company_id', companyId)

    if (deleteError) {
      console.error('Director deletion error:', deleteError)
      // Don't throw - continue with insert
    }

    // Then insert the new directors
    if (formData.directors.length > 0) {
      const directorsToInsert = formData.directors.map(dir => ({
        company_id: companyId,
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
        // Don't throw - company update succeeded
      }
    }
  }

  return { success: true }
}

// Get directors for a company
export async function getCompanyDirectors(companyId: string) {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { success: false, directors: [], error: 'Unauthorized' }
  }

  const { data: directors, error } = await adminSupabase
    .from('directors')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching directors:', error)
    return { success: false, directors: [], error: error.message }
  }

  // Transform to match frontend Director interface
  const transformedDirectors = (directors || []).map(dir => ({
    id: dir.id,
    firstName: dir.first_name || '',
    lastName: dir.last_name || '',
    middleName: dir.middle_name || '',
    din: dir.din || '',
    designation: dir.designation || '',
    dob: dir.dob || '',
    pan: dir.pan || '',
    email: dir.email || '',
    mobile: dir.mobile || '',
    verified: dir.is_verified || false,
    source: (dir.source as 'cin' | 'din' | 'manual') || 'manual'
  }))

  return { success: true, directors: transformedDirectors }
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
