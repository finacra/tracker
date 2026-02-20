'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { enrichComplianceItems as enrichComplianceItemsService, type EnrichedComplianceData } from '@/lib/services/compliance-enrichment'
import { sendEmail, getSiteUrl } from '@/lib/email/resend'
import { renderTeamInviteEmail } from '@/lib/email/templates/teamInvite'
import { randomBytes } from 'crypto'

export interface RegulatoryRequirement {
  id: string
  company_id: string
  template_id?: string | null
  category: string
  requirement: string
  description: string | null
  status: 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed'
  due_date: string
  penalty: string | null
  penalty_config: Record<string, unknown> | null
  penalty_base_amount: number | null
  is_critical: boolean
  financial_year: string | null
  compliance_type: 'one-time' | 'monthly' | 'quarterly' | 'annual' | null
  year_type?: 'FY' | 'CY'  // Financial Year (India) or Calendar Year (Gulf/USA)
  filed_on: string | null
  filed_by: string | null
  status_reason: string | null
  required_documents: string[]
  possible_legal_action: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface UserRole {
  id: string
  user_id: string
  company_id: string | null // NULL for superadmin (platform-level)
  role: 'superadmin' | 'admin' | 'editor' | 'viewer'
  created_at: string
  updated_at: string
}

export interface ComplianceTemplate {
  id: string
  category: string
  requirement: string
  description: string | null
  compliance_type: 'one-time' | 'monthly' | 'quarterly' | 'annual'
  entity_types: string[]
  industries: string[]
  industry_categories: string[]
  penalty: string | null
  penalty_config: Record<string, unknown> | null
  is_critical: boolean
  financial_year: string | null
  due_date_offset: number | null
  due_month: number | null
  due_day: number | null
  due_date: string | null
  year_type?: 'FY' | 'CY'  // Financial Year (India) or Calendar Year (Gulf/USA)
  is_active: boolean
  required_documents: string[]
  possible_legal_action: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  matching_companies_count?: number
}

/**
 * Get user's role for a company
 * Superadmin is platform-level (company_id = NULL)
 */
export async function getUserRole(companyId: string | null): Promise<{ success: boolean; role: string | null; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, role: null, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    
    // First check if user is superadmin (platform-level, company_id IS NULL)
    // Query all superadmin roles for this user and check if any have NULL company_id
    const { data: superadminRoles } = await adminSupabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .eq('role', 'superadmin')

    // Check if any superadmin role has company_id = null (platform-level)
    if (superadminRoles && superadminRoles.some(role => role.company_id === null)) {
      return { success: true, role: 'superadmin' }
    }

    // If no company specified, return null (not applicable)
    if (!companyId) {
      return { success: true, role: null }
    }

    // Get company-specific role
    const { data, error } = await adminSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('company_id', companyId)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching user role:', error)
      return { success: false, role: null, error: error.message }
    }

    return { success: true, role: data?.role || 'viewer' }
  } catch (error: any) {
    console.error('Error in getUserRole:', error)
    return { success: false, role: null, error: error.message }
  }
}

/**
 * Check if user can view resources for a company (any role: viewer, editor, admin)
 */
export async function canUserView(companyId: string | null): Promise<boolean> {
  const { role } = await getUserRole(companyId)
  return role === 'viewer' || role === 'editor' || role === 'admin' || role === 'superadmin'
}

/**
 * Check if user can edit (editor, admin, or superadmin)
 * Superadmin can edit everything (companyId can be null)
 */
export async function canUserEdit(companyId: string | null): Promise<boolean> {
  const { role } = await getUserRole(companyId)
  return role === 'editor' || role === 'admin' || role === 'superadmin'
}

/**
 * Check if user can manage (admin or superadmin)
 * Superadmin can manage everything (companyId can be null)
 */
export async function canUserManage(companyId: string | null): Promise<boolean> {
  const { role } = await getUserRole(companyId)
  return role === 'admin' || role === 'superadmin'
}

/**
 * Fetch regulatory requirements for a company
 * Superadmins can fetch all requirements (pass null for companyId)
 */
export async function getRegulatoryRequirements(companyId: string | null = null): Promise<{
  success: boolean
  requirements?: RegulatoryRequirement[]
  error?: string
}> {
  const startTime = Date.now()
  console.log('[getRegulatoryRequirements] START - companyId:', companyId)
  
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    console.log('[getRegulatoryRequirements] Auth check:', Date.now() - startTime, 'ms')
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    
    // Check if user is superadmin (platform-level, company_id = NULL)
    // Fetch all superadmin roles and check if any have NULL company_id
    const { data: superadminRoles } = await adminSupabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .eq('role', 'superadmin')
    
    console.log('[getRegulatoryRequirements] Superadmin check:', Date.now() - startTime, 'ms')

    const isSuperadmin = superadminRoles && superadminRoles.some(role => role.company_id === null)

    // Update overdue statuses before fetching to ensure data consistency
    // This MUST complete before fetching to avoid race conditions
    try {
      if (companyId) {
        const { error: updateError } = await adminSupabase.rpc('update_company_overdue_statuses', { p_company_id: companyId })
        if (updateError) {
          console.error('[getRegulatoryRequirements] Status update error:', updateError)
          // Continue anyway but log the error - status update is important but shouldn't block data fetch
        }
      } else if (isSuperadmin) {
        const { error: updateError } = await adminSupabase.rpc('update_overdue_statuses')
        if (updateError) {
          console.error('[getRegulatoryRequirements] Status update error:', updateError)
        }
      }
    } catch (statusUpdateError) {
      // Log but don't fail the entire request if status update fails
      // However, we've already awaited, so this catch is for unexpected errors
      console.error('[getRegulatoryRequirements] Status update exception (non-critical):', statusUpdateError)
    }

    let query = adminSupabase
      .from('regulatory_requirements')
      .select('*')

    // Superadmins can fetch all, others need company filter
    if (!isSuperadmin) {
      if (!companyId) {
        return { success: false, error: 'Company ID required for non-superadmin users' }
      }
      query = query.eq('company_id', companyId)
    } else if (companyId) {
      // Superadmin can optionally filter by company
      query = query.eq('company_id', companyId)
    }

    const { data, error } = await query.order('due_date', { ascending: true })
    console.log('[getRegulatoryRequirements] Query completed:', Date.now() - startTime, 'ms')

    if (error) {
      console.error('[getRegulatoryRequirements] Error fetching requirements:', error)
      return { success: false, error: error.message }
    }

    console.log(`[getRegulatoryRequirements] Fetched ${data?.length || 0} requirements for company ${companyId || 'all'} in ${Date.now() - startTime}ms`)
    if (data && data.length > 0) {
      console.log('[getRegulatoryRequirements] Sample requirement:', {
        id: data[0].id,
        requirement: data[0].requirement,
        company_id: data[0].company_id,
        due_date: data[0].due_date,
        template_id: data[0].template_id,
        required_documents: data[0].required_documents,
        required_documents_type: typeof data[0].required_documents,
        required_documents_length: Array.isArray(data[0].required_documents) ? data[0].required_documents.length : 'not array'
      })
      
      // Check all requirements for required_documents
      const withDocs = data.filter((r: any) => r.required_documents && Array.isArray(r.required_documents) && r.required_documents.length > 0)
      const withoutDocs = data.filter((r: any) => !r.required_documents || !Array.isArray(r.required_documents) || r.required_documents.length === 0)
      console.log(`[getRegulatoryRequirements] Requirements with docs: ${withDocs.length}, without docs: ${withoutDocs.length}`)
      if (withDocs.length > 0) {
        console.log('[getRegulatoryRequirements] Example with docs:', {
          requirement: withDocs[0].requirement,
          required_documents: withDocs[0].required_documents
        })
      }
      if (withoutDocs.length > 0) {
        console.log('[getRegulatoryRequirements] Example without docs:', {
          requirement: withoutDocs[0].requirement,
          required_documents: withoutDocs[0].required_documents,
          has_field: 'required_documents' in withoutDocs[0]
        })
      }
    }

    // Normalize required_documents to always be an array
    const normalizedData = (data || []).map((req: any) => ({
      ...req,
      required_documents: Array.isArray(req.required_documents) 
        ? req.required_documents 
        : (req.required_documents ? [req.required_documents] : [])
    }))

    return { success: true, requirements: normalizedData }
  } catch (error: any) {
    console.error('Error in getRegulatoryRequirements:', error)
    return { success: false, error: error.message || 'Failed to fetch regulatory requirements' }
  }
}

/**
 * Update a regulatory requirement (full update)
 * Superadmins can update any requirement
 */
export async function updateRequirement(
  requirementId: string,
  companyId: string | null,
  requirement: {
    category?: string
    requirement?: string
    description?: string
    due_date?: string
    penalty?: string
    penalty_base_amount?: number | null
    is_critical?: boolean
    financial_year?: string
    status?: 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed'
    compliance_type?: 'one-time' | 'monthly' | 'quarterly' | 'annual'
    year?: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    
    // Check if user is superadmin (platform-level, company_id = NULL)
    // Fetch all superadmin roles and check if any have NULL company_id
    const { data: superadminRoles } = await adminSupabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .eq('role', 'superadmin')

    const isSuperadmin = superadminRoles && superadminRoles.some(role => role.company_id === null)

    // Check permissions (superadmin bypasses company check)
    if (!isSuperadmin) {
      if (!companyId) {
        return { success: false, error: 'Company ID required for non-superadmin users' }
      }
      const canEdit = await canUserEdit(companyId)
      if (!canEdit) {
        return { success: false, error: 'You do not have permission to edit requirements' }
      }
    }

    const updateData: any = {
      updated_by: user.id,
      updated_at: new Date().toISOString()
    }

    if (requirement.category !== undefined) updateData.category = requirement.category
    if (requirement.requirement !== undefined) updateData.requirement = requirement.requirement
    if (requirement.description !== undefined) updateData.description = requirement.description
    if (requirement.due_date !== undefined) updateData.due_date = requirement.due_date
    if (requirement.penalty !== undefined) updateData.penalty = requirement.penalty
    if (requirement.penalty_base_amount !== undefined) updateData.penalty_base_amount = requirement.penalty_base_amount
    if (requirement.is_critical !== undefined) updateData.is_critical = requirement.is_critical
    if (requirement.financial_year !== undefined) updateData.financial_year = requirement.financial_year
    if (requirement.status !== undefined) updateData.status = requirement.status
    if (requirement.compliance_type !== undefined) updateData.compliance_type = requirement.compliance_type
    if ((requirement as any).year_type !== undefined) updateData.year_type = (requirement as any).year_type

    // Validate compliance type and due date combination if both are being updated
    if (updateData.compliance_type && updateData.due_date) {
      const complianceType = updateData.compliance_type
      if (complianceType === 'one-time' && !updateData.due_date) {
        return { success: false, error: 'Due date is required for one-time compliances' }
      }
    }

    // Validate due date format if being updated
    if (updateData.due_date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(updateData.due_date)) {
        return { success: false, error: 'Due date must be in YYYY-MM-DD format' }
      }
      const date = new Date(updateData.due_date)
      if (isNaN(date.getTime())) {
        return { success: false, error: 'Invalid due date' }
      }
    }

    // Normalize required_documents if provided
    if ((requirement as any).required_documents !== undefined) {
      const requiredDocuments = (requirement as any).required_documents
      updateData.required_documents = Array.isArray(requiredDocuments)
        ? requiredDocuments
        : (requiredDocuments ? [requiredDocuments] : [])
    }

    let query = adminSupabase
      .from('regulatory_requirements')
      .update(updateData)
      .eq('id', requirementId)

    // Non-superadmins must match company_id
    if (!isSuperadmin && companyId) {
      query = query.eq('company_id', companyId)
    }

    const { error } = await query

    if (error) {
      console.error('Error updating requirement:', error)
      return { success: false, error: error.message || 'Failed to update requirement. Please try again.' }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error in updateRequirement:', error)
    return { success: false, error: error.message || 'An unexpected error occurred while updating the requirement.' }
  }
}

/**
 * Calculate period key from date and compliance type
 * Matches the format used in calculatePeriodMetadata() for consistency
 * @param complianceType - Type of compliance (one-time, monthly, quarterly, annual)
 * @param date - Due date (string or Date object)
 * @param yearType - Optional year type (FY for Financial Year, CY for Calendar Year). Defaults to FY
 */
function calculatePeriodKey(complianceType: string | null, date: string | Date, yearType: 'FY' | 'CY' = 'FY'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const year = d.getFullYear()
  const month = d.getMonth() + 1 // 1-indexed

  switch (complianceType) {
    case 'monthly':
      return `${year}-${month.toString().padStart(2, '0')}`
    
    case 'quarterly': {
      let quarter: number
      
      if (yearType === 'FY') {
        // Financial Year (India): Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
        if (month >= 4 && month <= 6) quarter = 1
        else if (month >= 7 && month <= 9) quarter = 2
        else if (month >= 10 && month <= 12) quarter = 3
        else quarter = 4
      } else {
        // Calendar Year (Gulf/USA): Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
        if (month <= 3) quarter = 1
        else if (month <= 6) quarter = 2
        else if (month <= 9) quarter = 3
        else quarter = 4
      }
      
      // Use consistent format: Q{quarter}-{year}
      return `Q${quarter}-${year}`
    }
    
    case 'annual': {
      if (yearType === 'FY') {
        // Financial Year: April to March
        const fyYear = month >= 4 ? year : year - 1
        return `FY-${fyYear}`
      } else {
        // Calendar Year: January to December
        return `FY-${year}`
      }
    }
    
    default:
      // one-time: use the date itself
      return d.toISOString().split('T')[0]
  }
}

/**
 * Update requirement status with document validation and notifications
 * Superadmins can update any requirement
 */
export async function updateRequirementStatus(
  requirementId: string,
  companyId: string | null,
  newStatus: 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed'
): Promise<{ success: boolean; error?: string; actualStatus?: string; missingDocs?: string[] }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    
    // Check if user is superadmin (platform-level, company_id = NULL)
    const { data: superadminRoles } = await adminSupabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .eq('role', 'superadmin')

    const isSuperadmin = superadminRoles && superadminRoles.some(role => role.company_id === null)

    // Check permissions (superadmin bypasses company check)
    if (!isSuperadmin) {
      if (!companyId) {
        return { success: false, error: 'Company ID required for non-superadmin users' }
      }
      const canEdit = await canUserEdit(companyId)
      if (!canEdit) {
        return { success: false, error: 'You do not have permission to edit requirements' }
      }
    }

    // Fetch the requirement to get required_documents, due_date, compliance_type, year_type
    const { data: requirement, error: reqError } = await adminSupabase
      .from('regulatory_requirements')
      .select('id, company_id, requirement, required_documents, due_date, compliance_type, status, year_type')
      .eq('id', requirementId)
      .single()

    if (reqError || !requirement) {
      console.error('Error fetching requirement:', reqError)
      return { success: false, error: 'Requirement not found' }
    }

    const reqCompanyId = companyId || requirement.company_id
    const currentStatus = requirement.status
    
    // Validate status transition
    // Define valid transitions
    const validTransitions: Record<string, string[]> = {
      'not_started': ['upcoming', 'pending', 'overdue', 'completed'],
      'upcoming': ['pending', 'overdue', 'completed'],
      'pending': ['overdue', 'completed'],
      'overdue': ['pending', 'completed'], // Can't go back to not_started or upcoming
      'completed': ['pending'] // Can revert to pending if documents are removed, but not to other statuses
    }
    
    // Check if transition is valid
    if (currentStatus !== newStatus) {
      const allowedTransitions = validTransitions[currentStatus] || []
      if (!allowedTransitions.includes(newStatus)) {
        return { 
          success: false, 
          error: `Invalid status transition: Cannot change from "${currentStatus}" to "${newStatus}". Valid transitions: ${allowedTransitions.join(', ')}` 
        }
      }
    }
    
    // Get year_type from requirement or fetch from company
    let yearType: 'FY' | 'CY' = (requirement as any).year_type || 'FY'
    if (!(requirement as any).year_type) {
      // Fetch from company if not in requirement
      const { data: company } = await adminSupabase
        .from('companies')
        .select('year_type')
        .eq('id', reqCompanyId)
        .single()
      yearType = (company as any)?.year_type || 'FY'
    }
    
    let actualStatus = newStatus
    let statusReason: string | null = null
    let missingDocs: string[] = []
    let shouldNotifyMissingDocs = false

    // If marking as completed, validate required documents
    if (newStatus === 'completed') {
      const requiredDocs = Array.isArray(requirement.required_documents) 
        ? requirement.required_documents 
        : (requirement.required_documents ? [requirement.required_documents] : [])
      
      if (requiredDocs.length > 0) {
        // Calculate period key for document matching (using year_type)
        const periodKey = calculatePeriodKey(requirement.compliance_type, requirement.due_date, yearType)
        
        // Fetch all documents for this company (we'll do matching in code for better flexibility)
        const { data: uploadedDocs, error: docsError } = await adminSupabase
          .from('company_documents_internal')
          .select('document_type, period_key')
          .eq('company_id', reqCompanyId)
        
        if (docsError) {
          console.error('Error checking documents:', docsError)
        }

        // Normalize document names for matching (case-insensitive, remove special chars)
        const normalizeDocName = (name: string): string => {
          return name.toLowerCase()
            .replace(/[^\w\s]/g, '') // Remove special characters
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim()
        }

        // Check which documents are missing
        // Match by normalized document type and period key (if period_key exists on doc)
        const uploadedDocsNormalized = new Map<string, boolean>()
        
        ;(uploadedDocs || []).forEach(doc => {
          const normalizedDocType = normalizeDocName(doc.document_type || '')
          
          // If document has period_key, it must match. If no period_key, it's a one-time doc that matches any period
          const periodMatches = !doc.period_key || doc.period_key === periodKey
          
          if (periodMatches && normalizedDocType) {
            uploadedDocsNormalized.set(normalizedDocType, true)
          }
        })

        // Check each required document with fuzzy matching
        missingDocs = requiredDocs.filter((requiredDocType: string) => {
          const normalizedRequired = normalizeDocName(requiredDocType)
          
          // Exact match
          if (uploadedDocsNormalized.has(normalizedRequired)) {
            return false
          }
          
          // Fuzzy match: check if any uploaded doc contains the required doc name or vice versa
          for (const [uploadedDoc, _] of uploadedDocsNormalized.entries()) {
            if (uploadedDoc.includes(normalizedRequired) || normalizedRequired.includes(uploadedDoc)) {
              return false // Found a match
            }
          }
          
          return true // Document is missing
        })

        if (missingDocs.length > 0) {
          // Cannot complete - set to pending with status reason
          actualStatus = 'pending'
          statusReason = `Missing documents: ${missingDocs.join(', ')}`
          shouldNotifyMissingDocs = true
        }
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      status: actualStatus,
      status_reason: statusReason,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    }

    // If actually completing, set filed_on and filed_by
    if (actualStatus === 'completed') {
      updateData.filed_on = new Date().toISOString().split('T')[0]
      updateData.filed_by = user.id
      updateData.status_reason = null
    }

    let query = adminSupabase
      .from('regulatory_requirements')
      .update(updateData)
      .eq('id', requirementId)

    // Non-superadmins must match company_id
    if (!isSuperadmin && companyId) {
      query = query.eq('company_id', companyId)
    }

    const { error } = await query

    if (error) {
      console.error('Error updating requirement status:', error)
      return { success: false, error: error.message || 'Failed to update requirement status. Please try again.' }
    }

    // In-app notifications (after DB update, so UI is consistent)
    if (shouldNotifyMissingDocs) {
      await notifyCompanyAdmins(
        adminSupabase,
        reqCompanyId,
        'missing_docs',
        `Compliance requires documents`,
        `"${requirement.requirement}" cannot be completed. Missing: ${missingDocs.join(', ')}`,
        requirementId,
        { missing_docs: missingDocs, attempted_status: 'completed' }
      )
    }

    if (newStatus !== requirement.status) {
      if (actualStatus === 'completed') {
        await notifyCompanyAdmins(
          adminSupabase,
          reqCompanyId,
          'status_change',
          `Compliance completed`,
          `"${requirement.requirement}" has been marked as completed.`,
          requirementId,
          { old_status: requirement.status, new_status: 'completed' }
        )
      } else {
        await notifyCompanyAdmins(
          adminSupabase,
          reqCompanyId,
          'status_change',
          `Compliance status changed`,
          `"${requirement.requirement}" status changed from ${requirement.status} to ${actualStatus}.`,
          requirementId,
          { old_status: requirement.status, new_status: actualStatus, reason: statusReason }
        )
      }
    }

    // Queue email notifications for status changes (batched every 5 min)
    if (newStatus !== requirement.status) {
      try {
        const recipients = await getCompanyAdminRecipients(adminSupabase, reqCompanyId)
        if (recipients.length > 0) {
          // Best-effort: fetch company name for nicer email
          const { data: companyRow } = await adminSupabase
            .from('companies')
            .select('name')
            .eq('id', reqCompanyId)
            .single()

          const companyName = companyRow?.name || 'Company'

          // Queue emails for batch sending (prevents spam on bulk updates)
          await queueStatusChangeEmails(adminSupabase, recipients, {
            companyId: reqCompanyId,
            companyName,
            requirementId,
            requirementName: requirement.requirement,
            dueDate: requirement.due_date,
            oldStatus: requirement.status,
            newStatus: actualStatus,
          })
        }
      } catch (emailErr) {
        console.error('[updateRequirementStatus] Email queue failed:', emailErr)
      }
    }

    return { 
      success: true, 
      actualStatus,
      missingDocs: missingDocs.length > 0 ? missingDocs : undefined
    }
  } catch (error: any) {
    console.error('Error in updateRequirementStatus:', error)
    return { success: false, error: error.message || 'Failed to update requirement status. Please try again.' }
  }
}

/**
 * Helper: Notify all company admins
 */
async function notifyCompanyAdmins(
  adminSupabase: ReturnType<typeof createAdminClient>,
  companyId: string,
  type: 'status_change' | 'missing_docs' | 'upcoming_deadline' | 'overdue' | 'document_uploaded' | 'team_update',
  title: string,
  message: string,
  requirementId?: string,
  metadata?: Record<string, unknown>
) {
  try {
    // Get company admin user IDs
    const { data: adminUsers, error: adminError } = await adminSupabase
      .from('user_roles')
      .select('user_id')
      .eq('company_id', companyId)
      .in('role', ['admin', 'superadmin'])

    if (adminError || !adminUsers || adminUsers.length === 0) {
      console.log('[notifyCompanyAdmins] No admins found or error:', adminError)
      return
    }

    // Create notifications for each admin
    const notifications = adminUsers.map(admin => ({
      company_id: companyId,
      user_id: admin.user_id,
      type,
      title,
      message,
      requirement_id: requirementId || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      is_read: false
    }))

    const { error: insertError } = await adminSupabase
      .from('company_notifications')
      .insert(notifications)

    if (insertError) {
      console.error('[notifyCompanyAdmins] Error inserting notifications:', insertError)
    }
  } catch (err) {
    console.error('[notifyCompanyAdmins] Exception:', err)
  }
}

type CompanyAdminRecipient = {
  userId: string
  email: string
  name: string | null
}

async function getCompanyAdminRecipients(
  adminSupabase: ReturnType<typeof createAdminClient>,
  companyId: string
): Promise<CompanyAdminRecipient[]> {
  const { data: adminUsers, error: adminError } = await adminSupabase
    .from('user_roles')
    .select('user_id')
    .eq('company_id', companyId)
    .in('role', ['admin', 'superadmin'])

  if (adminError || !adminUsers || adminUsers.length === 0) return []

  const recipients: CompanyAdminRecipient[] = []
  for (const row of adminUsers) {
    try {
      const { data } = await adminSupabase.auth.admin.getUserById(row.user_id)
      const email = data?.user?.email
      if (!email) continue
      recipients.push({
        userId: row.user_id,
        email,
        name: (data?.user?.user_metadata as any)?.full_name || null,
      })
    } catch {
      // Ignore lookup failures
    }
  }

  const byEmail = new Map<string, CompanyAdminRecipient>()
  for (const r of recipients) byEmail.set(r.email.toLowerCase(), r)
  return Array.from(byEmail.values())
}

/**
 * Queue status change emails for batch sending (prevents email spam)
 * Emails are batched and sent every 5 minutes by the flush-email-queue Edge Function
 */
async function queueStatusChangeEmails(
  adminSupabase: ReturnType<typeof createAdminClient>,
  recipients: CompanyAdminRecipient[],
  data: {
    companyId: string
    companyName: string
    requirementId: string
    requirementName: string
    dueDate: string | null
    oldStatus: string
    newStatus: string
  }
) {
  try {
    const queueEntries = recipients.map((recipient) => ({
      user_id: recipient.userId,
      user_email: recipient.email,
      company_id: data.companyId,
      company_name: data.companyName,
      email_type: 'status_change',
      payload: {
        requirement_id: data.requirementId,
        requirement_name: data.requirementName,
        due_date: data.dueDate,
        old_status: data.oldStatus,
        new_status: data.newStatus,
        recipient_name: recipient.name,
      },
    }))

    const { error } = await adminSupabase.from('email_batch_queue').insert(queueEntries)

    if (error) {
      console.error('[queueStatusChangeEmails] Error inserting queue entries:', error)
    }
  } catch (err) {
    console.error('[queueStatusChangeEmails] Exception:', err)
  }
}

/**
 * Create a new regulatory requirement
 * Superadmins can create requirements for any company
 */
export async function createRequirement(
  companyId: string,
  requirement: {
    category: string
    requirement: string
    description?: string
    due_date: string
    penalty?: string
    penalty_base_amount?: number | null
    is_critical?: boolean
    financial_year?: string
    compliance_type?: 'one-time' | 'monthly' | 'quarterly' | 'annual'
    year?: string
  }
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    
    // Check if user is superadmin (platform-level, company_id = NULL)
    // Fetch all superadmin roles and check if any have NULL company_id
    const { data: superadminRoles } = await adminSupabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .eq('role', 'superadmin')

    const isSuperadmin = superadminRoles && superadminRoles.some(role => role.company_id === null)

    // Check permissions (superadmin bypasses company check)
    if (!isSuperadmin) {
      const canEdit = await canUserEdit(companyId)
      if (!canEdit) {
        return { success: false, error: 'You do not have permission to create requirements' }
      }
    }

    // Validate due date format if provided (due dates are now optional)
    if (requirement.due_date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(requirement.due_date)) {
        return { success: false, error: 'Due date must be in YYYY-MM-DD format' }
      }
      const date = new Date(requirement.due_date)
      if (isNaN(date.getTime())) {
        return { success: false, error: 'Invalid due date' }
      }
    }

    // Normalize required_documents if provided
    const requiredDocuments = (requirement as any).required_documents
    const normalizedRequiredDocuments = Array.isArray(requiredDocuments)
      ? requiredDocuments
      : (requiredDocuments ? [requiredDocuments] : [])

    // Get year_type from requirement or company, default to 'FY'
    let yearType = (requirement as any).year_type
    if (!yearType) {
      const { data: company } = await adminSupabase
        .from('companies')
        .select('year_type')
        .eq('id', companyId)
        .single()
      yearType = company?.year_type || 'FY'
    }

    const { data, error } = await adminSupabase
      .from('regulatory_requirements')
      .insert({
        company_id: companyId,
        category: requirement.category,
        requirement: requirement.requirement,
        description: requirement.description || null,
        due_date: requirement.due_date,
        penalty: requirement.penalty || null,
        penalty_base_amount: requirement.penalty_base_amount || null,
        is_critical: requirement.is_critical || false,
        financial_year: requirement.financial_year || null,
        compliance_type: requirement.compliance_type || 'one-time',
        year_type: yearType,
        status: 'not_started',
        required_documents: normalizedRequiredDocuments,
        created_by: user.id,
        updated_by: user.id
      })
      .select('id')
      .single()

    if (error) {
      console.error('Error creating requirement:', error)
      return { success: false, error: error.message || 'Failed to create requirement. Please try again.' }
    }

    return { success: true, id: data.id }
  } catch (error: any) {
    console.error('Error in createRequirement:', error)
    return { success: false, error: error.message || 'An unexpected error occurred while creating the requirement.' }
  }
}

/**
 * Delete a regulatory requirement
 * Superadmins can delete any requirement
 */
export async function deleteRequirement(
  requirementId: string,
  companyId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    
    // Check if user is superadmin (platform-level, company_id = NULL)
    // Fetch all superadmin roles and check if any have NULL company_id
    const { data: superadminRoles } = await adminSupabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .eq('role', 'superadmin')

    const isSuperadmin = superadminRoles && superadminRoles.some(role => role.company_id === null)

    // Check permissions (superadmin bypasses company check)
    if (!isSuperadmin) {
      if (!companyId) {
        return { success: false, error: 'Company ID required for non-superadmin users' }
      }
      const canManage = await canUserManage(companyId)
      if (!canManage) {
        return { success: false, error: 'You do not have permission to delete requirements' }
      }
    }

    let query = adminSupabase
      .from('regulatory_requirements')
      .delete()
      .eq('id', requirementId)

    // Non-superadmins must match company_id
    if (!isSuperadmin && companyId) {
      query = query.eq('company_id', companyId)
    }

    const { error } = await query

    if (error) {
      console.error('Error deleting requirement:', error)
      return { success: false, error: error.message || 'Failed to delete requirement. Please try again.' }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error in deleteRequirement:', error)
    return { success: false, error: error.message || 'An unexpected error occurred while deleting the requirement.' }
  }
}

/**
 * Get all user roles for a company (for team management)
 * Superadmins can view all roles
 * Returns roles with user email and name
 */
export async function getCompanyUserRoles(companyId: string | null = null): Promise<{
  success: boolean
  roles?: (UserRole & { user_email?: string; user_name?: string })[]
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    
    // Check if user is superadmin (platform-level, company_id = NULL)
    // Fetch all superadmin roles and check if any have NULL company_id
    const { data: superadminRoles } = await adminSupabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .eq('role', 'superadmin')

    const isSuperadmin = superadminRoles && superadminRoles.some(role => role.company_id === null)

    // Check permissions (superadmin can view all, others need company)
    if (!isSuperadmin) {
      if (!companyId) {
        return { success: false, error: 'Company ID required for non-superadmin users' }
      }
      // All users (viewer, editor, admin) can VIEW team members
      const canView = await canUserView(companyId)
      if (!canView) {
        return { success: false, error: 'You do not have permission to view roles' }
      }
    }

    let query = adminSupabase
      .from('user_roles')
      .select('*')

    // Superadmins can view all roles, others filter by company
    if (!isSuperadmin && companyId) {
      query = query.eq('company_id', companyId)
    } else if (companyId) {
      // Superadmin can optionally filter by company
      query = query.eq('company_id', companyId)
    }

    console.log('[getCompanyUserRoles] Fetching roles for company:', companyId, 'isSuperadmin:', isSuperadmin)
    const { data, error } = await query.order('created_at', { ascending: false })
    console.log('[getCompanyUserRoles] Found', data?.length || 0, 'roles from user_roles table')

    if (error) {
      console.error('Error fetching user roles:', error)
      return { success: false, error: error.message || 'Failed to fetch user roles. Please try again.' }
    }

    let allRoles = data || []

    // If querying for a specific company, also include the company owner if not already in user_roles
    if (companyId) {
      const { data: company } = await adminSupabase
        .from('companies')
        .select('user_id')
        .eq('id', companyId)
        .single()

      if (company?.user_id) {
        const ownerHasRole = allRoles.some(r => r.user_id === company.user_id)
        if (!ownerHasRole) {
          console.log('[getCompanyUserRoles] Adding company owner as implicit admin:', company.user_id)
          // Add owner as implicit admin (they own the company via companies.user_id)
          allRoles.push({
            id: `owner-${companyId}`,
            user_id: company.user_id,
            company_id: companyId,
            role: 'admin',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_owner: true, // Mark as owner for UI purposes
          })
        }
      }
    }

    console.log('[getCompanyUserRoles] Total roles (including owner):', allRoles.length)

    // Fetch user details for each role
    const rolesWithUserInfo = await Promise.all(
      allRoles.map(async (role) => {
        try {
          const { data: userData } = await adminSupabase.auth.admin.getUserById(role.user_id)
          return {
            ...role,
            user_email: userData?.user?.email || 'Unknown',
            user_name: userData?.user?.user_metadata?.full_name || userData?.user?.email?.split('@')[0] || 'Unknown'
          }
        } catch {
          return {
            ...role,
            user_email: 'Unknown',
            user_name: 'Unknown'
          }
        }
      })
    )

    return { success: true, roles: rolesWithUserInfo }
  } catch (error: any) {
    console.error('Error in getCompanyUserRoles:', error)
    return { success: false, error: error.message || 'Failed to fetch user roles. Please try again.' }
  }
}

/**
 * Add a team member to a company
 */
export async function addTeamMember(
  companyId: string,
  userEmail: string,
  role: 'viewer' | 'editor' | 'admin'
): Promise<{ success: boolean; error?: string }> {
  console.log('[addTeamMember] START - Company:', companyId, 'Email:', userEmail, 'Role:', role)
  
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    console.log('[addTeamMember] Auth check - User:', user?.id, 'Error:', authError)
    
    if (!user) {
      console.error('[addTeamMember] FAILED - Not authenticated')
      return { success: false, error: 'Not authenticated' }
    }

    // Check permissions
    console.log('[addTeamMember] Checking permissions for company:', companyId)
    const canManage = await canUserManage(companyId)
    console.log('[addTeamMember] Can manage result:', canManage)
    
    if (!canManage) {
      console.error('[addTeamMember] FAILED - No permission to add team members')
      return { success: false, error: 'You do not have permission to add team members' }
    }

    const adminSupabase = createAdminClient()
    
    // Find user by email
    console.log('[addTeamMember] Searching for user with email:', userEmail)
    const { data: users, error: listError } = await adminSupabase.auth.admin.listUsers()
    
    if (listError) {
      console.error('[addTeamMember] FAILED - Error listing users:', listError)
      return { success: false, error: `Failed to check users: ${listError.message}` }
    }

    console.log('[addTeamMember] Found', users?.users?.length || 0, 'total users')
    const existingUser = users.users.find(u => u.email?.toLowerCase() === userEmail.toLowerCase())

    if (!existingUser) {
      console.error('[addTeamMember] FAILED - User not found with email:', userEmail)
      return { success: false, error: 'User not found. They need to sign up first before you can add them to the team.' }
    }

    console.log('[addTeamMember] Found user:', existingUser.id, 'Email:', existingUser.email)

    // Verify the insert data
    const insertData = {
      user_id: existingUser.id,
      company_id: companyId,
      role: role
    }
    console.log('[addTeamMember] Inserting user role:', JSON.stringify(insertData, null, 2))

    // Create user role using admin client (bypasses RLS)
    // Use .select() to get the inserted row back for verification
    const { data: insertData_result, error: insertError } = await adminSupabase
      .from('user_roles')
      .insert(insertData)
      .select('id, user_id, company_id, role, created_at')
      .single()

    console.log('[addTeamMember] Insert result - Data:', JSON.stringify(insertData_result, null, 2), 'Error:', insertError ? JSON.stringify(insertError, null, 2) : 'None')

    if (insertError) {
      console.error('[addTeamMember] FAILED - Insert error:', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint
      })
      
      if (insertError.code === '23505') { // Unique constraint violation
        // Check if the entry actually exists and is accessible
        console.log('[addTeamMember] Unique constraint violation - checking if entry exists...')
        const { data: existingRole, error: checkError } = await adminSupabase
          .from('user_roles')
          .select('*')
          .eq('user_id', existingUser.id)
          .eq('company_id', companyId)
          .single()
        
        console.log('[addTeamMember] Existing role check - Data:', existingRole, 'Error:', checkError)
        
        if (existingRole) {
          console.log('[addTeamMember] Entry exists but user cannot see company - RLS policy issue!')
          return { 
            success: false, 
            error: 'User role exists but may not be accessible. This could be an RLS policy issue. Please check database permissions.' 
          }
        } else {
          return { success: false, error: 'This user is already a member of this company' }
        }
      } else {
        return { success: false, error: `Insert failed: ${insertError.message} (Code: ${insertError.code})` }
      }
    }

    // Verify the insert actually worked by querying it back
    console.log('[addTeamMember] Verifying insert by querying back...')
    const { data: verifyData, error: verifyError } = await adminSupabase
      .from('user_roles')
      .select('*')
      .eq('user_id', existingUser.id)
      .eq('company_id', companyId)
      .single()

    console.log('[addTeamMember] Verification query - Data:', verifyData, 'Error:', verifyError)

    if (verifyError || !verifyData) {
      console.error('[addTeamMember] WARNING - Insert appeared successful but verification failed:', verifyError)
      return { success: false, error: 'User role was inserted but could not be verified. Please check manually.' }
    }

    console.log('[addTeamMember] SUCCESS - User role created and verified:', verifyData.id)
    return { success: true }
  } catch (error: any) {
    console.error('[addTeamMember] EXCEPTION - Unexpected error:', error)
    console.error('[addTeamMember] Stack:', error.stack)
    return { success: false, error: error.message || 'Unexpected error occurred' }
  }
}

/**
 * Create an email-based team invitation (supports non-auth recipients).
 * The invited user gets access only after they accept the invitation.
 */
export async function createTeamInvitation(
  companyId: string,
  email: string,
  role: 'viewer' | 'editor' | 'admin',
  inviteeName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const canManage = await canUserManage(companyId)
    const { role: userRole } = await getUserRole(companyId)
    const isSuperadmin = userRole === 'superadmin'

    if (!canManage && !isSuperadmin) {
      return { success: false, error: 'You do not have permission to invite team members' }
    }

    const adminSupabase = createAdminClient()

    const { data: company, error: companyError } = await adminSupabase
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .single()

    if (companyError || !company?.name) {
      return { success: false, error: 'Company not found' }
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      return { success: false, error: 'Email is required' }
    }

    const token = randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const { error: insertError } = await adminSupabase
      .from('team_invitations')
      .insert({
        company_id: companyId,
        email: normalizedEmail,
        role,
        token,
        invited_by: user.id,
        expires_at: expiresAt.toISOString(),
      })

    if (insertError) {
      console.error('[createTeamInvitation] Insert error:', insertError)
      return { success: false, error: insertError.message }
    }

    const siteUrl = getSiteUrl()
    const acceptUrl = `${siteUrl}/invite/accept?token=${token}`

    // Check if user already exists in the system
    const { data: existingUsers } = await adminSupabase.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    )

    let actionUrl: string

    if (existingUser) {
      // User exists - just send them directly to the accept page (they can log in there)
      actionUrl = acceptUrl
      console.log('[createTeamInvitation] Existing user, using direct accept URL')
    } else {
      // New user - generate Supabase invite link
      const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(`/invite/accept?token=${token}`)}`

      const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
        type: 'invite',
        email: normalizedEmail,
        options: { redirectTo },
      } as any)

      if (linkError) {
        console.error('[createTeamInvitation] generateLink error:', linkError)
        return { success: false, error: linkError.message }
      }

      actionUrl =
        (linkData as any)?.properties?.action_link ||
        (linkData as any)?.action_link ||
        null

      if (!actionUrl) {
        return { success: false, error: 'Failed to generate invite link' }
      }
    }

    const { subject, html } = renderTeamInviteEmail({
      companyName: company.name,
      inviterEmail: user.email || null,
      role,
      actionUrl,
      recipientEmail: normalizedEmail,
    })

    try {
      console.log('[createTeamInvitation] Sending email to:', normalizedEmail)
      const emailResult = await sendEmail({ to: normalizedEmail, subject, html })
      console.log('[createTeamInvitation] Email result:', JSON.stringify(emailResult))
    } catch (emailError: any) {
      console.error('[createTeamInvitation] Email send failed:', emailError?.message || emailError)
      // Don't fail the invitation if email fails - the invite is still in DB
    }

    await notifyCompanyAdmins(
      adminSupabase,
      companyId,
      'team_update',
      'Invitation sent',
      `An invitation was sent to ${normalizedEmail}${inviteeName ? ` (${inviteeName})` : ''}.`,
      undefined,
      { invited_email: normalizedEmail, role }
    )

    return { success: true }
  } catch (error: any) {
    console.error('Error in createTeamInvitation:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Accept an invitation token and grant access to the current authenticated user.
 */
export async function acceptTeamInvitation(
  token: string
): Promise<{ success: boolean; error?: string; companyId?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()

    const { data: invite, error: inviteError } = await adminSupabase
      .from('team_invitations')
      .select('*')
      .eq('token', token)
      .single()

    if (inviteError || !invite) {
      return { success: false, error: 'Invalid invitation token' }
    }

    if (invite.accepted_at) {
      return { success: true, companyId: invite.company_id }
    }

    const expiresAt = new Date(invite.expires_at)
    if (expiresAt.getTime() < Date.now()) {
      return { success: false, error: 'Invitation has expired' }
    }

    const { error: roleError } = await adminSupabase
      .from('user_roles')
      .upsert(
        {
          user_id: user.id,
          company_id: invite.company_id,
          role: invite.role,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,company_id' }
      )

    if (roleError) {
      console.error('[acceptTeamInvitation] role upsert error:', roleError)
      return { success: false, error: roleError.message }
    }

    await adminSupabase
      .from('team_invitations')
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by_user_id: user.id,
      })
      .eq('id', invite.id)

    await notifyCompanyAdmins(
      adminSupabase,
      invite.company_id,
      'team_update',
      'Team member joined',
      `${user.email || 'A user'} accepted an invitation and joined the team.`,
      undefined,
      { joined_user_id: user.id, joined_email: user.email || null, role: invite.role }
    )

    return { success: true, companyId: invite.company_id }
  } catch (error: any) {
    console.error('Error in acceptTeamInvitation:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Remove a team member from a company
 */
export async function removeTeamMember(
  companyId: string,
  roleId: string,
  memberUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Check permissions
    const canManage = await canUserManage(companyId)
    if (!canManage) {
      return { success: false, error: 'You do not have permission to remove team members' }
    }

    // Prevent removing own access if you're the only admin
    if (memberUserId === user.id) {
      const { roles } = await getCompanyUserRoles(companyId)
      if (roles) {
        const adminCount = roles.filter(r => r.role === 'admin' || r.role === 'superadmin').length
        if (adminCount <= 1) {
          return { success: false, error: 'You cannot remove your own access as you are the only admin' }
        }
      }
    }

    const adminSupabase = createAdminClient()
    const { error } = await adminSupabase
      .from('user_roles')
      .delete()
      .eq('id', roleId)
      .eq('company_id', companyId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error in removeTeamMember:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Update a team member's role
 */
export async function updateTeamMemberRole(
  companyId: string,
  roleId: string,
  newRole: 'viewer' | 'editor' | 'admin'
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Check permissions
    const canManage = await canUserManage(companyId)
    if (!canManage) {
      return { success: false, error: 'You do not have permission to change roles' }
    }

    const adminSupabase = createAdminClient()
    const { error } = await adminSupabase
      .from('user_roles')
      .update({ role: newRole })
      .eq('id', roleId)
      .eq('company_id', companyId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error in updateTeamMemberRole:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Generate future periods for recurring compliance requirements
 * This creates future instances for monthly, quarterly, and annual compliances
 */
export async function generateRecurringCompliances(
  companyId: string | null,
  monthsAhead: number = 12
): Promise<{ success: boolean; periodsGenerated?: number; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    
    // Check if user is superadmin (platform-level, company_id = NULL)
    const { data: superadminRoles } = await adminSupabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .eq('role', 'superadmin')

    const isSuperadmin = superadminRoles && superadminRoles.some(role => role.company_id === null)

    // Check permissions (superadmin can generate for all, others need company access)
    if (!isSuperadmin) {
      if (!companyId) {
        return { success: false, error: 'Company ID required for non-superadmin users' }
      }
      const canEdit = await canUserEdit(companyId)
      if (!canEdit) {
        return { success: false, error: 'You do not have permission to generate compliance requirements' }
      }
    }

    if (companyId) {
      // Generate for specific company
      const { data, error } = await adminSupabase.rpc('generate_recurring_compliances_for_company', {
        p_company_id: companyId,
        p_months_ahead: monthsAhead
      })

      if (error) {
        console.error('Error generating recurring compliances:', error)
        return { success: false, error: error.message || 'Failed to generate recurring compliances' }
      }

      return { success: true, periodsGenerated: data || 0 }
    } else if (isSuperadmin) {
      // Generate for all companies (superadmin only)
      const { data, error } = await adminSupabase.rpc('generate_recurring_compliances_all', {
        p_months_ahead: monthsAhead
      })

      if (error) {
        console.error('Error generating recurring compliances:', error)
        return { success: false, error: error.message || 'Failed to generate recurring compliances' }
      }

      const totalGenerated = (data || []).reduce((sum: number, row: any) => sum + (row.periods_generated || 0), 0)
      return { success: true, periodsGenerated: totalGenerated }
    } else {
      return { success: false, error: 'Company ID required for non-superadmin users' }
    }
  } catch (error: any) {
    console.error('Error in generateRecurringCompliances:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

/**
 * Get all compliance templates (superadmin only)
 */
export async function getComplianceTemplates(): Promise<{ success: boolean; templates?: ComplianceTemplate[]; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    
    // Check if user is superadmin
    const { data: superadminRoles } = await adminSupabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .eq('role', 'superadmin')

    const isSuperadmin = superadminRoles && superadminRoles.some(role => role.company_id === null)

    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can view templates' }
    }

    // Get all templates
    const { data: templates, error } = await adminSupabase
      .from('compliance_templates')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching templates:', error)
      return { success: false, error: error.message }
    }

    // Get matching companies count for each template (optimized with parallel processing)
    // Process in batches to avoid overwhelming the database
    const batchSize = 10
    const templatesArray = templates || []
    const templatesWithCounts: ComplianceTemplate[] = []
    
    for (let i = 0; i < templatesArray.length; i += batchSize) {
      const batch = templatesArray.slice(i, i + batchSize)
      const batchResults = await Promise.all(
        batch.map(async (template) => {
        try {
          const { data: matchingCompanies, error: matchError } = await adminSupabase.rpc('match_companies_to_template', {
            p_template_id: template.id
          })
          
          if (matchError) {
            console.error(`[getComplianceTemplates] Error matching template ${template.id}:`, matchError)
              return {
                ...template,
                matching_companies_count: 0
              }
          }
          
          return {
            ...template,
            matching_companies_count: matchingCompanies?.length || 0
          }
        } catch (error: any) {
          console.error(`[getComplianceTemplates] Error processing template ${template.id}:`, error)
          return {
            ...template,
            matching_companies_count: 0
          }
        }
      })
    )
      templatesWithCounts.push(...batchResults)
    }

    return { success: true, templates: templatesWithCounts }
  } catch (error: any) {
    console.error('Error in getComplianceTemplates:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Create a new compliance template and auto-apply to matching companies
 */
export async function createComplianceTemplate(
  template: {
    category: string
    requirement: string
    description?: string
    compliance_type: 'one-time' | 'monthly' | 'quarterly' | 'annual'
    entity_types: string[]
    industries: string[]
    industry_categories: string[]
    penalty?: string
    is_critical?: boolean
    financial_year?: string
    due_date_offset?: number
    due_month?: number
    due_day?: number
    due_date?: string
  }
): Promise<{ success: boolean; id?: string; applied_count?: number; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    
    // Check if user is superadmin
    const { data: superadminRoles } = await adminSupabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .eq('role', 'superadmin')

    const isSuperadmin = superadminRoles && superadminRoles.some(role => role.company_id === null)

    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can create templates' }
    }

    // Validate required fields
    if (!template.entity_types || template.entity_types.length === 0) {
      return { success: false, error: 'At least one entity type must be selected' }
    }
    if (!template.industries || template.industries.length === 0) {
      return { success: false, error: 'At least one industry must be selected' }
    }
    if (!template.industry_categories || template.industry_categories.length === 0) {
      return { success: false, error: 'At least one industry category must be selected' }
    }

    // Validate compliance type specific fields (all optional - allow compliances without due dates)
    // Only validate format if values are provided
    if (template.compliance_type === 'one-time' && template.due_date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(template.due_date)) {
        return { success: false, error: 'Due date must be in YYYY-MM-DD format' }
      }
    }
    if (template.compliance_type === 'monthly' && template.due_date_offset !== undefined && template.due_date_offset !== null) {
      if (template.due_date_offset < 1 || template.due_date_offset > 28) {
        return { success: false, error: 'Due date offset must be 1-28 for monthly' }
      }
    }
    if (template.compliance_type === 'quarterly') {
      if (template.due_month !== undefined && template.due_month !== null && (template.due_month < 1 || template.due_month > 12)) {
        return { success: false, error: 'Due month must be 1-12' }
      }
      if (template.due_day !== undefined && template.due_day !== null && (template.due_day < 1 || template.due_day > 31)) {
        return { success: false, error: 'Due day must be 1-31' }
      }
    }
    if (template.compliance_type === 'annual') {
      if (template.due_month !== undefined && template.due_month !== null && (template.due_month < 1 || template.due_month > 12)) {
        return { success: false, error: 'Due month must be 1-12' }
      }
      if (template.due_day !== undefined && template.due_day !== null && (template.due_day < 1 || template.due_day > 31)) {
        return { success: false, error: 'Due day must be 1-31' }
      }
    }

    // Insert template
    const { data: newTemplate, error: insertError } = await adminSupabase
      .from('compliance_templates')
      .insert({
        category: template.category,
        requirement: template.requirement,
        description: template.description || null,
        compliance_type: template.compliance_type,
        entity_types: template.entity_types,
        industries: template.industries,
        industry_categories: template.industry_categories,
        penalty: template.penalty || null,
        is_critical: template.is_critical || false,
        financial_year: template.financial_year || null,
        due_date_offset: template.compliance_type === 'quarterly' && template.due_month && template.due_day 
          ? (template.due_month - 1) * 30 + template.due_day 
          : (template.due_date_offset || null),
        due_month: template.compliance_type === 'quarterly' ? template.due_month : (template.due_month || null),
        due_day: template.compliance_type === 'quarterly' ? template.due_day : (template.due_day || null),
        due_date: template.due_date && template.due_date.trim() !== '' ? template.due_date : null,
        year_type: (template as any).year_type || 'FY',  // Default to FY for backward compatibility
        required_documents: Array.isArray((template as any).required_documents)
          ? (template as any).required_documents
          : ((template as any).required_documents ? [(template as any).required_documents] : []),
        possible_legal_action: (template as any).possible_legal_action || null,
        created_by: user.id,
        updated_by: user.id
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Error creating template:', insertError)
      return { success: false, error: insertError.message }
    }

    // Auto-apply template to matching companies
    console.log('[createComplianceTemplate] Applying template to companies...')
    
    // First, check which companies match
    const { data: matchingCompanies, error: matchError } = await adminSupabase.rpc('match_companies_to_template', {
      p_template_id: newTemplate.id
    })
    
    if (matchError) {
      console.error('[createComplianceTemplate] Error checking matching companies:', matchError)
    } else {
      console.log('[createComplianceTemplate] Matching companies:', matchingCompanies?.length || 0, matchingCompanies)
    }
    
    const { data: appliedCount, error: applyError } = await adminSupabase.rpc('apply_template_to_companies', {
      p_template_id: newTemplate.id
    })

    if (applyError) {
      console.error('[createComplianceTemplate] Error applying template:', applyError)
      // Template was created, but application failed - still return success with warning
      return { success: true, id: newTemplate.id, applied_count: 0, error: `Template created but failed to apply: ${applyError.message}` }
    }

    console.log('[createComplianceTemplate] Template applied to', appliedCount || 0, 'companies')
    return { success: true, id: newTemplate.id, applied_count: appliedCount || 0 }
  } catch (error: any) {
    console.error('Error in createComplianceTemplate:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Update a compliance template and refresh matching company requirements
 */
export async function updateComplianceTemplate(
  templateId: string,
  template: {
    category?: string
    requirement?: string
    description?: string
    compliance_type?: 'one-time' | 'monthly' | 'quarterly' | 'annual'
    entity_types?: string[]
    industries?: string[]
    industry_categories?: string[]
    penalty?: string
    is_critical?: boolean
    financial_year?: string
    due_date_offset?: number
    due_month?: number
    due_day?: number
    due_date?: string
    is_active?: boolean
  }
): Promise<{ success: boolean; applied_count?: number; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    
    // Check if user is superadmin
    const { data: superadminRoles } = await adminSupabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .eq('role', 'superadmin')

    const isSuperadmin = superadminRoles && superadminRoles.some(role => role.company_id === null)

    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can update templates' }
    }

    // Build update object
    const updateData: any = {
      updated_by: user.id,
      updated_at: new Date().toISOString()
    }

    if (template.category !== undefined) updateData.category = template.category
    if (template.requirement !== undefined) updateData.requirement = template.requirement
    if (template.description !== undefined) updateData.description = template.description
    if (template.compliance_type !== undefined) updateData.compliance_type = template.compliance_type
    if (template.entity_types !== undefined) updateData.entity_types = template.entity_types
    if (template.industries !== undefined) updateData.industries = template.industries
    if (template.industry_categories !== undefined) updateData.industry_categories = template.industry_categories
    if (template.penalty !== undefined) updateData.penalty = template.penalty || null
    if (template.is_critical !== undefined) updateData.is_critical = template.is_critical
    if (template.financial_year !== undefined) updateData.financial_year = template.financial_year || null
    // Handle quarterly conversion: month+day to offset
    if (template.compliance_type === 'quarterly' && template.due_month !== undefined && template.due_day !== undefined) {
      // Convert month in quarter (1-3) + day to approximate offset
      // Month 1: offset = day, Month 2: offset ≈ 31 + day, Month 3: offset ≈ 60 + day
      const quarterlyOffset = (template.due_month - 1) * 30 + template.due_day
      updateData.due_date_offset = quarterlyOffset
      updateData.due_month = template.due_month
      updateData.due_day = template.due_day
    } else {
      if (template.due_date_offset !== undefined) updateData.due_date_offset = template.due_date_offset || null
      if (template.due_month !== undefined) updateData.due_month = template.due_month || null
      if (template.due_day !== undefined) updateData.due_day = template.due_day || null
    }
    // Convert empty string to null for date fields
    if (template.due_date !== undefined) {
      updateData.due_date = template.due_date && template.due_date.trim() !== '' ? template.due_date : null
    }
    if (template.is_active !== undefined) updateData.is_active = template.is_active
    
    // New V2 fields
    if ((template as any).required_documents !== undefined) {
      updateData.required_documents = Array.isArray((template as any).required_documents)
        ? (template as any).required_documents
        : ((template as any).required_documents ? [(template as any).required_documents] : [])
    }
    if ((template as any).possible_legal_action !== undefined) {
      updateData.possible_legal_action = (template as any).possible_legal_action || null
    }
    if ((template as any).year_type !== undefined) {
      updateData.year_type = (template as any).year_type || 'FY'
    }

    // Only update if there are actual changes (not just re-applying)
    if (Object.keys(updateData).length > 2) { // More than just updated_by and updated_at
      const { error: updateError } = await adminSupabase
        .from('compliance_templates')
        .update(updateData)
        .eq('id', templateId)

      if (updateError) {
        console.error('Error updating template:', updateError)
        return { success: false, error: updateError.message }
      }
    }

    // Delete existing requirements from this template (to re-create them)
    console.log('[updateComplianceTemplate] Deleting existing requirements for template:', templateId)
    const { error: deleteError } = await adminSupabase
      .from('regulatory_requirements')
      .delete()
      .eq('template_id', templateId)
    
    if (deleteError) {
      console.error('[updateComplianceTemplate] Error deleting existing requirements:', deleteError)
      // Continue anyway - might be no requirements to delete
    } else {
      console.log('[updateComplianceTemplate] Deleted existing requirements')
    }

    // Re-apply template to matching companies
    console.log('[updateComplianceTemplate] Checking matching companies...')
    
    // First, check which companies match
    const { data: matchingCompanies, error: matchError } = await adminSupabase.rpc('match_companies_to_template', {
      p_template_id: templateId
    })
    
    if (matchError) {
      console.error('[updateComplianceTemplate] Error checking matching companies:', matchError)
    } else {
      console.log('[updateComplianceTemplate] Matching companies:', matchingCompanies?.length || 0, matchingCompanies)
    }
    
    const { data: appliedCount, error: applyError } = await adminSupabase.rpc('apply_template_to_companies', {
      p_template_id: templateId
    })

    if (applyError) {
      console.error('[updateComplianceTemplate] Error re-applying template:', applyError)
      return { success: false, applied_count: 0, error: `Failed to re-apply template: ${applyError.message}. Please check the SQL function and try again.` }
    }
    
    console.log('[updateComplianceTemplate] Template applied successfully. Created/updated', appliedCount || 0, 'requirements')

    return { success: true, applied_count: appliedCount || 0 }
  } catch (error: any) {
    console.error('Error in updateComplianceTemplate:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Delete a compliance template
 */
export async function deleteComplianceTemplate(
  templateId: string,
  deleteRequirements: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    
    // Check if user is superadmin
    const { data: superadminRoles } = await adminSupabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .eq('role', 'superadmin')

    const isSuperadmin = superadminRoles && superadminRoles.some(role => role.company_id === null)

    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can delete templates' }
    }

    // Delete associated requirements if requested
    if (deleteRequirements) {
      const { error: deleteReqError } = await adminSupabase
        .from('regulatory_requirements')
        .delete()
        .eq('template_id', templateId)

      if (deleteReqError) {
        console.error('Error deleting requirements:', deleteReqError)
        return { success: false, error: deleteReqError.message }
      }
    } else {
      // Just unlink requirements from template
      await adminSupabase
        .from('regulatory_requirements')
        .update({ template_id: null })
        .eq('template_id', templateId)
    }

    // Delete template
    const { error: deleteError } = await adminSupabase
      .from('compliance_templates')
      .delete()
      .eq('id', templateId)

    if (deleteError) {
      console.error('Error deleting template:', deleteError)
      return { success: false, error: deleteError.message }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error in deleteComplianceTemplate:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get template details with matching companies
 */
export async function getTemplateDetails(templateId: string): Promise<{ success: boolean; template?: ComplianceTemplate; matching_companies?: any[]; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    
    // Check if user is superadmin
    const { data: superadminRoles } = await adminSupabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .eq('role', 'superadmin')

    const isSuperadmin = superadminRoles && superadminRoles.some(role => role.company_id === null)

    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can view template details' }
    }

    // Get template
    const { data: template, error: templateError } = await adminSupabase
      .from('compliance_templates')
      .select('*')
      .eq('id', templateId)
      .single()

    if (templateError) {
      return { success: false, error: templateError.message }
    }

    // Get matching companies
    const { data: matchingCompanyIds, error: matchError } = await adminSupabase.rpc('match_companies_to_template', {
      p_template_id: templateId
    })

    if (matchError) {
      return { success: false, error: matchError.message }
    }

    // Get company details
    const companyIds = matchingCompanyIds?.map((c: any) => c.company_id) || []
    let matchingCompanies: any[] = []
    
    if (companyIds.length > 0) {
      const { data: companies, error: companiesError } = await adminSupabase
        .from('companies')
        .select('id, name, type, industry, industry_categories')
        .in('id', companyIds)

      if (!companiesError) {
        matchingCompanies = companies || []
      }
    }

    return {
      success: true,
      template: template as ComplianceTemplate,
      matching_companies: matchingCompanies
    }
  } catch (error: any) {
    console.error('Error in getTemplateDetails:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Apply all active compliance templates to matching companies
 * This creates/updates regulatory_requirements for all matching companies
 */
export async function applyAllTemplates(): Promise<{ success: boolean; applied_count: number; template_count: number; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, applied_count: 0, template_count: 0, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    
    // Check if user is superadmin
    const { data: superadminRoles } = await adminSupabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .eq('role', 'superadmin')

    const isSuperadmin = superadminRoles && superadminRoles.some(role => role.company_id === null)

    if (!isSuperadmin) {
      return { success: false, applied_count: 0, template_count: 0, error: 'Only superadmins can apply templates' }
    }

    // Get all active templates
    const { data: templates, error: templatesError } = await adminSupabase
      .from('compliance_templates')
      .select('id, requirement')
      .eq('is_active', true)

    if (templatesError) {
      console.error('[applyAllTemplates] Error fetching templates:', templatesError)
      return { success: false, applied_count: 0, template_count: 0, error: templatesError.message }
    }

    if (!templates || templates.length === 0) {
      return { success: true, applied_count: 0, template_count: 0, error: 'No active templates found' }
    }

    console.log(`[applyAllTemplates] Found ${templates.length} active templates to apply`)

    let totalApplied = 0
    let successCount = 0
    let errorCount = 0

    // Apply each template
    for (const template of templates) {
      try {
        const { data: appliedCount, error: applyError } = await adminSupabase.rpc('apply_template_to_companies', {
          p_template_id: template.id
        })

        if (applyError) {
          console.error(`[applyAllTemplates] Error applying template "${template.requirement}":`, applyError)
          errorCount++
        } else {
          const count = appliedCount || 0
          totalApplied += count
          successCount++
          console.log(`[applyAllTemplates] Applied template "${template.requirement}": ${count} requirements`)
        }
      } catch (err) {
        console.error(`[applyAllTemplates] Exception applying template "${template.requirement}":`, err)
        errorCount++
      }
    }

    console.log(`[applyAllTemplates] Completed: ${successCount} templates applied, ${errorCount} errors, ${totalApplied} total requirements`)

    return {
      success: errorCount === 0,
      applied_count: totalApplied,
      template_count: successCount,
      error: errorCount > 0 ? `${errorCount} templates failed to apply` : undefined
    }
  } catch (error: any) {
    console.error('Error in applyAllTemplates:', error)
    return { success: false, applied_count: 0, template_count: 0, error: error.message }
  }
}

// ============================================
// NOTIFICATION ACTIONS
// ============================================

export interface Notification {
  id: string
  company_id: string
  user_id: string
  type: 'status_change' | 'missing_docs' | 'upcoming_deadline' | 'overdue' | 'document_uploaded' | 'team_update'
  title: string
  message: string
  requirement_id: string | null
  document_id: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

/**
 * Get notifications for current user
 */
export async function getNotifications(
  options: { unreadOnly?: boolean; limit?: number } = {}
): Promise<{ success: boolean; notifications?: Notification[]; unreadCount?: number; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    
    let query = adminSupabase
      .from('company_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (options.unreadOnly) {
      query = query.eq('is_read', false)
    }

    if (options.limit) {
      query = query.limit(options.limit)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching notifications:', error)
      return { success: false, error: error.message }
    }

    // Get unread count
    const { count } = await adminSupabase
      .from('company_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)

    return { 
      success: true, 
      notifications: data || [],
      unreadCount: count || 0
    }
  } catch (error: any) {
    console.error('Error in getNotifications:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Mark notification(s) as read
 */
export async function markNotificationsRead(
  notificationIds: string | string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    const ids = Array.isArray(notificationIds) ? notificationIds : [notificationIds]

    const { error } = await adminSupabase
      .from('company_notifications')
      .update({ 
        is_read: true, 
        read_at: new Date().toISOString() 
      })
      .eq('user_id', user.id)
      .in('id', ids)

    if (error) {
      console.error('Error marking notifications read:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error in markNotificationsRead:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Mark all notifications as read for current user
 */
export async function markAllNotificationsRead(): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()

    const { error } = await adminSupabase
      .from('company_notifications')
      .update({ 
        is_read: true, 
        read_at: new Date().toISOString() 
      })
      .eq('user_id', user.id)
      .eq('is_read', false)

    if (error) {
      console.error('Error marking all notifications read:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error in markAllNotificationsRead:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// COMPANY FINANCIALS ACTIONS
// ============================================

export interface CompanyFinancials {
  id: string
  company_id: string
  financial_year: string
  turnover: number | null
  tax_due: number | null
  pf_contribution: number | null
  esi_contribution: number | null
  created_at: string
  updated_at: string
}

/**
 * Get company financials for a specific FY or all FYs
 */
export async function getCompanyFinancials(
  companyId: string,
  financialYear?: string
): Promise<{ success: boolean; financials?: CompanyFinancials[]; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    
    let query = adminSupabase
      .from('company_financials')
      .select('*')
      .eq('company_id', companyId)
      .order('financial_year', { ascending: false })

    if (financialYear) {
      query = query.eq('financial_year', financialYear)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching company financials:', error)
      return { success: false, error: error.message }
    }

    return { success: true, financials: data || [] }
  } catch (error: any) {
    console.error('Error in getCompanyFinancials:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Upsert company financials for a specific FY
 */
export async function upsertCompanyFinancials(
  companyId: string,
  financialYear: string,
  data: {
    turnover?: number | null
    tax_due?: number | null
    pf_contribution?: number | null
    esi_contribution?: number | null
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Check permissions
    const canEdit = await canUserEdit(companyId)
    if (!canEdit) {
      return { success: false, error: 'You do not have permission to edit company financials' }
    }

    const adminSupabase = createAdminClient()

    const { error } = await adminSupabase
      .from('company_financials')
      .upsert({
        company_id: companyId,
        financial_year: financialYear,
        turnover: data.turnover ?? null,
        tax_due: data.tax_due ?? null,
        pf_contribution: data.pf_contribution ?? null,
        esi_contribution: data.esi_contribution ?? null,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'company_id,financial_year'
      })

    if (error) {
      console.error('Error upserting company financials:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error in upsertCompanyFinancials:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Update requirement base amount (for interest/percentage penalties)
 */
export async function updateRequirementBaseAmount(
  requirementId: string,
  companyId: string | null,
  baseAmount: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase = createAdminClient()
    
    // Check if user is superadmin
    const { data: superadminRoles } = await adminSupabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .eq('role', 'superadmin')

    const isSuperadmin = superadminRoles && superadminRoles.some(role => role.company_id === null)

    // Check permissions
    if (!isSuperadmin) {
      if (!companyId) {
        return { success: false, error: 'Company ID required for non-superadmin users' }
      }
      const canEdit = await canUserEdit(companyId)
      if (!canEdit) {
        return { success: false, error: 'You do not have permission to edit requirements' }
      }
    }

    let query = adminSupabase
      .from('regulatory_requirements')
      .update({
        penalty_base_amount: baseAmount,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', requirementId)

    if (!isSuperadmin && companyId) {
      query = query.eq('company_id', companyId)
    }

    const { error } = await query

    if (error) {
      console.error('Error updating requirement base amount:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error in updateRequirementBaseAmount:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Bulk create compliance templates from CSV upload
 */
export async function bulkCreateComplianceTemplates(
  templates: {
    category: string
    requirement: string
    description: string
    compliance_type: 'one-time' | 'monthly' | 'quarterly' | 'annual'
    entity_types: string[]
    industries: string[]
    industry_categories: string[]
    due_date_offset: number | null
    due_month: number | null
    due_day: number | null
    due_date: string | null
    year_type?: 'FY' | 'CY'
    penalty: string | null
    penalty_config: Record<string, unknown> | null
    required_documents: string[]
    possible_legal_action: string | null
    is_critical: boolean
    is_active: boolean
  }[]
): Promise<{ success: boolean; created: number; errors: string[] }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, created: 0, errors: ['Not authenticated'] }
    }

    const adminSupabase = createAdminClient()
    
    // Check if user is superadmin
    const { data: superadminRoles } = await adminSupabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .eq('role', 'superadmin')

    const isSuperadmin = superadminRoles && superadminRoles.some(role => role.company_id === null)

    if (!isSuperadmin) {
      return { success: false, created: 0, errors: ['Only superadmins can create templates'] }
    }

    let createdCount = 0
    const errors: string[] = []

    // Process templates in batches of 50
    const batchSize = 50
    for (let i = 0; i < templates.length; i += batchSize) {
      const batch = templates.slice(i, i + batchSize)
      
      // Prepare batch for insertion
      const insertData = batch.map((template, batchIndex) => {
        const rowNum = i + batchIndex + 1
        
        // Validate required fields
        if (!template.category || !template.requirement || !template.compliance_type) {
          errors.push(`Row ${rowNum}: Missing required fields (category, requirement, or compliance_type)`)
          return null
        }
        if (!template.entity_types || template.entity_types.length === 0) {
          errors.push(`Row ${rowNum}: At least one entity type required`)
          return null
        }
        if (!template.industries || template.industries.length === 0) {
          errors.push(`Row ${rowNum}: At least one industry required`)
          return null
        }
        if (!template.industry_categories || template.industry_categories.length === 0) {
          errors.push(`Row ${rowNum}: At least one industry category required`)
          return null
        }

        // Validate compliance type specific fields (all optional - allow compliances without due dates)
        // Only validate format if values are provided
        if (template.compliance_type === 'one-time' && template.due_date) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/
          if (!dateRegex.test(template.due_date)) {
            errors.push(`Row ${rowNum}: Due date must be in YYYY-MM-DD format`)
          return null
        }
        }
        if (template.compliance_type === 'monthly' && template.due_date_offset !== null && template.due_date_offset !== undefined) {
          if (template.due_date_offset < 1 || template.due_date_offset > 28) {
            errors.push(`Row ${rowNum}: Due date offset must be 1-28 for monthly`)
          return null
        }
        }
        if (template.compliance_type === 'quarterly') {
          if (template.due_month !== null && template.due_month !== undefined && (template.due_month < 1 || template.due_month > 12)) {
            errors.push(`Row ${rowNum}: Due month must be 1-12`)
          return null
        }
          if (template.due_day !== null && template.due_day !== undefined && (template.due_day < 1 || template.due_day > 31)) {
            errors.push(`Row ${rowNum}: Due day must be 1-31`)
          return null
          }
        }
        if (template.compliance_type === 'annual') {
          if (template.due_month !== null && template.due_month !== undefined && (template.due_month < 1 || template.due_month > 12)) {
            errors.push(`Row ${rowNum}: Due month must be 1-12`)
            return null
          }
          if (template.due_day !== null && template.due_day !== undefined && (template.due_day < 1 || template.due_day > 31)) {
            errors.push(`Row ${rowNum}: Due day must be 1-31`)
            return null
          }
        }

        return {
          category: template.category,
          requirement: template.requirement,
          description: template.description || null,
          compliance_type: template.compliance_type,
          entity_types: template.entity_types,
          industries: template.industries,
          industry_categories: template.industry_categories,
          penalty: template.penalty,
          penalty_config: template.penalty_config,
          is_critical: template.is_critical,
          is_active: template.is_active,
          due_date_offset: template.compliance_type === 'quarterly' && template.due_month && template.due_day 
            ? (template.due_month - 1) * 30 + template.due_day 
            : template.due_date_offset,
          due_month: template.compliance_type === 'quarterly' ? template.due_month : template.due_month,
          due_day: template.compliance_type === 'quarterly' ? template.due_day : template.due_day,
          due_date: template.due_date && template.due_date.trim() !== '' ? template.due_date : null,
          year_type: template.year_type || 'FY',  // Default to FY for backward compatibility
          required_documents: Array.isArray(template.required_documents)
            ? template.required_documents
            : (template.required_documents ? [template.required_documents] : []),
          possible_legal_action: template.possible_legal_action,
          created_by: user.id,
          updated_by: user.id
        }
      }).filter((t): t is NonNullable<typeof t> => t !== null)

      if (insertData.length === 0) continue

      // Insert batch
      const { data: insertedTemplates, error: insertError } = await adminSupabase
        .from('compliance_templates')
        .insert(insertData)
        .select('id')

      if (insertError) {
        console.error('Error inserting batch:', insertError)
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${insertError.message}`)
        continue
      }

      createdCount += insertedTemplates?.length || 0

      // Apply templates to matching companies
      if (insertedTemplates && insertedTemplates.length > 0) {
        for (const template of insertedTemplates) {
          try {
            await adminSupabase.rpc('apply_template_to_companies', {
              p_template_id: template.id
            })
          } catch (applyError: any) {
            console.error('Error applying template:', applyError)
            // Continue - template was created, just not applied
          }
        }
      }
    }

    console.log(`[bulkCreateComplianceTemplates] Created ${createdCount} templates with ${errors.length} errors`)
    
    return { 
      success: errors.length === 0, 
      created: createdCount, 
      errors 
    }
  } catch (error: any) {
    console.error('Error in bulkCreateComplianceTemplates:', error)
    return { success: false, created: 0, errors: [error.message] }
  }
}

// ============= SEND DOCUMENTS EMAIL =============

import { documentShareEmail } from '@/lib/email/templates/documentShare'

interface SendDocumentsEmailParams {
  companyId: string
  companyName: string
  documentIds: string[]
  recipients: string[]
  subject: string
  message: string
}

export async function sendDocumentsEmail(params: SendDocumentsEmailParams) {
  console.log('[sendDocumentsEmail] Starting with params:', {
    companyId: params.companyId,
    documentCount: params.documentIds.length,
    recipientCount: params.recipients.length,
  })
  
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('[sendDocumentsEmail] Auth error:', authError)
      return { success: false, error: 'Unauthorized' }
    }
    console.log('[sendDocumentsEmail] User authenticated:', user.email)

    // Check user has access to this company
    const hasAccess = await canUserView(params.companyId)
    if (!hasAccess) {
      console.error('[sendDocumentsEmail] Access denied for company:', params.companyId)
      return { success: false, error: 'Access denied to this company' }
    }
    console.log('[sendDocumentsEmail] Access verified')

    // Fetch document details
    const { data: documents, error: docsError } = await adminSupabase
      .from('company_documents_internal')
      .select('*')
      .eq('company_id', params.companyId)
      .in('id', params.documentIds)

    console.log('[sendDocumentsEmail] Documents fetched:', documents?.length, 'Error:', docsError?.message)

    if (docsError || !documents || documents.length === 0) {
      console.error('[sendDocumentsEmail] Failed to fetch documents:', docsError)
      return { success: false, error: `Failed to fetch documents: ${docsError?.message || 'No documents found'}` }
    }

    // Generate signed URLs for documents (7 days expiry = 604800 seconds)
    const documentsWithUrls = await Promise.all(
      documents.map(async (doc) => {
        const { data: signedData, error: signError } = await adminSupabase.storage
          .from('company-documents')
          .createSignedUrl(doc.file_path, 604800) // 7 days

        return {
          name: doc.document_type || doc.name || 'Document',
          category: doc.category || 'General',
          period: doc.period || undefined,
          url: signError ? '#' : signedData?.signedUrl || '#',
        }
      })
    )

    // Get sender info
    const senderEmail = user.email || 'Unknown'
    const senderName = user.user_metadata?.full_name || user.user_metadata?.name || senderEmail

    console.log('[sendDocumentsEmail] Generated URLs for', documentsWithUrls.length, 'documents')
    console.log('[sendDocumentsEmail] Sender:', senderName, senderEmail)
    console.log('[sendDocumentsEmail] Recipients:', params.recipients)

    // Send email to each recipient
    const results = await Promise.allSettled(
      params.recipients.map(async (recipientEmail) => {
        console.log('[sendDocumentsEmail] Sending to:', recipientEmail.trim())
        
        const emailHtml = documentShareEmail({
          companyName: params.companyName,
          senderName,
          senderEmail,
          customMessage: params.message,
          documents: documentsWithUrls,
        })

        const result = await sendEmail({
          to: recipientEmail.trim(),
          subject: params.subject,
          html: emailHtml,
          replyTo: senderEmail,
        })
        
        console.log('[sendDocumentsEmail] Email result for', recipientEmail.trim(), ':', result)
        return result
      })
    )

    // Count successes and failures
    const succeeded = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    
    console.log('[sendDocumentsEmail] Results - Succeeded:', succeeded, 'Failed:', failed)

    if (failed > 0 && succeeded === 0) {
      // Get error details from rejected results
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map(r => r.reason?.message || 'Unknown error')
      console.error('[sendDocumentsEmail] All emails failed:', errors)
      return { success: false, error: `Failed to send emails: ${errors.join(', ')}` }
    }

    return { 
      success: true, 
      sent: succeeded, 
      failed,
      message: failed > 0 
        ? `Sent to ${succeeded} recipients. ${failed} failed.`
        : `Documents sent to ${succeeded} recipient${succeeded !== 1 ? 's' : ''}.`
    }
  } catch (error: any) {
    console.error('[sendDocumentsEmail] Error:', error)
    return { success: false, error: error.message || 'Unknown error occurred' }
  }
}
