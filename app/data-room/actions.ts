'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { enrichComplianceItems as enrichComplianceItemsService, type EnrichedComplianceData } from '@/lib/services/compliance-enrichment'

export interface RegulatoryRequirement {
  id: string
  company_id: string
  category: string
  requirement: string
  description: string | null
  status: 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed'
  due_date: string
  penalty: string | null
  is_critical: boolean
  financial_year: string | null
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
  is_critical: boolean
  financial_year: string | null
  due_date_offset: number | null
  due_month: number | null
  due_day: number | null
  due_date: string | null
  is_active: boolean
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

    if (error) {
      console.error('[getRegulatoryRequirements] Error fetching requirements:', error)
      return { success: false, error: error.message }
    }

    console.log(`[getRegulatoryRequirements] Fetched ${data?.length || 0} requirements for company ${companyId || 'all'}`)
    if (data && data.length > 0) {
      console.log('[getRegulatoryRequirements] Sample requirement:', {
        id: data[0].id,
        requirement: data[0].requirement,
        company_id: data[0].company_id,
        due_date: data[0].due_date,
        template_id: data[0].template_id
      })
    }

    return { success: true, requirements: data || [] }
  } catch (error: any) {
    console.error('Error in getRegulatoryRequirements:', error)
    return { success: false, error: error.message }
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
    if (requirement.is_critical !== undefined) updateData.is_critical = requirement.is_critical
    if (requirement.financial_year !== undefined) updateData.financial_year = requirement.financial_year
    if (requirement.status !== undefined) updateData.status = requirement.status
    if (requirement.compliance_type !== undefined) updateData.compliance_type = requirement.compliance_type

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
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error in updateRequirement:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Update requirement status
 * Superadmins can update any requirement
 */
export async function updateRequirementStatus(
  requirementId: string,
  companyId: string | null,
  newStatus: 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed'
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

    let query = adminSupabase
      .from('regulatory_requirements')
      .update({
        status: newStatus,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', requirementId)

    // Non-superadmins must match company_id
    if (!isSuperadmin && companyId) {
      query = query.eq('company_id', companyId)
    }

    const { error } = await query

    if (error) {
      console.error('Error updating requirement status:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error in updateRequirementStatus:', error)
    return { success: false, error: error.message }
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

    const { data, error } = await adminSupabase
      .from('regulatory_requirements')
      .insert({
        company_id: companyId,
        category: requirement.category,
        requirement: requirement.requirement,
        description: requirement.description || null,
        due_date: requirement.due_date,
        penalty: requirement.penalty || null,
        is_critical: requirement.is_critical || false,
        financial_year: requirement.financial_year || null,
        compliance_type: requirement.compliance_type || 'one-time',
        status: 'not_started',
        created_by: user.id,
        updated_by: user.id
      })
      .select('id')
      .single()

    if (error) {
      console.error('Error creating requirement:', error)
      return { success: false, error: error.message }
    }

    return { success: true, id: data.id }
  } catch (error: any) {
    console.error('Error in createRequirement:', error)
    return { success: false, error: error.message }
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
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error in deleteRequirement:', error)
    return { success: false, error: error.message }
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
      const canManage = await canUserManage(companyId)
      if (!canManage) {
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

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching user roles:', error)
      return { success: false, error: error.message }
    }

    // Fetch user details for each role
    const rolesWithUserInfo = await Promise.all(
      (data || []).map(async (role) => {
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
    return { success: false, error: error.message }
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

    // Get matching companies count for each template
    const templatesWithCounts = await Promise.all(
      (templates || []).map(async (template) => {
        try {
          const { data: matchingCompanies, error: matchError } = await adminSupabase.rpc('match_companies_to_template', {
            p_template_id: template.id
          })
          
          if (matchError) {
            console.error(`[getComplianceTemplates] Error matching template ${template.id}:`, matchError)
          } else {
            console.log(`[getComplianceTemplates] Template "${template.requirement}" matches ${matchingCompanies?.length || 0} companies`)
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

    // Validate compliance type specific fields
    if (template.compliance_type === 'one-time' && !template.due_date) {
      return { success: false, error: 'Due date is required for one-time compliances' }
    }
    if (template.compliance_type === 'monthly' && template.due_date_offset === undefined) {
      return { success: false, error: 'Due date offset is required for monthly compliances' }
    }
    if (template.compliance_type === 'quarterly' && (template.due_month === undefined || template.due_day === undefined)) {
      return { success: false, error: 'Month in quarter and day are required for quarterly compliances' }
    }
    if (template.compliance_type === 'annual' && (template.due_month === undefined || template.due_day === undefined)) {
      return { success: false, error: 'Due month and day are required for annual compliances' }
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
