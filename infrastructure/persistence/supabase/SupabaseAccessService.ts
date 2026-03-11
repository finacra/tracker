import type { AccessService } from '@/application/interfaces/AccessService'
import type { CompanyAccessSnapshot } from '@/domain/types/CompanyAccess'
import type { AppRole } from '@/domain/types/Role'
import { createAdminClient } from '@/utils/supabase/admin'
import { SupabaseSubscriptionRepository } from './SupabaseSubscriptionRepository'

type SubscriptionRPCResponse = {
  has_subscription: boolean
  tier: string
  is_trial: boolean
  trial_days_remaining: number
  company_limit: number
  user_limit: number
}

export class SupabaseAccessService implements AccessService {
  async isSuperadmin(userId: string): Promise<boolean> {
    const adminSupabase: any = createAdminClient()
    const { data } = await adminSupabase
      .from('user_roles')
      .select('company_id')
      .eq('user_id', userId)
      .eq('role', 'superadmin')

    return Boolean(
      data?.some((row: { company_id: string | null }) => row.company_id === null)
    )
  }

  async getRoleForCompany(userId: string, companyId: string): Promise<AppRole | null> {
    if (await this.isSuperadmin(userId)) {
      return 'superadmin'
    }

    const adminSupabase: any = createAdminClient()

    const { data: company } = await adminSupabase
      .from('companies')
      .select('user_id')
      .eq('id', companyId)
      .single()

    if (company?.user_id === userId) {
      return 'admin'
    }

    const { data } = await adminSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .single()

    return (data?.role as AppRole | undefined) ?? null
  }

  async canViewCompany(userId: string, companyId: string): Promise<boolean> {
    const access = await this.getCompanyAccessSnapshot(userId, companyId)
    return access.hasAccess
  }

  async getCompanyAccessSnapshot(userId: string, companyId: string): Promise<CompanyAccessSnapshot> {
    const adminSupabase: any = createAdminClient()

    const isSuperadmin = await this.isSuperadmin(userId)
    if (isSuperadmin) {
      return {
        hasAccess: true,
        accessType: 'superadmin',
        trialDaysRemaining: null,
        isOwner: false,
        subscriptionInfo: null,
        ownerSubscriptionExpired: false,
      }
    }

    const [{ data: company }, { data: userRole }] = await Promise.all([
      adminSupabase
        .from('companies')
        .select('user_id')
        .eq('id', companyId)
        .single(),
      adminSupabase
        .from('user_roles')
        .select('id, role')
        .eq('user_id', userId)
        .eq('company_id', companyId)
        .maybeSingle(),
    ])

    const userIsOwner = company?.user_id === userId



    if (userRole && !userIsOwner && company?.user_id) {
      const subscriptionRepo = new SupabaseSubscriptionRepository()
      const companySub = await subscriptionRepo.getCompanySubscriptionState(companyId)

      if (companySub && companySub.hasSubscription) {
        return {
          hasAccess: true,
          accessType: 'invited',
          trialDaysRemaining: null,
          isOwner: false,
          subscriptionInfo: null,
          ownerSubscriptionExpired: false,
        }
      }

      const ownerSub = await subscriptionRepo.getUserSubscriptionState(company.user_id)

      if (ownerSub?.hasSubscription) {
        return {
          hasAccess: true,
          accessType: 'invited',
          trialDaysRemaining: null,
          isOwner: false,
          subscriptionInfo: null,
          ownerSubscriptionExpired: false,
        }
      }

      return {
        hasAccess: false,
        accessType: null,
        trialDaysRemaining: null,
        isOwner: false,
        subscriptionInfo: null,
        ownerSubscriptionExpired: true,
      }
    }

    if (userIsOwner) {
      const subscriptionRepo = new SupabaseSubscriptionRepository()
      const companySub = await subscriptionRepo.getCompanySubscriptionState(companyId)

      if (companySub && companySub.hasSubscription) {
        return {
          hasAccess: true,
          accessType: companySub.isTrial ? 'trial' : 'subscription',
          trialDaysRemaining: companySub.isTrial ? companySub.trialDaysRemaining : null,
          isOwner: true,
          subscriptionInfo: {
            hasSubscription: true,
            tier: companySub.tier,
            isTrial: companySub.isTrial,
            trialDaysRemaining: companySub.trialDaysRemaining,
            companyLimit: companySub.tier === 'professional' ? 20 : 5,
            userLimit: companySub.tier === 'professional' ? 10 : 3,
          },
          ownerSubscriptionExpired: false,
        }
      }

      const userSub = await subscriptionRepo.getUserSubscriptionState(userId)

      if (userSub?.hasSubscription) {
        return {
          hasAccess: true,
          accessType: userSub.isTrial ? 'trial' : 'subscription',
          trialDaysRemaining: userSub.isTrial ? userSub.trialDaysRemaining : null,
          isOwner: true,
          subscriptionInfo: {
            hasSubscription: true,
            tier: userSub.tier,
            isTrial: userSub.isTrial,
            trialDaysRemaining: userSub.trialDaysRemaining,
            companyLimit: userSub.companyLimit,
            userLimit: userSub.userLimit,
          },
          ownerSubscriptionExpired: false,
        }
      }
    }

    return {
      hasAccess: false,
      accessType: null,
      trialDaysRemaining: null,
      isOwner: userIsOwner,
      subscriptionInfo: null,
      ownerSubscriptionExpired: false,
    }
  }

  async getAccessibleCompanyIds(userId: string): Promise<string[]> {
    const adminSupabase: any = createAdminClient()

    if (await this.isSuperadmin(userId)) {
      const { data: allCompanies } = await adminSupabase.from('companies').select('id')
      return (allCompanies ?? []).map((company: { id: string }) => company.id)
    }

    const accessibleIds: string[] = []

    const { data: invitedRoles } = await adminSupabase
      .from('user_roles')
      .select('company_id')
      .eq('user_id', userId)
      .not('company_id', 'is', null)

    const invitedCompanyIds = (invitedRoles ?? [])
      .map((role: { company_id: string | null }) => role.company_id)
      .filter((companyId: string | null): companyId is string => Boolean(companyId))

    if (invitedCompanyIds.length > 0) {
      const { data: invitedCompanies } = await adminSupabase
        .from('companies')
        .select('id, user_id')
        .in('id', invitedCompanyIds)

      ;(invitedCompanies ?? []).forEach((company: { id: string; user_id: string | null }) => {
        if (company.user_id !== userId && !accessibleIds.includes(company.id)) {
          accessibleIds.push(company.id)
        }
      })
    }

    const { data: ownedCompanies } = await adminSupabase
      .from('companies')
      .select('id')
      .eq('user_id', userId)

    const subscriptionRepo = new SupabaseSubscriptionRepository()
    const userSub = await subscriptionRepo.getUserSubscriptionState(userId)

    if (userSub?.hasSubscription) {
      ;(ownedCompanies ?? []).forEach((company: { id: string }) => {
        if (!accessibleIds.includes(company.id)) {
          accessibleIds.push(company.id)
        }
      })

      return accessibleIds
    }

    const ownedCompanySubscriptionResults = await subscriptionRepo.getCompanySubscriptionStates(
      (ownedCompanies ?? []).map((c: { id: string }) => c.id)
    )

    ;(ownedCompanies ?? []).forEach((company: { id: string }) => {
      if (ownedCompanySubscriptionResults.get(company.id)?.hasSubscription && !accessibleIds.includes(company.id)) {
        accessibleIds.push(company.id)
      }
    })

    return accessibleIds
  }
}
