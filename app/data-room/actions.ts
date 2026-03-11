'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { validateCompanyId, validateUserId, isValidUUID } from '@/lib/utils/input-validation'
import { enrichComplianceItems as enrichComplianceItemsService, type EnrichedComplianceData } from '@/lib/services/compliance-enrichment'
import { sendEmail, getSiteUrl } from '@/lib/email/resend'
import { renderTeamInviteEmail } from '@/lib/email/templates/teamInvite'
import { createServerContainer } from '@/lib/composition/server-container'
import { createServerNotificationContainer } from '@/lib/composition/server-notification-container'
import { createServerUserContainer } from '@/lib/composition/server-user-container'
import { GetAccessibleCompanyIds } from '@/application/use-cases/access/GetAccessibleCompanyIds'
import { GetCompanyAccessSnapshot } from '@/application/use-cases/access/GetCompanyAccessSnapshot'
import { GetCompanyRole } from '@/application/use-cases/access/GetCompanyRole'
import { CreateNotifications } from '@/application/use-cases/notifications/CreateNotifications'
import { GetUserNotifications } from '@/application/use-cases/notifications/GetUserNotifications'
import { MarkAllUserNotificationsRead } from '@/application/use-cases/notifications/MarkAllUserNotificationsRead'
import { MarkUserNotificationsRead } from '@/application/use-cases/notifications/MarkUserNotificationsRead'
import { GetCompanyRequirements } from '@/application/use-cases/requirements/GetCompanyRequirements'
import type { AppNotification } from '@/domain/models/Notification'
import type { AppUser } from '@/domain/models/AppUser'
import type { Requirement } from '@/domain/models/Requirement'
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

function hasPlatformSuperadminRole(
  roles: Array<Pick<UserRole, 'company_id'>> | null | undefined
): boolean {
  return Boolean(roles?.some((role: Pick<UserRole, 'company_id'>) => role.company_id === null))
}

async function getCurrentUserOrNull(): Promise<AppUser | null> {
  const { authService } = createServerContainer()
  return authService.getCurrentUser()
}

async function isUserPlatformSuperadmin(userId: string): Promise<boolean> {
  const { accessService } = createServerContainer()
  return accessService.isSuperadmin(userId)
}

function getUserDisplayName(user: Pick<AppUser, 'fullName' | 'email'> | null | undefined): string {
  if (!user) {
    return 'Unknown'
  }

  const fullName = user.fullName?.trim()
  if (fullName) {
    return fullName
  }

  if (user.email) {
    return user.email.split('@')[0] || user.email
  }

  return 'Unknown'
}

function getOptionalUserDisplayName(
  user: Pick<AppUser, 'fullName' | 'email'> | null | undefined
): string | null {
  if (!user) {
    return null
  }

  const fullName = user.fullName?.trim()
  if (fullName) {
    return fullName
  }

  if (user.email) {
    return user.email.split('@')[0] || user.email
  }

  return null
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
    // SECURITY: Validate companyId if provided
    if (companyId !== null && !validateCompanyId(companyId)) {
      return { success: false, role: null, error: 'Invalid company ID format' }
    }

    const { authService, accessService } = createServerContainer()
    const user = await authService.requireCurrentUser()
    const useCase = new GetCompanyRole(accessService)
    const role = await useCase.execute(user.id, companyId)

    return { success: true, role }
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

export async function getCompanyAccessState(companyId: string | null): Promise<{
  success: boolean
  access?: import('@/domain/types/CompanyAccess').CompanyAccessSnapshot
  error?: string
}> {
  try {
    if (companyId === null || !validateCompanyId(companyId)) {
      return { success: false, error: 'Invalid company ID format' }
    }

    const { authService, accessService } = createServerContainer()
    const user = await authService.requireCurrentUser()
    const useCase = new GetCompanyAccessSnapshot(accessService)
    const access = await useCase.execute(user.id, companyId)

    return { success: true, access }
  } catch (error: any) {
    console.error('Error in getCompanyAccessState:', error)
    return { success: false, error: error.message || 'Failed to check company access' }
  }
}

export async function getAccessibleCompanyState(): Promise<{
  success: boolean
  accessibleCompanyIds?: string[]
  error?: string
}> {
  try {
    const { authService, accessService } = createServerContainer()
    const user = await authService.requireCurrentUser()
    const useCase = new GetAccessibleCompanyIds(accessService)
    const accessibleCompanyIds = await useCase.execute(user.id)

    return { success: true, accessibleCompanyIds }
  } catch (error: any) {
    console.error('Error in getAccessibleCompanyState:', error)
    return {
      success: false,
      error: error.message || 'Failed to check accessible companies',
    }
  }
}

function getCompanyStatusFromAccess(
  companyId: string,
  access: import('@/domain/types/CompanyAccess').CompanyAccessSnapshot
) {
  const isTrial = (access.trialDaysRemaining ?? 0) > 0

  return {
    companyId,
    hasSubscription: access.hasAccess,
    isTrial,
    trialDaysRemaining: isTrial ? access.trialDaysRemaining ?? 0 : undefined,
    tier: access.subscriptionInfo?.tier ?? null,
    status: access.hasAccess ? (isTrial ? 'trial' : 'valid') : 'expired',
  }
}

export async function getUserSubscriptionSummary(): Promise<{
  success: boolean
  summary?: {
    hasSubscription: boolean
    tier: string
    isTrial: boolean
    trialDaysRemaining: number
    companyLimit: number
    currentCompanyCount: number
    canCreateCompany: boolean
  }
  error?: string
}> {
  try {
    const { authService, companyRepository, subscriptionRepository } = createServerContainer()
    const user = await authService.requireCurrentUser()
    const [subscription, companies] = await Promise.all([
      subscriptionRepository.getUserSubscriptionState(user.id),
      companyRepository.listOwnedByUser(user.id),
    ])

    const hasActiveSubscription = Boolean(
      subscription?.hasSubscription ||
      (subscription?.isTrial && (subscription?.trialDaysRemaining ?? 0) > 0)
    )
    const companyLimit = subscription?.companyLimit ?? 0

    return {
      success: true,
      summary: {
        hasSubscription: hasActiveSubscription,
        tier: subscription?.tier ?? 'none',
        isTrial: subscription?.isTrial ?? false,
        trialDaysRemaining: subscription?.trialDaysRemaining ?? 0,
        companyLimit,
        currentCompanyCount: companies.length,
        canCreateCompany: hasActiveSubscription && companies.length < companyLimit,
      },
    }
  } catch (error: any) {
    console.error('Error in getUserSubscriptionSummary:', error)
    return { success: false, error: error.message || 'Failed to load subscription summary' }
  }
}

export async function getCompanyAccessStatuses(companyIds: string[]): Promise<{
  success: boolean
  statuses?: Array<ReturnType<typeof getCompanyStatusFromAccess>>
  error?: string
}> {
  try {
    const validCompanyIds = Array.from(new Set(companyIds)).filter(validateCompanyId)
    if (validCompanyIds.length === 0) {
      return { success: true, statuses: [] }
    }

    const { authService, accessService } = createServerContainer()
    const user = await authService.requireCurrentUser()
    const useCase = new GetCompanyAccessSnapshot(accessService)
    const statuses = await Promise.all(
      validCompanyIds.map(async (companyId) =>
        getCompanyStatusFromAccess(companyId, await useCase.execute(user.id, companyId))
      )
    )

    return { success: true, statuses }
  } catch (error: any) {
    console.error('Error in getCompanyAccessStatuses:', error)
    return { success: false, error: error.message || 'Failed to load company statuses' }
  }
}

export async function getOwnedCompanySubscriptionOverview(requestedCompanyId: string | null): Promise<{
  success: boolean
  company?: { id: string; name: string } | null
  accessibleCompanies?: Array<{ id: string; name: string; status: 'trial' | 'valid'; isTrial: boolean; trialDaysRemaining?: number }>
  expiredCompanies?: Array<{ id: string; name: string }>
  selectedExpiredCompanyId?: string | null
  error?: string
}> {
  try {
    if (requestedCompanyId !== null && !validateCompanyId(requestedCompanyId)) {
      return { success: false, error: 'Invalid company ID format' }
    }

    const { authService, accessService, companyRepository } = createServerContainer()
    const user = await authService.requireCurrentUser()
    const useCase = new GetCompanyAccessSnapshot(accessService)
    const ownedCompanies = await companyRepository.listOwnedByUser(user.id)
    const statuses = await Promise.all(
      ownedCompanies.map(async (company) => ({
        company,
        access: await useCase.execute(user.id, company.id),
      }))
    )

    const accessibleCompanies = statuses
      .filter(({ access }) => access.hasAccess)
      .map(({ company, access }) => ({
        id: company.id,
        name: company.name,
        status: (access.trialDaysRemaining ?? 0) > 0 ? 'trial' as const : 'valid' as const,
        isTrial: (access.trialDaysRemaining ?? 0) > 0,
        trialDaysRemaining: (access.trialDaysRemaining ?? 0) > 0 ? access.trialDaysRemaining ?? 0 : undefined,
      }))
    const expiredCompanies = statuses
      .filter(({ access }) => !access.hasAccess)
      .map(({ company }) => ({ id: company.id, name: company.name }))
    const selectedExpiredCompanyId =
      requestedCompanyId && expiredCompanies.some((company) => company.id === requestedCompanyId)
        ? requestedCompanyId
        : expiredCompanies[0]?.id ?? null
    const requestedCompany = requestedCompanyId
      ? ownedCompanies.find((company) => company.id === requestedCompanyId) ?? null
      : null

    return {
      success: true,
      company: requestedCompany ? { id: requestedCompany.id, name: requestedCompany.name } : null,
      accessibleCompanies,
      expiredCompanies,
      selectedExpiredCompanyId,
    }
  } catch (error: any) {
    console.error('Error in getOwnedCompanySubscriptionOverview:', error)
    return { success: false, error: error.message || 'Failed to load company subscription overview' }
  }
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
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    console.log('[getRegulatoryRequirements] START - companyId:', companyId)
  }

  try {
    // SECURITY: Validate companyId if provided
    if (companyId !== null && !validateCompanyId(companyId)) {
      return { success: false, error: 'Invalid company ID format' }
    }

    // First abstraction slice: company-specific requirements now go through the
    // application layer, while the all-companies superadmin path stays unchanged.
    if (companyId) {
      const { authService, accessService, requirementRepository } = createServerContainer()
      const user = await authService.requireCurrentUser()

      if (isDev) {
        console.log('[getRegulatoryRequirements] Auth check:', Date.now() - startTime, 'ms')
      }

      const useCase = new GetCompanyRequirements(accessService, requirementRepository)
      const requirements = await useCase.execute(user.id, companyId)

      if (isDev) {
        console.log(
          `[getRegulatoryRequirements] Fetched ${requirements.length} requirements for company ${companyId} in ${Date.now() - startTime}ms`
        )
      }

      return { success: true, requirements: requirements as RegulatoryRequirement[] }
    }

    const { authService, requirementRepository } = createServerContainer()
    const user = await authService.getCurrentUser()
    if (isDev) {
      console.log('[getRegulatoryRequirements] Auth check:', Date.now() - startTime, 'ms')
    }

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    let isSuperadmin = false

    // The company-specific path is the hot path for data-room startup and doesn't need
    // a superadmin lookup because the query is already scoped to that company.
    if (!companyId) {
      isSuperadmin = await isUserPlatformSuperadmin(user.id)

      if (isDev) {
        console.log('[getRegulatoryRequirements] Superadmin check:', Date.now() - startTime, 'ms')
      }
    }

    // Update overdue statuses before fetching to ensure data consistency
    // OPTIMIZATION: Make this non-blocking to improve load times
    // The status will be updated in the background, and the next fetch will have correct status
    if (companyId) {
      requirementRepository.refreshOverdueStatuses(companyId).catch((err) => {
        console.error('[getRegulatoryRequirements] Background status update failed (non-critical):', err)
      })
    } else if (isSuperadmin) {
      requirementRepository.refreshAllOverdueStatuses().catch((err) => {
        console.error('[getRegulatoryRequirements] Background status update failed (non-critical):', err)
      })
    }

    // Use repository to fetch requirements
    let requirements: Requirement[]
    if (!isSuperadmin) {
      if (!companyId) {
        return { success: false, error: 'Company ID required for non-superadmin users' }
      }
      requirements = await requirementRepository.getByCompanyId(companyId)
    } else if (companyId) {
      // Superadmin can optionally filter by company
      requirements = await requirementRepository.getByCompanyId(companyId)
    } else {
      // Superadmin fetching all requirements
      requirements = await requirementRepository.getAll()
    }

    if (isDev) {
      console.log('[getRegulatoryRequirements] Query completed:', Date.now() - startTime, 'ms')
      console.log(`[getRegulatoryRequirements] Fetched ${requirements.length} requirements for company ${companyId || 'all'} in ${Date.now() - startTime}ms`)
    }

    if (isDev && requirements.length > 0) {
      console.log('[getRegulatoryRequirements] Sample requirement:', {
        id: requirements[0].id,
        requirement: requirements[0].requirement,
        company_id: requirements[0].company_id,
        due_date: requirements[0].due_date,
        template_id: requirements[0].template_id,
        required_documents: requirements[0].required_documents,
        required_documents_type: typeof requirements[0].required_documents,
        required_documents_length: Array.isArray(requirements[0].required_documents) ? requirements[0].required_documents.length : 'not array'
      })

      // Check all requirements for required_documents
      const withDocs = requirements.filter((r: Requirement) => r.required_documents && Array.isArray(r.required_documents) && r.required_documents.length > 0)
      const withoutDocs = requirements.filter((r: Requirement) => !r.required_documents || !Array.isArray(r.required_documents) || r.required_documents.length === 0)
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

    // Normalize required_documents to always be an array (already handled by mapRow, but ensure consistency)
    const normalizedData = requirements.map((req: Requirement) => ({
      ...req,
      required_documents: Array.isArray(req.required_documents)
        ? req.required_documents
        : (req.required_documents ? [req.required_documents] : [])
    }))

    return { success: true, requirements: normalizedData as RegulatoryRequirement[] }
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
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase: any = createAdminClient()
    const { companyMembershipRepository } = createServerContainer()

    // Check if user is superadmin (platform-level, company_id = NULL)
    const allMemberships = await companyMembershipRepository.getRoles(companyId)
    const isSuperadmin = hasPlatformSuperadminRole(
      allMemberships
        .filter(role => role.userId === user.id && role.role === 'superadmin')
        .map(role => ({ company_id: role.companyId }))
    )

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
      ...(user.canonicalId ? { app_updated_by: user.canonicalId } : {}),
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

    const { requirementRepository } = createServerContainer()
    const updateInput: import('@/application/interfaces/RequirementRepository').UpdateRequirementInput = {
      updatedBy: user.id,
      appUpdatedBy: user.canonicalId,
      status: requirement.status,
      category: requirement.category,
      requirement: requirement.requirement,
      dueDate: requirement.due_date,
    }

    // Pass additional fields if needed, or handle in repository
    // For now we'll just use the Repository update
    // Note: description and other fields might need to be added to UpdateRequirementInput
    // Let's stick to the core fields for now or use raw SQL if needed.
    
    await requirementRepository.update(requirementId, updateInput)

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
    // SECURITY: Validate IDs to prevent injection
    // Note: requirementId is a UUID, not a company ID, so use isValidUUID
    if (!isValidUUID(requirementId)) {
      return { success: false, error: 'Invalid requirement ID format' }
    }
    if (companyId !== null && !validateCompanyId(companyId)) {
      return { success: false, error: 'Invalid company ID format' }
    }

    const supabase = await createClient()
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase: any = createAdminClient()

    // Check if user is superadmin (platform-level, company_id = NULL)
    const isSuperadmin = await isUserPlatformSuperadmin(user.id)

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

          ; (uploadedDocs || []).forEach((doc: { document_type?: string | null; period_key?: string | null }) => {
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
          // Allow completion even with missing documents, but set status reason
          // Admin will be notified about missing documents
          statusReason = `Missing documents: ${missingDocs.join(', ')}`
          shouldNotifyMissingDocs = true
        }
      }
    }

    // CRITICAL FIX: Resolve Supabase user_id for Passport users
    // updated_by has FK constraint to auth.users.id, so we need to check for Supabase identity
    let supabaseUserId: string | null = null
    if (user.canonicalId) {
      // Passport user - check for linked Supabase identity
      const { authIdentityRepository } = createServerContainer()
      const allIdentities = await authIdentityRepository.findByAppUserId(user.canonicalId)
      const supabaseIdentity = allIdentities.find((id) => id.provider === 'supabase')
      if (supabaseIdentity?.legacyAuthId) {
        supabaseUserId = supabaseIdentity.legacyAuthId
      }
    } else {
      // Supabase user - use user.id directly
      supabaseUserId = user.id
    }

    const { requirementRepository } = createServerContainer()
    const updateInput: import('@/application/interfaces/RequirementRepository').UpdateRequirementInput = {
      status: actualStatus,
      statusReason: statusReason,
      updatedBy: supabaseUserId || user.id, // Use resolved Supabase user_id or fallback to user.id
      appUpdatedBy: user.canonicalId || user.id, // Always set app_updated_by
    }

    // If actually completing, set filed_on and filed_by
    if (actualStatus === 'completed') {
      updateInput.filedOn = new Date().toISOString().split('T')[0]
      updateInput.filedBy = supabaseUserId // Use resolved Supabase user_id or null
      updateInput.appFiledBy = user.canonicalId || user.id // Always set app_filed_by

      // Keep status_reason if documents are missing (don't clear it)
      // Only clear if no reason was set
      if (!statusReason) {
        updateInput.statusReason = null
      }
    }

    // Non-superadmins must match company_id check is already done by canUserEdit above
    // or we can add it to the repository if needed, but for now we'll just update by ID
    await requirementRepository.update(requirementId, updateInput)

    // In-app notifications (after DB update, so UI is consistent)
    if (newStatus !== requirement.status) {
      if (actualStatus === 'completed') {
        // If completed with missing documents, notify admin about missing docs
        if (shouldNotifyMissingDocs && missingDocs.length > 0) {
          await notifyCompanyAdmins(
            adminSupabase,
            reqCompanyId,
            'missing_docs',
            `Compliance completed - Documents pending`,
            `"${requirement.requirement}" has been marked as completed, but required documents are still pending: ${missingDocs.join(', ')}`,
            requirementId,
            { missing_docs: missingDocs, status: 'completed' }
          )
        }
        
        // Always notify about status change to completed
        await notifyCompanyAdmins(
          adminSupabase,
          reqCompanyId,
          'status_change',
          `Compliance completed`,
          missingDocs.length > 0
            ? `"${requirement.requirement}" has been marked as completed. Note: ${missingDocs.length} required document(s) still pending.`
            : `"${requirement.requirement}" has been marked as completed.`,
          requirementId,
          { old_status: requirement.status, new_status: 'completed', missing_docs: missingDocs.length > 0 ? missingDocs : undefined }
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
    } else if (shouldNotifyMissingDocs && missingDocs.length > 0) {
      // Status didn't change but documents are missing (edge case)
      await notifyCompanyAdmins(
        adminSupabase,
        reqCompanyId,
        'missing_docs',
        `Compliance requires documents`,
        `"${requirement.requirement}" is missing required documents: ${missingDocs.join(', ')}`,
        requirementId,
        { missing_docs: missingDocs }
      )
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
  adminSupabase: any,
  companyId: string,
  type: 'status_change' | 'missing_docs' | 'upcoming_deadline' | 'overdue' | 'document_uploaded' | 'team_update',
  title: string,
  message: string,
  requirementId?: string,
  metadata?: Record<string, unknown>
) {
  try {
    const { companyMembershipRepository } = createServerContainer()
    const adminUserIds = await companyMembershipRepository.getAdminUserIds(companyId)

    if (adminUserIds.length === 0) {
      console.log('[notifyCompanyAdmins] No admins found')
      return
    }

    // Create notifications for each admin
    const notifications = adminUserIds.map((userId: string) => ({
      company_id: companyId,
      user_id: userId,
      type,
      title,
      message,
      requirement_id: requirementId || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      is_read: false
    }))

    const { notificationRepository } = createServerNotificationContainer()
    const useCase = new CreateNotifications(notificationRepository)
    await useCase.execute(
      notifications.map((notification: {
        company_id: string
        user_id: string
        type: string
        title: string
        message: string
        requirement_id: string | null
        metadata: string | null
        is_read: boolean
      }) => ({
        company_id: notification.company_id,
        user_id: notification.user_id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        requirement_id: notification.requirement_id,
        metadata: notification.metadata
          ? (JSON.parse(notification.metadata) as Record<string, unknown>)
          : null,
        is_read: notification.is_read,
      }))
    )
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
  _adminSupabase: any,
  companyId: string
): Promise<CompanyAdminRecipient[]> {
  const { companyMembershipRepository, userRepository } = createServerContainer()
  const adminUserIds = await companyMembershipRepository.getAdminUserIds(companyId)
  if (adminUserIds.length === 0) return []

  const recipients: CompanyAdminRecipient[] = []
  for (const userId of adminUserIds) {
    try {
      const user = await userRepository.getById(userId)
      const email = user?.email
      if (!email) continue
      recipients.push({
        userId,
        email,
        name: getOptionalUserDisplayName(user),
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
  adminSupabase: any,
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
    const queueEntries = recipients.map((recipient: CompanyAdminRecipient) => ({
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
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const { companyMembershipRepository, requirementRepository, companyRepository } = createServerContainer()
    const allMemberships = await companyMembershipRepository.getRoles(companyId)
    const isSuperadmin = hasPlatformSuperadminRole(
      allMemberships
        .filter((role: { userId: string; role: string; companyId: string | null }) => role.userId === user.id && role.role === 'superadmin')
        .map((role: { companyId: string | null }) => ({ company_id: role.companyId }))
    )

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
    let yearType = (requirement as any).year_type as 'FY' | 'CY' | undefined
    if (!yearType) {
      // Use repository to get company details - for yearType we need to query directly
      // TODO: Add yearType to CompanyDetailsRecord interface
      const adminSupabase: any = createAdminClient()
      const { data: company } = await adminSupabase
        .from('companies')
        .select('year_type')
        .eq('id', companyId)
        .single()
      yearType = (company?.year_type as 'FY' | 'CY' | undefined) || 'FY'
    }

    // Use repository to create requirement
    const created = await requirementRepository.create({
      companyId,
      category: requirement.category,
      requirement: requirement.requirement,
      description: requirement.description || null,
      dueDate: requirement.due_date,
      penalty: requirement.penalty || null,
      penaltyBaseAmount: requirement.penalty_base_amount || null,
      isCritical: requirement.is_critical || false,
      financialYear: requirement.financial_year || null,
      complianceType: requirement.compliance_type || 'one-time',
      yearType: yearType || 'FY',
      requiredDocuments: normalizedRequiredDocuments,
      createdBy: user.id,
      updatedBy: user.id
    })

    return { success: true, id: created.id }
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
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const { companyMembershipRepository, requirementRepository } = createServerContainer()
    const allMemberships = await companyMembershipRepository.getRoles(companyId || '')
    const isSuperadmin = hasPlatformSuperadminRole(
      allMemberships
        .filter((role: { userId: string; role: string; companyId: string | null }) => role.userId === user.id && role.role === 'superadmin')
        .map((role: { companyId: string | null }) => ({ company_id: role.companyId }))
    )

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

    // Use repository to delete requirement
    // Pass companyId only for non-superadmins (superadmins can delete any requirement)
    await requirementRepository.delete(requirementId, isSuperadmin ? null : companyId)

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
    // SECURITY: Validate companyId if provided
    if (companyId !== null && !validateCompanyId(companyId)) {
      return { success: false, error: 'Invalid company ID format' }
    }

    const supabase = await createClient()
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const { companyMembershipRepository, userRepository } = createServerContainer()
    const allMemberships = await companyMembershipRepository.getRoles(companyId)
    const isSuperadmin = hasPlatformSuperadminRole(
      allMemberships
        .filter(role => role.userId === user.id && role.role === 'superadmin')
        .map(role => ({ company_id: role.companyId }))
    )

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

    console.log('[getCompanyUserRoles] Fetching roles for company:', companyId, 'isSuperadmin:', isSuperadmin)
    let allRoles: Array<UserRole & { is_owner?: boolean }> = allMemberships.map(role => ({
      id: role.id,
      user_id: role.userId,
      company_id: role.companyId,
      role: role.role,
      created_at: role.createdAt,
      updated_at: role.updatedAt,
    }))
    console.log('[getCompanyUserRoles] Found', allRoles.length, 'roles from repository')

    // If querying for a specific company, also include the company owner if not already in user_roles
    if (companyId) {
      const ownerUserId = await companyMembershipRepository.getCompanyOwnerId(companyId)
      if (ownerUserId) {
        const ownerHasRole = allRoles.some((r: { user_id: string }) => r.user_id === ownerUserId)
        if (!ownerHasRole) {
          console.log('[getCompanyUserRoles] Adding company owner as implicit admin:', ownerUserId)
          // Add owner as implicit admin (they own the company via companies.user_id)
          allRoles.push({
            id: `owner-${companyId}`,
            user_id: ownerUserId,
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

    const rolesWithUserInfo = await Promise.all(
      allRoles.map(async (role: UserRole & { is_owner?: boolean }) => {
        try {
          const user = await userRepository.getById(role.user_id)
          return {
            ...role,
            user_email: user?.email || 'Unknown',
            user_name: getUserDisplayName(user)
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
    const user = await getCurrentUserOrNull()

    console.log('[addTeamMember] Auth check - User:', user?.id)

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

    const { companyMembershipRepository, userRepository } = createServerContainer()

    // Find user by email
    console.log('[addTeamMember] Searching for user with email:', userEmail)
    const existingUser = await userRepository.findByEmail(userEmail)

    if (!existingUser) {
      console.error('[addTeamMember] FAILED - User not found with email:', userEmail)
      return { success: false, error: 'User not found. They need to sign up first before you can add them to the team.' }
    }

    console.log('[addTeamMember] Found user:', existingUser.legacyAuthId || existingUser.id, 'Email:', existingUser.email)

    // Verify the insert data
    const insertData = {
      user_id: existingUser.legacyAuthId || existingUser.id,
      company_id: companyId,
      role: role
    }
    console.log('[addTeamMember] Inserting user role:', JSON.stringify(insertData, null, 2))

    try {
      await companyMembershipRepository.addRole(insertData.user_id, companyId, role)
      console.log('[addTeamMember] Insert result - Success')
    } catch (insertError: any) {
      console.error('[addTeamMember] FAILED - Insert error:', {
        code: insertError.code,
        message: insertError.message,
      })

      if (insertError.code === '23505') { // Unique constraint violation
        // Check if the entry actually exists and is accessible
        console.log('[addTeamMember] Unique constraint violation - checking if entry exists...')
        const existingRole = await companyMembershipRepository.findRole(insertData.user_id, companyId)
        console.log('[addTeamMember] Existing role check - Data:', existingRole)

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
    const verifyData = await companyMembershipRepository.findRole(insertData.user_id, companyId)
    console.log('[addTeamMember] Verification query - Data:', verifyData)

    if (!verifyData) {
      console.error('[addTeamMember] WARNING - Insert appeared successful but verification failed')
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
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const canManage = await canUserManage(companyId)
    const { role: userRole } = await getUserRole(companyId)
    const isSuperadmin = userRole === 'superadmin'

    if (!canManage && !isSuperadmin) {
      return { success: false, error: 'You do not have permission to invite team members' }
    }

    const adminSupabase: any = createAdminClient()
    const { companyRepository, teamInvitationRepository, userRepository } = createServerContainer()

    const company = await companyRepository.getById(companyId)
    if (!company?.name) {
      return { success: false, error: 'Company not found' }
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      return { success: false, error: 'Email is required' }
    }

    const token = randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await teamInvitationRepository.create({
      companyId,
      email: normalizedEmail,
      role,
      token,
      invitedBy: user.id,
      expiresAt: expiresAt.toISOString(),
    })

    const siteUrl = getSiteUrl()
    const acceptUrl = `${siteUrl}/invite/accept?token=${token}`

    // Check if user already exists in the system
    const existingUser = await userRepository.findByEmail(normalizedEmail)

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
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase: any = createAdminClient()
    const { companyMembershipRepository, teamInvitationRepository } = createServerContainer()
    const invite = await teamInvitationRepository.findByToken(token)

    if (!invite) {
      return { success: false, error: 'Invalid invitation token' }
    }

    if (invite.acceptedAt) {
      return { success: true, companyId: invite.companyId }
    }

    const expiresAt = new Date(invite.expiresAt)
    if (expiresAt.getTime() < Date.now()) {
      return { success: false, error: 'Invitation has expired' }
    }

    await companyMembershipRepository.upsertRole(user.id, invite.companyId, invite.role)

    await teamInvitationRepository.markAccepted(invite.id, user.id)

    await notifyCompanyAdmins(
      adminSupabase,
      invite.companyId,
      'team_update',
      'Team member joined',
      `${user.email || 'A user'} accepted an invitation and joined the team.`,
      undefined,
      { joined_user_id: user.id, joined_email: user.email || null, role: invite.role }
    )

    return { success: true, companyId: invite.companyId }
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
    const user = await getCurrentUserOrNull()

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
        const adminCount = roles.filter((r: { role: string }) => r.role === 'admin' || r.role === 'superadmin').length
        if (adminCount <= 1) {
          return { success: false, error: 'You cannot remove your own access as you are the only admin' }
        }
      }
    }

    const { companyMembershipRepository } = createServerContainer()
    await companyMembershipRepository.removeRole(roleId, companyId)

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
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Check permissions
    const canManage = await canUserManage(companyId)
    if (!canManage) {
      return { success: false, error: 'You do not have permission to change roles' }
    }

    const { companyMembershipRepository } = createServerContainer()
    await companyMembershipRepository.updateRole(roleId, companyId, newRole)

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
    // SECURITY: Validate companyId if provided
    if (companyId !== null && !validateCompanyId(companyId)) {
      return { success: false, error: 'Invalid company ID format' }
    }

    // SECURITY: Validate monthsAhead to prevent injection
    if (typeof monthsAhead !== 'number' || monthsAhead < 1 || monthsAhead > 60) {
      return { success: false, error: 'Invalid months ahead value' }
    }

    const supabase = await createClient()
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase: any = createAdminClient()

    // Check if user is superadmin (platform-level, company_id = NULL)
    const isSuperadmin = await isUserPlatformSuperadmin(user.id)

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
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase: any = createAdminClient()

    // Check if user is superadmin
    const isSuperadmin = await isUserPlatformSuperadmin(user.id)

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
        batch.map(async (template: ComplianceTemplate) => {
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
    country_code?: string
    applicable_regions?: string[]
  }
): Promise<{ success: boolean; id?: string; applied_count?: number; error?: string }> {
  try {
    const supabase = await createClient()
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase: any = createAdminClient()

    // Check if user is superadmin
    const isSuperadmin = await isUserPlatformSuperadmin(user.id)

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

    // CRITICAL FIX: Resolve Supabase user_id for Passport users
    // created_by and updated_by have FK constraint to auth.users.id, so we need to check for Supabase identity
    let supabaseUserId: string | null = null
    if (user.canonicalId) {
      // Passport user - check for linked Supabase identity
      const { authIdentityRepository } = createServerContainer()
      const allIdentities = await authIdentityRepository.findByAppUserId(user.canonicalId)
      const supabaseIdentity = allIdentities.find((id) => id.provider === 'supabase')
      if (supabaseIdentity?.legacyAuthId) {
        supabaseUserId = supabaseIdentity.legacyAuthId
      }
    } else {
      // Supabase user - use user.id directly
      supabaseUserId = user.id
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
        country_code: template.country_code || 'IN',  // Default to India for backward compatibility
        applicable_regions: template.applicable_regions || null,
        required_documents: Array.isArray((template as any).required_documents)
          ? (template as any).required_documents
          : ((template as any).required_documents ? [(template as any).required_documents] : []),
        possible_legal_action: (template as any).possible_legal_action || null,
        created_by: supabaseUserId, // Use resolved Supabase user_id or null
        updated_by: supabaseUserId  // Use resolved Supabase user_id or null
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
    country_code?: string
    applicable_regions?: string[]
  }
): Promise<{ success: boolean; applied_count?: number; error?: string }> {
  try {
    const supabase = await createClient()
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase: any = createAdminClient()

    // Check if user is superadmin
    const isSuperadmin = await isUserPlatformSuperadmin(user.id)

    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can update templates' }
    }

    // CRITICAL FIX: Resolve Supabase user_id for Passport users
    // updated_by has FK constraint to auth.users.id, so we need to check for Supabase identity
    let supabaseUserId: string | null = null
    if (user.canonicalId) {
      // Passport user - check for linked Supabase identity
      const { authIdentityRepository } = createServerContainer()
      const allIdentities = await authIdentityRepository.findByAppUserId(user.canonicalId)
      const supabaseIdentity = allIdentities.find((id) => id.provider === 'supabase')
      if (supabaseIdentity?.legacyAuthId) {
        supabaseUserId = supabaseIdentity.legacyAuthId
      }
    } else {
      // Supabase user - use user.id directly
      supabaseUserId = user.id
    }

    // Build update object
    const updateData: any = {
      updated_by: supabaseUserId, // Use resolved Supabase user_id or null
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
    if (template.country_code !== undefined) {
      updateData.country_code = template.country_code || 'IN'
    }
    if (template.applicable_regions !== undefined) {
      updateData.applicable_regions = template.applicable_regions && template.applicable_regions.length > 0 ? template.applicable_regions : null
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
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase: any = createAdminClient()

    // Check if user is superadmin
    const isSuperadmin = await isUserPlatformSuperadmin(user.id)

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
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase: any = createAdminClient()

    // Check if user is superadmin
    const isSuperadmin = await isUserPlatformSuperadmin(user.id)

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
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, applied_count: 0, template_count: 0, error: 'Not authenticated' }
    }

    const adminSupabase: any = createAdminClient()

    // Check if user is superadmin
    const isSuperadmin = await isUserPlatformSuperadmin(user.id)

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

export type Notification = AppNotification

/**
 * Get notifications for current user
 */
export async function getNotifications(
  options: { unreadOnly?: boolean; limit?: number } = {}
): Promise<{ success: boolean; notifications?: Notification[]; unreadCount?: number; error?: string }> {
  try {
    const { authService, notificationRepository } =
      createServerNotificationContainer()
    const user = await authService.requireCurrentUser()
    const useCase = new GetUserNotifications(notificationRepository)
    const result = await useCase.execute(user.id, options)

    return {
      success: true,
      notifications: result.notifications,
      unreadCount: result.unreadCount,
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
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const ids = Array.isArray(notificationIds) ? notificationIds : [notificationIds]
    const { notificationRepository } = createServerNotificationContainer()
    const useCase = new MarkUserNotificationsRead(notificationRepository)

    await useCase.execute(user.id, ids)

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
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const { notificationRepository } = createServerNotificationContainer()
    const useCase = new MarkAllUserNotificationsRead(notificationRepository)
    await useCase.execute(user.id)

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
  local_contributions: Record<string, number> | null
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
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase: any = createAdminClient()

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
    local_contributions?: Record<string, number> | null
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Check permissions
    const canEdit = await canUserEdit(companyId)
    if (!canEdit) {
      return { success: false, error: 'You do not have permission to edit company financials' }
    }

    const adminSupabase: any = createAdminClient()

    const { error } = await adminSupabase
      .from('company_financials')
      .upsert({
        company_id: companyId,
        financial_year: financialYear,
        turnover: data.turnover ?? null,
        tax_due: data.tax_due ?? null,
        local_contributions: data.local_contributions ?? null,
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
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const adminSupabase: any = createAdminClient()

    // Check if user is superadmin
    const isSuperadmin = await isUserPlatformSuperadmin(user.id)

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
  }[],
  countryCode?: string,
  applicableRegions?: string[]
): Promise<{ success: boolean; created: number; errors: string[] }> {
  try {
    const supabase = await createClient()
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, created: 0, errors: ['Not authenticated'] }
    }

    const adminSupabase: any = createAdminClient()

    // Check if user is superadmin
    const isSuperadmin = await isUserPlatformSuperadmin(user.id)

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
      const insertData = batch.map((template: any, batchIndex: number) => {
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
          country_code: countryCode || 'IN',  // Default to India for backward compatibility
          applicable_regions: applicableRegions || null,
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

/**
 * Get directors for a company
 * Uses admin client to bypass RLS
 */
export async function getCompanyDetails(companyId: string): Promise<{
  success: boolean
  company?: {
    name: string
    type: string
    incorporation_date: string
    tax_id: string | null
    registration_id: string | null
    address: string | null
    phone_number: string | null
    industry_categories: string[]
    industry: string | null
    country_code: string | null
  }
  error?: string
}> {
  try {
    const { authService, companyRepository } = createServerContainer()
    const user = await authService.getCurrentUser()

    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if user has access to this company
    const hasAccess = await canUserView(companyId)
    if (!hasAccess) {
      return { success: false, error: 'No access to this company' }
    }

    const companyDetails = await companyRepository.getDetailsById(companyId)
    if (!companyDetails) {
      return { success: false, error: 'Company not found' }
    }

    // Map to the format expected by the client
    return {
      success: true,
      company: {
        name: companyDetails.name,
        type: companyDetails.type || '',
        incorporation_date: companyDetails.incorporationDate || '',
        tax_id: companyDetails.taxId,
        registration_id: companyDetails.registrationId,
        address: companyDetails.address,
        phone_number: companyDetails.phoneNumber,
        industry_categories: companyDetails.industryCategories || [],
        industry: companyDetails.industry,
        country_code: companyDetails.countryCode,
      },
    }
  } catch (err) {
    console.error('Error in getCompanyDetails:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function getDirectors(companyId: string): Promise<{
  success: boolean
  directors?: Array<{
    id: string
    firstName: string
    lastName: string
    middleName: string
    din?: string
    designation?: string
    dob?: string
    pan?: string
    email?: string
    mobile?: string
    verified: boolean
  }>
  error?: string
}> {
  try {
    if (!validateCompanyId(companyId)) {
      return { success: false, error: 'Invalid company ID format' }
    }

    const supabase = await createClient()
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if user has access to this company
    const hasAccess = await canUserView(companyId)
    if (!hasAccess) {
      return { success: false, error: 'No access to this company' }
    }

    const { directorRepository } = createServerContainer()
    const directors = await directorRepository.getByCompanyId(companyId)
    return { success: true, directors }
  } catch (err) {
    console.error('Error in getDirectors:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function sendDocumentsEmail(params: SendDocumentsEmailParams) {
  console.log('[sendDocumentsEmail] Starting with params:', {
    companyId: params.companyId,
    documentCount: params.documentIds.length,
    recipientCount: params.recipients.length,
  })

  try {
    const { authService } = createServerContainer()
    const adminSupabase: any = createAdminClient()

    const user = await authService.getCurrentUser()
    if (!user) {
      console.error('[sendDocumentsEmail] Auth error: Not authenticated')
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
      documents.map(async (doc: {
        file_path: string
        document_type?: string | null
        name?: string | null
        category?: string | null
        period?: string | null
      }) => {
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
    const senderName = getUserDisplayName(user)

    console.log('[sendDocumentsEmail] Generated URLs for', documentsWithUrls.length, 'documents')
    console.log('[sendDocumentsEmail] Sender:', senderName, senderEmail)
    console.log('[sendDocumentsEmail] Recipients:', params.recipients)

    // Send email to each recipient
    const results = await Promise.allSettled(
      params.recipients.map(async (recipientEmail: string) => {
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
    const succeeded = results.filter((r: PromiseSettledResult<unknown>) => r.status === 'fulfilled').length
    const failed = results.filter((r: PromiseSettledResult<unknown>) => r.status === 'rejected').length

    console.log('[sendDocumentsEmail] Results - Succeeded:', succeeded, 'Failed:', failed)

    if (failed > 0 && succeeded === 0) {
      // Get error details from rejected results
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r: PromiseRejectedResult) => r.reason?.message || 'Unknown error')
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

/**
 * Hide a document template for a specific company
 * Stores the exclusion in company_document_template_exclusions table
 */
export async function hideDocumentTemplateForCompany(
  companyId: string,
  documentName: string,
  folderName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!validateCompanyId(companyId)) {
      return { success: false, error: 'Invalid company ID format' }
    }

    const supabase = await createClient()
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if user has access to this company
    const hasAccess = await canUserEdit(companyId)
    if (!hasAccess) {
      return { success: false, error: 'No permission to modify this company' }
    }

    const adminSupabase: any = createAdminClient()

    // Check if exclusion already exists
    const { data: existing, error: checkError } = await adminSupabase
      .from('company_document_template_exclusions')
      .select('id')
      .eq('company_id', companyId)
      .eq('document_name', documentName)
      .eq('folder_name', folderName)
      .maybeSingle()

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = not found, which is fine
      console.error('Error checking existing exclusion:', checkError)
      return { success: false, error: checkError.message }
    }

    // If already exists, return success
    if (existing) {
      return { success: true }
    }

    // Insert exclusion
    const { error: insertError } = await adminSupabase
      .from('company_document_template_exclusions')
      .insert({
        company_id: companyId,
        document_name: documentName,
        folder_name: folderName,
        created_by: user.id
      })

    if (insertError) {
      // If table doesn't exist, create it first (for development)
      if (insertError.code === '42P01') {
        console.warn('Table company_document_template_exclusions does not exist. Please create it first.')
        return { success: false, error: 'Database table not found. Please run migration to create company_document_template_exclusions table.' }
      }
      console.error('Error hiding document template:', insertError)
      return { success: false, error: insertError.message }
    }

    return { success: true }
  } catch (err) {
    console.error('Error in hideDocumentTemplateForCompany:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Get hidden document templates for a company
 */
export async function getHiddenDocumentTemplates(
  companyId: string
): Promise<{ success: boolean; hiddenTemplates?: Array<{ document_name: string; folder_name: string }>; error?: string }> {
  try {
    if (!validateCompanyId(companyId)) {
      return { success: false, error: 'Invalid company ID format' }
    }

    const supabase = await createClient()
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if user has access to this company
    const hasAccess = await canUserView(companyId)
    if (!hasAccess) {
      return { success: false, error: 'No access to this company' }
    }

    const adminSupabase: any = createAdminClient()

    const { data: exclusions, error } = await adminSupabase
      .from('company_document_template_exclusions')
      .select('document_name, folder_name')
      .eq('company_id', companyId)

    if (error) {
      // If table doesn't exist, return empty array
      if (error.code === '42P01') {
        return { success: true, hiddenTemplates: [] }
      }
      console.error('Error fetching hidden templates:', error)
      return { success: false, error: error.message }
    }

    return { success: true, hiddenTemplates: exclusions || [] }
  } catch (err) {
    console.error('Error in getHiddenDocumentTemplates:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Hide a compliance for a specific company
 * This excludes it from tracker display, penalty calculations, and reports
 */
export async function hideComplianceForCompany(
  companyId: string,
  requirementId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!validateCompanyId(companyId)) {
      return { success: false, error: 'Invalid company ID format' }
    }

    const supabase = await createClient()
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if user has admin or editor access to this company
    const hasAccess = await canUserEdit(companyId)
    if (!hasAccess) {
      return { success: false, error: 'Only admins and editors can hide compliances' }
    }

    const adminSupabase: any = createAdminClient()

    // Insert exclusion (using upsert to handle duplicates)
    const { error: insertError } = await adminSupabase
      .from('company_compliance_exclusions')
      .upsert({
        company_id: companyId,
        requirement_id: requirementId,
        created_by: user.id
      }, {
        onConflict: 'company_id,requirement_id'
      })

    if (insertError) {
      // If table doesn't exist, create it first (for development)
      if (insertError.code === '42P01') {
        console.warn('Table company_compliance_exclusions does not exist. Please create it first.')
        return { success: false, error: 'Database table not found. Please run migration to create company_compliance_exclusions table.' }
      }
      console.error('Error hiding compliance:', insertError)
      return { success: false, error: insertError.message }
    }

    return { success: true }
  } catch (err) {
    console.error('Error in hideComplianceForCompany:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Show a compliance for a company (remove from exclusions)
 */
export async function showComplianceForCompany(
  companyId: string,
  requirementId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!validateCompanyId(companyId)) {
      return { success: false, error: 'Invalid company ID format' }
    }

    const supabase = await createClient()
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if user has admin or editor access to this company
    const hasAccess = await canUserEdit(companyId)
    if (!hasAccess) {
      return { success: false, error: 'Only admins and editors can manage compliances' }
    }

    const adminSupabase: any = createAdminClient()

    // Delete exclusion
    const { error: deleteError } = await adminSupabase
      .from('company_compliance_exclusions')
      .delete()
      .eq('company_id', companyId)
      .eq('requirement_id', requirementId)

    if (deleteError) {
      console.error('Error showing compliance:', deleteError)
      return { success: false, error: deleteError.message }
    }

    return { success: true }
  } catch (err) {
    console.error('Error in showComplianceForCompany:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Get hidden compliance IDs for a company
 */
export async function getHiddenCompliances(
  companyId: string
): Promise<{ success: boolean; hiddenComplianceIds?: string[]; error?: string }> {
  try {
    if (!validateCompanyId(companyId)) {
      return { success: false, error: 'Invalid company ID format' }
    }

    const supabase = await createClient()
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if user has access to this company
    const hasAccess = await canUserView(companyId)
    if (!hasAccess) {
      return { success: false, error: 'No access to this company' }
    }

    const adminSupabase: any = createAdminClient()

    const { data: exclusions, error } = await adminSupabase
      .from('company_compliance_exclusions')
      .select('requirement_id')
      .eq('company_id', companyId)

    if (error) {
      // If table doesn't exist, return empty array (for development)
      if (error.code === '42P01') {
        console.warn('Table company_compliance_exclusions does not exist. Please create it first.')
        return { success: true, hiddenComplianceIds: [] }
      }
      console.error('Error fetching hidden compliances:', error)
      return { success: false, error: error.message }
    }

    const hiddenIds = (exclusions || []).map((ex: { requirement_id: string }) => ex.requirement_id)
    return { success: true, hiddenComplianceIds: hiddenIds }
  } catch (err) {
    console.error('Error in getHiddenCompliances:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}



/**
 * Consolidated action to fetch all initial data needed for the Data Room.
 * This combines multiple checks into a single server round-trip to prevent UI waterfalls.
 */
export async function getDataRoomInitState(preferredCompanyId: string | null = null): Promise<{
  success: boolean
  data?: {
    user: { id: string; email: string; fullName: string | null }
    companies: any[]
    accessibleCompanyIds: string[]
    currentCompanyId: string | null
    companyAccess: import('@/domain/types/CompanyAccess').CompanyAccessSnapshot | null
    userSubscription: {
      hasSubscription: boolean
      tier: string
      isTrial: boolean
      trialDaysRemaining: number
      companyLimit: number
      currentCompanyCount: number
      canCreateCompany: boolean
    }
    // New: Initial company details to prevent Overview tab flicker
    initialEntityDetails?: any
    hiddenTemplates: string[]
    hiddenCompliances: string[]
    userRole: 'superadmin' | 'admin' | 'editor' | 'viewer'
    initialRequirements: any[]
    // Fast-path redirect flag
    redirectTo?: string
  }
  error?: string
}> {
  try {
    const initStartTime = performance.now()
    const { authService, accessService, companyRepository, subscriptionRepository } = createServerContainer()
    
    const authStartTime = performance.now()
    const user = await authService.requireCurrentUser()
    console.log(`[InitAction] Auth check took ${(performance.now() - authStartTime).toFixed(2)}ms`)
    
    // 1. Get accessible company IDs (optimized)
    const accessibleStartTime = performance.now()
    const accessibleUseCase = new GetAccessibleCompanyIds(accessService)
    const accessibleCompanyIds = await accessibleUseCase.execute(user.id)
    console.log(`[InitAction] Get accessible company IDs took ${(performance.now() - accessibleStartTime).toFixed(2)}ms`)
    
    // 2. Determine actual current company ID early so we can fetch its details
    let currentCompanyId = preferredCompanyId
    if (!currentCompanyId || !accessibleCompanyIds.includes(currentCompanyId)) {
      currentCompanyId = accessibleCompanyIds[0] || null
    }
    
    // ULTRA-FAST-PATH: Lightweight subscription check FIRST (before full access snapshot)
    // This is much faster than GetCompanyAccessSnapshot because it only checks subscription, not roles/permissions
    if (currentCompanyId) {
      const ultraFastCheckStart = performance.now()
      
      // Get company to find owner (lightweight query)
      const company = await companyRepository.getById(currentCompanyId)
      if (!company) {
        // Company doesn't exist, skip fast-path
      } else {
        const isOwner = company.ownerUserId === user.id || company.ownerAppUserId === user.id
        
        // For owners: check their subscription (company or user)
        // For invited members: check owner's subscription
        const ownerId = company.ownerAppUserId || company.ownerUserId
        
        if (ownerId) {
          // Parallel: Check both company subscription and owner's user subscription
          const [companySub, ownerUserSub] = await Promise.all([
            subscriptionRepository.getCompanySubscriptionState(currentCompanyId),
            subscriptionRepository.getUserSubscriptionState(ownerId)
          ])
          
          const hasActiveSubscription = Boolean(
            (companySub && companySub.hasSubscription) ||
            (ownerUserSub && ownerUserSub.hasSubscription)
          )
          
          console.log(`[InitAction] Ultra-fast subscription check took ${(performance.now() - ultraFastCheckStart).toFixed(2)}ms`, {
            hasActiveSubscription,
            isOwner,
            companySub: companySub?.hasSubscription,
            ownerUserSub: ownerUserSub?.hasSubscription
          })
          
          // If NO active subscription, redirect immediately (skip all other data loading)
          if (!hasActiveSubscription) {
            return {
              success: true,
              data: {
                user: { id: user.id, email: user.email || '', fullName: user.fullName || null },
                companies: [],
                accessibleCompanyIds: [],
                currentCompanyId: null,
                companyAccess: null,
                userSubscription: {
                  hasSubscription: false,
                  tier: 'none',
                  isTrial: false,
                  trialDaysRemaining: 0,
                  companyLimit: 0,
                  currentCompanyCount: 0,
                  canCreateCompany: false,
                },
                hiddenTemplates: [],
                hiddenCompliances: [],
                userRole: 'viewer',
                initialRequirements: [],
                redirectTo: isOwner 
                  ? `/subscription-required?company_id=${currentCompanyId}`
                  : `/owner-subscription-expired?company_id=${currentCompanyId}`,
              }
            }
          }
        }
      }
    }
    
    // FAST-PATH: Full access snapshot (only if subscription is active)
    // This is still needed for proper access type determination, but subscription check already passed
    let fastAccessSnapshot: import('@/domain/types/CompanyAccess').CompanyAccessSnapshot | null = null
    if (currentCompanyId) {
      const fastAccessCheckStart = performance.now()
      fastAccessSnapshot = await (new GetCompanyAccessSnapshot(accessService)).execute(user.id, currentCompanyId)
      console.log(`[InitAction] Full access check took ${(performance.now() - fastAccessCheckStart).toFixed(2)}ms`)
    }
    // 3. Fetch all components in parallel
    const { createAdminClient } = await import('@/utils/supabase/admin')
    const adminSupabase = createAdminClient()
    const { directorRepository, requirementRepository, authService: authSvc, accessService: accSvc, companyRepository: compRepo, subscriptionRepository: subRepo } = createServerContainer()
    
    const startParallel = performance.now()
    const results = await Promise.all([
      // A: Fetch basic details for all accessible companies (for selector)
      (async () => {
        const s = performance.now()
        if (accessibleCompanyIds.length === 0) return []
        const { data, error } = await adminSupabase
          .from('companies')
          .select('id, name, type, incorporation_date, country_code, region')
          .in('id', accessibleCompanyIds)
        if (error) throw error
        console.log(`[InitAction] Fetch companies took ${(performance.now() - s).toFixed(2)}ms`)
        return data || []
      })(),
      
      // B: Fetch user subscription summary
      (async () => {
        const s = performance.now()
        const res = await subscriptionRepository.getUserSubscriptionState(user.id)
        console.log(`[InitAction] Fetch user sub took ${(performance.now() - s).toFixed(2)}ms`)
        return res
      })(),
      
      // C: Fetch owned companies count
      (async () => {
        const s = performance.now()
        const res = await companyRepository.listOwnedByUser(user.id)
        console.log(`[InitAction] Fetch owned count took ${(performance.now() - s).toFixed(2)}ms`)
        return res
      })(),
      
      // D: Reuse fast-path access snapshot (already fetched above)
      Promise.resolve(fastAccessSnapshot),
      
      // E: Fetch full details and directors for the CURRENT company
      currentCompanyId ? (async () => {
        const s = performance.now()
        
        const [companyResult, directors] = await Promise.all([
          adminSupabase
            .from('companies')
            .select('id, name, type, incorporation_date, tax_id, registration_id, address, phone_number, industry_categories, industry, country_code')
            .eq('id', currentCompanyId)
            .single(),
          directorRepository.getByCompanyId(currentCompanyId)
        ])
        
        if (companyResult.error) return null
        const company = companyResult.data as any

        // Formatting logic
        const incorporationDate = company?.incorporation_date ? new Date(company.incorporation_date) : new Date()
        const formattedDate = incorporationDate.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })

        const res = {
          companyName: company?.name || 'Unknown',
          type: (company?.type || '').toUpperCase(),
          regDate: formattedDate,
          taxId: company?.tax_id || 'Not Provided',
          registrationId: company?.registration_id || 'Not Provided',
          address: company?.address || 'Not Provided',
          phoneNumber: company?.phone_number || 'Not Provided',
          industryCategory: Array.isArray(company?.industry_categories)
            ? company.industry_categories.join(', ')
            : company?.industry || 'Not Provided',
          directors: (directors || []).map((d: any) => ({
            id: d.id,
            firstName: d.firstName,
            lastName: d.lastName,
            middleName: d.middleName,
            din: d.din,
            designation: d.designation,
            dob: d.dob,
            pan: d.pan,
            email: d.email,
            mobile: d.mobile,
            verified: d.verified,
          })),
        }
        console.log(`[InitAction] Fetch entity details took ${(performance.now() - s).toFixed(2)}ms`)
        return res
      })() : Promise.resolve(null),

      // F: Hidden Templates (Optimized)
      currentCompanyId ? (async () => {
        const s = performance.now()
        const { data } = await adminSupabase
          .from('company_document_template_exclusions')
          .select('folder_name, document_name')
          .eq('company_id', currentCompanyId)
        console.log(`[InitAction] Fetch hidden templates took ${(performance.now() - s).toFixed(2)}ms`)
        return ((data as any[]) || []).map((t: any) => `${t.folder_name}:${t.document_name}`)
      })() : Promise.resolve([]),

      // G: Hidden Compliances
      currentCompanyId ? (async () => {
        const s = performance.now()
        const { data } = await adminSupabase
          .from('company_compliance_exclusions')
          .select('compliance_id')
          .eq('company_id', currentCompanyId)
        console.log(`[InitAction] Fetch hidden compliances took ${(performance.now() - s).toFixed(2)}ms`)
        return ((data as any[]) || []).map((c: any) => c.compliance_id)
      })() : Promise.resolve([]),

      // H: User Role for current company
      currentCompanyId ? (async () => {
        const s = performance.now()
        const res = await getUserRole(currentCompanyId)
        console.log(`[InitAction] Fetch user role took ${(performance.now() - s).toFixed(2)}ms`)
        return res.success ? res.role : 'viewer'
      })() : Promise.resolve('viewer'),

      // I: Regulatory Requirements
      currentCompanyId ? (async () => {
        const s = performance.now()
        const res = await getRegulatoryRequirements(currentCompanyId)
        console.log(`[InitAction] Fetch requirements took ${(performance.now() - s).toFixed(2)}ms`)
        return res.success ? res.requirements : []
      })() : Promise.resolve([])
    ])

    const [
      companiesResult, 
      subscriptionState, 
      ownedCompanies, 
      currentCompanyAccess, 
      currentCompanyDetails,
      hiddenTemplatesResult,
      hiddenCompliancesResult,
      userRoleResult,
      regulatoryRequirementsResult
    ] = results
    
    console.log(`[InitAction] Total Parallel fetches took ${(performance.now() - startParallel).toFixed(2)}ms`)
    console.log(`[InitAction] Total initialization took ${(performance.now() - initStartTime).toFixed(2)}ms`)

    // 4. Calculate subscription summary
    const hasActiveSubscription = Boolean(
      subscriptionState?.hasSubscription ||
      (subscriptionState?.isTrial && (subscriptionState?.trialDaysRemaining ?? 0) > 0)
    )
    
    return {
      success: true,
      data: {
        user: { 
          id: user.id, 
          email: user.email || '', 
          fullName: user.fullName || null 
        },
        companies: companiesResult || [],
        accessibleCompanyIds,
        currentCompanyId,
        companyAccess: currentCompanyAccess,
        userSubscription: {
          hasSubscription: hasActiveSubscription,
          tier: subscriptionState?.tier ?? 'none',
          isTrial: subscriptionState?.isTrial ?? false,
          trialDaysRemaining: subscriptionState?.trialDaysRemaining ?? 0,
          companyLimit: subscriptionState?.companyLimit ?? 0,
          currentCompanyCount: (ownedCompanies || []).length,
          canCreateCompany: hasActiveSubscription && (ownedCompanies || []).length < (subscriptionState?.companyLimit ?? 0),
        },
        initialEntityDetails: currentCompanyDetails,
        hiddenTemplates: hiddenTemplatesResult as string[],
        hiddenCompliances: hiddenCompliancesResult as string[],
        userRole: userRoleResult as any,
        initialRequirements: (regulatoryRequirementsResult || []) as any[],
        redirectTo: undefined // No redirect needed if we got here
      }
    }
  } catch (error: any) {
    console.error('Error in getDataRoomInitState:', error)
    return { 
      success: false, 
      error: error.message || 'Failed to initialize Data Room' 
    }
  }
}
