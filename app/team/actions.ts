'use server'

import { createServerContainer } from '@/lib/composition/server-container'
import { handleActionError } from '@/lib/errors/handle-error'
import type { Subscription } from '@/lib/subscriptions/subscription'

export async function getTeamCompanySubscription(companyId: string): Promise<Subscription | null> {
  const { subscriptionRepository } = createServerContainer()
  const subscription = await subscriptionRepository.getLatestForCompany(companyId)

  if (!subscription) {
    return null
  }

  return {
    id: subscription.id,
    user_id: subscription.userId,
    company_id: subscription.companyId,
    tier: subscription.tier as Subscription['tier'],
    billing_cycle: subscription.billingCycle as Subscription['billing_cycle'],
    amount: subscription.amount,
    currency: subscription.currency,
    status: subscription.status as Subscription['status'],
    start_date: subscription.startDate,
    end_date: subscription.endDate,
    current_period_start: subscription.currentPeriodStart,
    current_period_end: subscription.currentPeriodEnd,
    cancel_at_period_end: subscription.cancelAtPeriodEnd,
    cancelled_at: subscription.cancelledAt,
    is_trial: subscription.isTrial,
    trial_started_at: subscription.trialStartedAt,
    trial_ends_at: subscription.trialEndsAt,
    created_at: subscription.createdAt,
    updated_at: subscription.updatedAt,
  }
}

export async function getUserCompanies() {
  try {
    const { companyRepository, companyMembershipRepository, authService } = createServerContainer()
    const user = await authService.requireCurrentUser()

    // Get owned companies and invited companies in parallel
    const [ownedCompanies, userRoles] = await Promise.all([
      companyRepository.listOwnedByUser(user.id),
      companyMembershipRepository.getRolesByUserId(user.id)
    ])

    // Extract company IDs from user roles (exclude null company_id for superadmin)
    const invitedCompanyIds = userRoles
      .filter(role => role.companyId !== null)
      .map(role => role.companyId as string)

    // Get company details for invited companies
    let invitedCompanies: any[] = []
    if (invitedCompanyIds.length > 0) {
      invitedCompanies = await companyRepository.listByIds(invitedCompanyIds)
    }

    // Combine and deduplicate
    const companyMap = new Map<string, any>()
    
    ownedCompanies.forEach(c => {
      companyMap.set(c.id, {
        id: c.id,
        name: c.name,
        type: 'company', // Default type if not available
        year: new Date().getFullYear().toString(), // Will be updated with actual data
      })
    })

    invitedCompanies.forEach(c => {
      if (!companyMap.has(c.id)) {
        companyMap.set(c.id, {
          id: c.id,
          name: c.name,
          type: 'company',
          year: new Date().getFullYear().toString(),
        })
      }
    })

    // Get full details for all companies to get incorporation_date, type, country_code, region
    const allCompanyIds = Array.from(companyMap.keys())
    const allCompanyDetails = await Promise.all(
      allCompanyIds.map(id => companyRepository.getDetailsById(id))
    )

    // Update with actual data
    const companies = allCompanyDetails
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .map(c => ({
        id: c.id,
        name: c.name,
        type: c.type || 'company',
        year: c.incorporationDate 
          ? new Date(c.incorporationDate).getFullYear().toString()
          : new Date().getFullYear().toString(),
        country_code: c.countryCode || undefined,
        region: undefined, // Not available in CompanyDetailsRecord, would need to query separately
      }))
      .sort((a, b) => b.id.localeCompare(a.id)) // Sort by ID (newest first)

    return {
      success: true,
      companies
    }
  } catch (error) {
    return { ...handleActionError(error), companies: [] }
  }
}

export async function getCompanyOwnerId(companyId: string) {
  try {
    const { companyMembershipRepository } = createServerContainer()
    const ownerId = await companyMembershipRepository.getCompanyOwnerId(companyId)
    return {
      success: true,
      ownerId
    }
  } catch (error) {
    return { ...handleActionError(error), ownerId: null }
  }
}
