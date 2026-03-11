'use server'

import { createServerContainer } from '@/lib/composition/server-container'
import type { SubscriptionRecord } from '@/application/interfaces/SubscriptionRepository'

type AdminCompanyInput = {
  id: string
  name: string
  type: string
  incorporation_date: string | null
  country_code: string | null
  region: null
  created_at: null
  user_id: string
}

function getSubscriptionPriority(subscription: SubscriptionRecord | null): number {
  if (!subscription) return 3
  const endDate = new Date(subscription.trialEndsAt || subscription.endDate)
  const isExpired = subscription.status === 'expired' || endDate < new Date()
  if (subscription.isTrial && !isExpired) return 0
  if (!subscription.isTrial && !isExpired) return 1
  if (isExpired) return 2
  return 3
}

async function getUserEmailMap(userIds: string[]) {
  const { userRepository } = createServerContainer()
  const entries = await Promise.all(
    userIds.map(async (userId) => [userId, await userRepository.getById(userId)] as const)
  )

  return new Map(
    entries.map(([userId, user]) => [userId, user?.email || `${userId.substring(0, 8)}...`])
  )
}

export async function getUsersManagementData(companies: AdminCompanyInput[]) {
  const { companyMembershipRepository, subscriptionRepository } = createServerContainer()
  const [subscriptions, memberships] = await Promise.all([
    subscriptionRepository.listAll(),
    companyMembershipRepository.getRoles(),
  ])

  const subscriberUserIds = new Set<string>(subscriptions.map((subscription) => subscription.userId))
  companies.forEach((company) => subscriberUserIds.add(company.user_id))

  const allUserIds = new Set<string>(subscriberUserIds)
  memberships.forEach((membership) => allUserIds.add(membership.userId))
  const emailMap = await getUserEmailMap(Array.from(allUserIds))

  const users = Array.from(subscriberUserIds).map((userId) => {
    const userSubscription = subscriptions.find((subscription) => subscription.userId === userId) || null
    const ownedCompanies = companies
      .filter((company) => company.user_id === userId)
      .map((company) => {
        const teamMembers = memberships
          .filter((membership) => membership.companyId === company.id)
          .map((membership) => ({
            user_id: membership.userId,
            email: emailMap.get(membership.userId) || `${membership.userId.substring(0, 8)}...`,
            role: membership.role,
          }))
        const companySubscription = subscriptions.find(
          (subscription) => subscription.companyId === company.id && subscription.subscriptionType === 'company'
        ) || null

        return {
          ...company,
          team_members: teamMembers,
          subscription: companySubscription ? {
            id: companySubscription.id,
            company_id: companySubscription.companyId,
            status: companySubscription.status,
            tier: companySubscription.tier,
            is_trial: companySubscription.isTrial,
            trial_ends_at: companySubscription.trialEndsAt,
            end_date: companySubscription.endDate,
            subscription_type: companySubscription.subscriptionType || 'company',
          } : null,
          has_used_trial: subscriptions.some((subscription) => subscription.companyId === company.id && subscription.subscriptionType === 'company' && subscription.isTrial),
        }
      })
    const invitedTo = memberships
      .filter((membership) => membership.userId === userId && membership.companyId && !ownedCompanies.some((company) => company.id === membership.companyId))
      .map((membership) => ({
        company_id: membership.companyId as string,
        company_name: companies.find((company) => company.id === membership.companyId)?.name || 'Unknown',
        role: membership.role,
      }))

    return {
      id: userId,
      email: emailMap.get(userId) || `${userId.substring(0, 8)}...`,
      created_at: userSubscription?.createdAt || '',
      last_sign_in_at: null,
      companies_owned: ownedCompanies,
      subscription: userSubscription ? {
        id: userSubscription.id,
        user_id: userSubscription.userId,
        status: userSubscription.status,
        tier: userSubscription.tier,
        is_trial: userSubscription.isTrial,
        trial_started_at: userSubscription.trialStartedAt,
        trial_ends_at: userSubscription.trialEndsAt,
        start_date: userSubscription.startDate,
        end_date: userSubscription.endDate,
        created_at: userSubscription.createdAt,
      } : null,
      invited_to: invitedTo,
      has_used_enterprise_trial: subscriptions.some((subscription) => subscription.userId === userId && subscription.subscriptionType === 'user' && subscription.tier === 'enterprise' && subscription.isTrial),
    }
  })

  users.sort((a, b) => {
    const orderDiff = getSubscriptionPriority(a.subscription ? {
      id: a.subscription.id, userId: a.subscription.user_id, companyId: null, subscriptionType: 'user', status: a.subscription.status, tier: a.subscription.tier, billingCycle: 'monthly', amount: 0, currency: 'INR', startDate: a.subscription.start_date, endDate: a.subscription.end_date, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelledAt: null, isTrial: a.subscription.is_trial, trialStartedAt: a.subscription.trial_started_at, trialEndsAt: a.subscription.trial_ends_at, createdAt: a.subscription.created_at, updatedAt: a.subscription.created_at,
    } : null) - getSubscriptionPriority(b.subscription ? {
      id: b.subscription.id, userId: b.subscription.user_id, companyId: null, subscriptionType: 'user', status: b.subscription.status, tier: b.subscription.tier, billingCycle: 'monthly', amount: 0, currency: 'INR', startDate: b.subscription.start_date, endDate: b.subscription.end_date, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelledAt: null, isTrial: b.subscription.is_trial, trialStartedAt: b.subscription.trial_started_at, trialEndsAt: b.subscription.trial_ends_at, createdAt: b.subscription.created_at, updatedAt: b.subscription.created_at,
    } : null)
    if (orderDiff !== 0) return orderDiff
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return { users }
}

export async function getAllUsersManagementData(companies: AdminCompanyInput[]) {
  const { companyMembershipRepository, subscriptionRepository } = createServerContainer()
  const [subscriptions, memberships] = await Promise.all([
    subscriptionRepository.listAll(),
    companyMembershipRepository.getRoles(),
  ])
  const allUserIds = new Set<string>()
  companies.forEach((company) => allUserIds.add(company.user_id))
  subscriptions.forEach((subscription) => allUserIds.add(subscription.userId))
  memberships.forEach((membership) => allUserIds.add(membership.userId))
  const emailMap = await getUserEmailMap(Array.from(allUserIds))

  const users = Array.from(allUserIds).map((userId) => {
    const userSubscription = subscriptions.find((subscription) => subscription.userId === userId) || null
    const ownedCompanies = companies.filter((company) => company.user_id === userId)
    const teamMemberships = memberships
      .filter((membership) => membership.userId === userId && membership.companyId && !ownedCompanies.some((company) => company.id === membership.companyId))
      .map((membership) => ({
        company_id: membership.companyId as string,
        company_name: companies.find((company) => company.id === membership.companyId)?.name || 'Unknown',
        role: membership.role,
      }))

    return {
      id: userId,
      email: emailMap.get(userId) || `${userId.substring(0, 8)}...`,
      created_at: userSubscription?.createdAt || '',
      last_sign_in_at: null,
      companies_owned: ownedCompanies,
      team_memberships: teamMemberships,
      subscription: userSubscription ? {
        id: userSubscription.id,
        user_id: userSubscription.userId,
        status: userSubscription.status,
        tier: userSubscription.tier,
        is_trial: userSubscription.isTrial,
        trial_started_at: userSubscription.trialStartedAt,
        trial_ends_at: userSubscription.trialEndsAt,
        start_date: userSubscription.startDate,
        end_date: userSubscription.endDate,
        created_at: userSubscription.createdAt,
        billing_cycle: userSubscription.billingCycle,
        amount: userSubscription.amount,
        currency: userSubscription.currency,
      } : null,
    }
  })

  users.sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
    return dateB - dateA
  })

  return { users }
}

export async function extendSubscriptionTrialAction(subscriptionId: string, days: number) {
  const { subscriptionRepository } = createServerContainer()
  const subscription = await subscriptionRepository.getById(subscriptionId)
  if (!subscription) throw new Error('Subscription not found')
  
  const currentEndDate = subscription.trialEndsAt 
    ? new Date(subscription.trialEndsAt) 
    : (subscription.endDate ? new Date(subscription.endDate) : new Date())
    
  const baseDate = currentEndDate < new Date() ? new Date() : currentEndDate
  await subscriptionRepository.extendTrial(subscriptionId, baseDate, days)
}

export async function revokeSubscriptionAction(subscriptionId: string) {
  const { subscriptionRepository } = createServerContainer()
  await subscriptionRepository.revokeSubscription(subscriptionId)
}

export async function grantEnterpriseTrialAction(userId: string, days: number) {
  const { subscriptionRepository } = createServerContainer()
  await subscriptionRepository.grantEnterpriseTrial(userId, days)
}

export async function grantCompanyTrialAction(userId: string, companyId: string, tier: string, days: number) {
  const { subscriptionRepository } = createServerContainer()
  await subscriptionRepository.grantCompanyTrial(userId, companyId, tier, days)
}

export async function changeSubscriptionTierAction(subscriptionId: string, tier: string) {
  const { subscriptionRepository } = createServerContainer()
  await subscriptionRepository.changeTier(subscriptionId, tier)
}

export async function checkSuperadminStatus() {
  try {
    const { accessService, authService } = createServerContainer()
    const user = await authService.requireCurrentUser()
    const isSuperadmin = await accessService.isSuperadmin(user.id)
    return {
      success: true,
      isSuperadmin
    }
  } catch (error: any) {
    console.error('[checkSuperadminStatus] Error:', error)
    return {
      success: false,
      isSuperadmin: false,
      error: error.message
    }
  }
}

export async function getAllCompaniesForAdmin() {
  try {
    const { companyRepository, accessService, authService } = createServerContainer()
    const user = await authService.requireCurrentUser()
    
    // Check if user is superadmin
    const isSuperadmin = await accessService.isSuperadmin(user.id)
    if (!isSuperadmin) {
      return {
        success: false,
        companies: [],
        error: 'Unauthorized: Superadmin access required'
      }
    }
    
    // Get all companies (superadmin only)
    const companies = await companyRepository.listAll()
    
    // Get details for each company to get full data
    const companiesWithDetails = await Promise.all(
      companies.map(async (c) => {
        const details = await companyRepository.getDetailsById(c.id)
        return {
          id: c.id,
          name: c.name,
          type: details?.type || 'company',
          incorporation_date: details?.incorporationDate || null,
          country_code: details?.countryCode || null,
          region: null, // Not in CompanyDetailsRecord
          created_at: null, // Not in CompanyDetailsRecord
          user_id: c.ownerUserId,
        }
      })
    )
    
    return {
      success: true,
      companies: companiesWithDetails.sort((a, b) => {
        // Sort by created_at if available, otherwise by name
        if (a.created_at && b.created_at) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        }
        return a.name.localeCompare(b.name)
      })
    }
  } catch (error: any) {
    console.error('[getAllCompaniesForAdmin] Error:', error)
    return {
      success: false,
      companies: [],
      error: error.message
    }
  }
}