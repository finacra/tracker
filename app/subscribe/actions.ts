'use server'

import { createServerContainer } from '@/lib/composition/server-container'
import { handleActionError } from '@/lib/errors/handle-error'
import { validateCompanyId } from '@/lib/utils/input-validation'

export async function getCompanyTrialEligibility(
  companyId: string | null,
  accessibleCompanyIds?: string[]
): Promise<{ success: boolean; eligible?: boolean; reason?: string; error?: string }> {
  if (companyId && !validateCompanyId(companyId)) {
    return { success: false, error: 'Invalid company ID format' }
  }

  try {
    const { authService, companyRepository, subscriptionRepository } = createServerContainer()
    const user = await authService.getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    if (await subscriptionRepository.hasUsedEnterpriseUserTrial(user.id)) {
      return {
        success: true,
        eligible: false,
        reason: 'enterprise_trial_used',
      }
    }

    if (!companyId) {
      return {
        success: true,
        eligible: true,
      }
    }

    const company = await companyRepository.getById(companyId)
    if (!company) {
      return { success: false, error: 'Company not found' }
    }

    // Check if user has access to this company
    // Option 1: User is the owner
    const isOwner = company.ownerUserId === user.id || (company as any).appUserId === user.id
    
    // Option 2: Company is in accessibleCompanyIds (passed from client)
    const hasAccessViaList = accessibleCompanyIds?.includes(companyId) || false
    
    // Option 3: Check via company memberships (fallback)
    let hasAccessViaMembership = false
    if (!isOwner && !hasAccessViaList) {
      try {
        const { companyMembershipRepository } = createServerContainer()
        const memberships = await companyMembershipRepository.getRoles(companyId)
        hasAccessViaMembership = memberships.some(m => m.userId === user.id || (m as any).appUserId === user.id)
      } catch (err) {
        // If membership check fails, continue with other checks
        console.warn('[getCompanyTrialEligibility] Failed to check memberships:', err)
      }
    }

    // User must have access via one of the methods above
    if (!isOwner && !hasAccessViaList && !hasAccessViaMembership) {
      return { success: false, error: 'Unauthorized' }
    }

    // Only owners can create company trials, but team members should be able to see eligibility
    if (!isOwner) {
      // Team members can see eligibility but can't create trials (only owners can)
      // Return eligible: false with a reason that indicates they need owner to create trial
      return {
        success: true,
        eligible: false,
        reason: 'requires_owner',
      }
    }

    const hasUsedCompanyTrial = await subscriptionRepository.hasUsedCompanyTrial(companyId)

    return {
      success: true,
      eligible: !hasUsedCompanyTrial,
      reason: hasUsedCompanyTrial ? 'company_trial_used' : undefined,
    }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function getSubscribeCompanyContext(
  companyId: string | null,
  accessibleCompanyIds: string[]
): Promise<{
  success: boolean
  companyName?: string
  userCompanies?: Array<{ id: string; name: string }>
  accessibleCompanies?: Array<{ id: string; name: string }>
  error?: string
}> {
  const validCompanyId = companyId && validateCompanyId(companyId) ? companyId : null
  const validAccessibleIds = accessibleCompanyIds.filter((id: string) => validateCompanyId(id))

  try {
    const { authService, companyRepository } = createServerContainer()
    const user = await authService.requireCurrentUser()
    const [userCompanies, accessibleCompanies] = await Promise.all([
      companyRepository.listOwnedByUser(user.id),
      companyRepository.listByIds(validAccessibleIds),
    ])

    const companyName =
      validCompanyId && (userCompanies.some((company) => company.id === validCompanyId) || validAccessibleIds.includes(validCompanyId))
        ? (await companyRepository.getById(validCompanyId))?.name
        : undefined

    return {
      success: true,
      companyName,
      userCompanies: userCompanies.map((company) => ({ id: company.id, name: company.name })),
      accessibleCompanies: accessibleCompanies.map((company) => ({ id: company.id, name: company.name })),
    }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function createTrialSubscription(targetCompanyId: string | null): Promise<{
  success: boolean
  redirectTo?: string
  error?: string
}> {
  const validCompanyId = targetCompanyId && validateCompanyId(targetCompanyId) ? targetCompanyId : null

  try {
    const { authService, companyRepository, subscriptionRepository } = createServerContainer()
    const user = await authService.requireCurrentUser()
    const ownedCompanies = await companyRepository.listOwnedByUser(user.id)

    if (ownedCompanies.length === 0) {
      try {
        await subscriptionRepository.createUserTrial(user.id, user.canonicalId)
      } catch (trialErr) {
        throw trialErr
      }
      return { success: true, redirectTo: '/onboarding' }
    }

    const finalCompanyId = validCompanyId || ownedCompanies[0]?.id || null
    if (!finalCompanyId) {
      return { success: false, error: 'Please select a company for the trial' }
    }

    const selectedCompany = ownedCompanies.find((company) => company.id === finalCompanyId)
    if (!selectedCompany) {
      return { success: false, error: 'Unauthorized' }
    }

    if (await subscriptionRepository.hasUsedEnterpriseUserTrial(user.id)) {
      return {
        success: false,
        error: 'Your account has already used its Enterprise trial. Please subscribe to continue.',
      }
    }

    if (await subscriptionRepository.hasUsedCompanyTrial(finalCompanyId)) {
      return {
        success: false,
        error: 'This company has already used its trial. Please subscribe to continue.',
      }
    }

    await subscriptionRepository.createCompanyTrial(user.id, finalCompanyId, user.canonicalId)
    return { success: true, redirectTo: `/data-room?company_id=${finalCompanyId}` }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function getCompanySubscriptionState(
  companyId: string | null
): Promise<{
  success: boolean
  subscription?: {
    hasSubscription: boolean
    tier: string
    isTrial: boolean
    trialDaysRemaining: number
    userLimit: number
  } | null
  error?: string
}> {
  if (!companyId) {
    return { success: true, subscription: null }
  }

  if (!validateCompanyId(companyId)) {
    return { success: false, error: 'Invalid company ID format' }
  }

  try {
    const { subscriptionRepository } = createServerContainer()
    const subscription = await subscriptionRepository.getCompanySubscriptionState(companyId)
    return { success: true, subscription }
  } catch (error) {
    return handleActionError(error)
  }
}
