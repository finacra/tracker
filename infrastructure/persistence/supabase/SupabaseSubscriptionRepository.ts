import type {
  CompanySubscriptionState,
  SubscriptionRecord,
  SubscriptionRepository,
  UserSubscriptionState,
} from '@/application/interfaces/SubscriptionRepository'
import { createAdminClient } from '@/utils/supabase/admin'

type SubscriptionRow = {
  id: string
  user_id: string
  company_id: string | null
  subscription_type: string | null
  status: string
  tier: string
  billing_cycle: string | null
  amount: number | null
  currency: string | null
  start_date: string
  end_date: string
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean | null
  cancelled_at: string | null
  is_trial: boolean | null
  trial_started_at: string | null
  trial_ends_at: string | null
  created_at: string
  updated_at: string
}

export class SupabaseSubscriptionRepository implements SubscriptionRepository {
  private mapRow(row: SubscriptionRow): SubscriptionRecord {
    return {
      id: row.id,
      userId: row.user_id,
      companyId: row.company_id,
      subscriptionType: row.subscription_type,
      status: row.status,
      tier: row.tier,
      billingCycle: row.billing_cycle ?? 'monthly',
      amount: Number(row.amount ?? 0),
      currency: row.currency ?? 'INR',
      startDate: row.start_date,
      endDate: row.end_date,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      cancelledAt: row.cancelled_at,
      isTrial: Boolean(row.is_trial),
      trialStartedAt: row.trial_started_at,
      trialEndsAt: row.trial_ends_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  async hasUsedEnterpriseUserTrial(userId: string): Promise<boolean> {
    const adminSupabase: any = createAdminClient()
    const { count, error } = await adminSupabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('subscription_type', 'user')
      .eq('tier', 'enterprise')
      .eq('is_trial', true)

    if (error) throw new Error(error.message)
    return (count ?? 0) > 0
  }

  async hasUsedCompanyTrial(companyId: string): Promise<boolean> {
    const adminSupabase: any = createAdminClient()
    const { count, error } = await adminSupabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('subscription_type', 'company')
      .eq('is_trial', true)

    if (error) throw new Error(error.message)
    return (count ?? 0) > 0
  }

  async createUserTrial(userId: string, appUserId?: string | null): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase.rpc('create_user_trial', {
      target_user_id: userId,
      p_app_user_id: appUserId || null
    })
    if (error) throw new Error(error.message)
  }

  async createCompanyTrial(userId: string, companyId: string, appUserId?: string | null): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase.rpc('create_company_trial', {
      p_user_id: userId,
      p_company_id: companyId,
      p_app_user_id: appUserId || null
    })
    if (error) throw new Error(error.message)
  }

  async getUserSubscriptionState(userId: string): Promise<UserSubscriptionState | null> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('subscriptions')
      .select('status, tier, is_trial, trial_ends_at, end_date')
      .eq('user_id', userId)
      .eq('subscription_type', 'user')
      .or('status.eq.active,is_trial.eq.true')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) {
      return {
        hasSubscription: false,
        tier: '',
        isTrial: false,
        trialDaysRemaining: 0,
        companyLimit: 0,
        userLimit: 0,
      }
    }

    const now = new Date()
    const endDate = data.is_trial ? new Date(data.trial_ends_at || data.end_date) : new Date(data.end_date)
    const isExpired = endDate < now || data.status === 'expired'
    const trialDaysRemaining = data.is_trial && !isExpired
      ? Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0

    return {
      hasSubscription: !isExpired,
      tier: String(data.tier ?? ''),
      isTrial: Boolean(data.is_trial),
      trialDaysRemaining,
      companyLimit: data.tier === 'enterprise' ? 100 : data.tier === 'professional' ? 20 : 5,
      userLimit: data.tier === 'enterprise' ? 999999 : data.tier === 'professional' ? 10 : 3,
    }
  }

  async getCompanySubscriptionState(companyId: string): Promise<CompanySubscriptionState | null> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('subscriptions')
      .select('status, tier, is_trial, trial_ends_at, end_date')
      .eq('company_id', companyId)
      .eq('subscription_type', 'company')
      .or('status.eq.active,is_trial.eq.true')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) {
      return {
        hasSubscription: false,
        tier: '',
        isTrial: false,
        trialDaysRemaining: 0,
        userLimit: 0,
      }
    }

    const now = new Date()
    const endDate = data.is_trial ? new Date(data.trial_ends_at || data.end_date) : new Date(data.end_date)
    const isExpired = endDate < now || data.status === 'expired'
    const trialDaysRemaining = data.is_trial && !isExpired
      ? Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0

    return {
      hasSubscription: !isExpired,
      tier: String(data.tier ?? ''),
      isTrial: Boolean(data.is_trial),
      trialDaysRemaining,
      userLimit: data.tier === 'enterprise' ? 999999 : data.tier === 'professional' ? 10 : 3,
    }
  }

  async getCompanySubscriptionStates(companyIds: string[]): Promise<Map<string, CompanySubscriptionState>> {
    if (companyIds.length === 0) return new Map()
    
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('subscriptions')
      .select('company_id, status, tier, is_trial, trial_ends_at, end_date')
      .in('company_id', companyIds)
      .eq('subscription_type', 'company')
      .or('status.eq.active,is_trial.eq.true')
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)
    
    const results = new Map<string, CompanySubscriptionState>()
    const now = new Date()
    
    ;(data ?? []).forEach((row: any) => {
      // Since we ordered by created_at DESC, we only take the first (latest) per company
      if (results.has(row.company_id)) return

      const endDate = row.is_trial ? new Date(row.trial_ends_at || row.end_date) : new Date(row.end_date)
      const isExpired = endDate < now || row.status === 'expired'
      const trialDaysRemaining = row.is_trial && !isExpired
        ? Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        : 0

      results.set(row.company_id, {
        hasSubscription: !isExpired,
        tier: String(row.tier ?? ''),
        isTrial: Boolean(row.is_trial),
        trialDaysRemaining,
        userLimit: row.tier === 'enterprise' ? 999999 : row.tier === 'professional' ? 10 : 3,
      })
    })
    
    return results
  }

  async getById(id: string): Promise<SubscriptionRecord | null> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('subscriptions')
      .select('id, user_id, company_id, subscription_type, status, tier, billing_cycle, amount, currency, start_date, end_date, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, is_trial, trial_started_at, trial_ends_at, created_at, updated_at')
      .eq('id', id)
      .maybeSingle()

    if (error) throw new Error(error.message)
    return data ? this.mapRow(data as SubscriptionRow) : null
  }

  async listAll(): Promise<SubscriptionRecord[]> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('subscriptions')
      .select('id, user_id, company_id, subscription_type, status, tier, billing_cycle, amount, currency, start_date, end_date, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, is_trial, trial_started_at, trial_ends_at, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)
    return (data ?? []).map((row: SubscriptionRow) => this.mapRow(row))
  }

  async getLatestForCompany(companyId: string): Promise<SubscriptionRecord | null> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('subscriptions')
      .select('id, user_id, company_id, subscription_type, status, tier, billing_cycle, amount, currency, start_date, end_date, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, is_trial, trial_started_at, trial_ends_at, created_at, updated_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .maybeSingle()

    if (error) throw new Error(error.message)
    return data ? this.mapRow(data as SubscriptionRow) : null
  }

  async activatePaidSubscription(input: {
    userId: string
    companyId: string | null
    tier: 'starter' | 'professional' | 'enterprise'
    billingCycle: 'monthly' | 'quarterly' | 'half-yearly' | 'annual'
    amount: number
    currency: string
    startDate: string
    endDate: string
    appUserId?: string | null
  }): Promise<void> {
    const adminSupabase: any = createAdminClient()

    const subscriptionType = input.tier === 'enterprise' ? 'user' : 'company'
    const finalCompanyId = subscriptionType === 'user' ? null : input.companyId

    let existingId: string | null = null

    if (subscriptionType === 'user') {
      const { data, error } = await adminSupabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', input.userId)
        .eq('subscription_type', 'user')
        .eq('status', 'active')
        .maybeSingle()

      if (error) throw new Error(error.message)
      existingId = data?.id ?? null
    } else if (finalCompanyId) {
      const { data, error } = await adminSupabase
        .from('subscriptions')
        .select('id')
        .eq('company_id', finalCompanyId)
        .eq('subscription_type', 'company')
        .eq('status', 'active')
        .maybeSingle()

      if (error) throw new Error(error.message)
      existingId = data?.id ?? null
    }

    const payload = {
      tier: input.tier,
      billing_cycle: input.billingCycle,
      amount: input.amount,
      currency: input.currency,
      status: 'active',
      start_date: input.startDate,
      end_date: input.endDate,
      current_period_start: input.startDate,
      current_period_end: input.endDate,
      updated_at: new Date().toISOString(),
    }

    if (existingId) {
      const { error } = await adminSupabase
        .from('subscriptions')
        .update(payload)
        .eq('id', existingId)

      if (error) throw new Error(error.message)
      return
    }

    const { error } = await adminSupabase
      .from('subscriptions')
      .insert({
        user_id: input.userId,
        app_user_id: input.appUserId || null,
        company_id: finalCompanyId,
        subscription_type: subscriptionType,
        payment_provider: 'razorpay',
        ...payload,
      })

    if (error) throw new Error(error.message)
  }

  async extendTrial(subscriptionId: string, baseDate: Date, days: number): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const newEndDate = new Date(baseDate)
    newEndDate.setDate(newEndDate.getDate() + days)

    const { error } = await adminSupabase
      .from('subscriptions')
      .update({
        status: 'trial',
        is_trial: true,
        trial_ends_at: newEndDate.toISOString(),
        end_date: newEndDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscriptionId)

    if (error) throw new Error(error.message)
  }

  async revokeSubscription(subscriptionId: string): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('subscriptions')
      .update({
        status: 'expired',
        trial_ends_at: new Date().toISOString(),
        end_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscriptionId)

    if (error) throw new Error(error.message)
  }

  async grantEnterpriseTrial(userId: string, days: number, appUserId?: string | null): Promise<void> {
    const adminSupabase: any = createAdminClient()

    const { data: existingSub } = await adminSupabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('subscription_type', 'user')
      .or('status.eq.active,is_trial.eq.true')
      .gt('end_date', new Date().toISOString())
      .maybeSingle()

    if (existingSub) {
      throw new Error('User already has an active Enterprise subscription or trial')
    }

    const trialEndDate = new Date()
    trialEndDate.setDate(trialEndDate.getDate() + days)

    const { error } = await adminSupabase.from('subscriptions').insert({
      user_id: userId,
      app_user_id: appUserId || null,
      company_id: null,
      subscription_type: 'user',
      status: 'trial',
      tier: 'enterprise',
      billing_cycle: 'monthly',
      amount: 0,
      currency: 'INR',
      is_trial: true,
      trial_started_at: new Date().toISOString(),
      trial_ends_at: trialEndDate.toISOString(),
      start_date: new Date().toISOString(),
      end_date: trialEndDate.toISOString(),
    })

    if (error) throw new Error(error.message)
  }

  async grantCompanyTrial(userId: string, companyId: string, tier: string, days: number, appUserId?: string | null): Promise<void> {
    const adminSupabase: any = createAdminClient()

    const { data: existingSub } = await adminSupabase
      .from('subscriptions')
      .select('id')
      .eq('company_id', companyId)
      .eq('subscription_type', 'company')
      .or('status.eq.active,is_trial.eq.true')
      .gt('end_date', new Date().toISOString())
      .maybeSingle()

    if (existingSub) {
      throw new Error('Company already has an active subscription or trial')
    }

    const trialEndDate = new Date()
    trialEndDate.setDate(trialEndDate.getDate() + days)

    const { error } = await adminSupabase.from('subscriptions').insert({
      user_id: userId,
      app_user_id: appUserId || null,
      company_id: companyId,
      subscription_type: 'company',
      status: 'trial',
      tier: tier,
      billing_cycle: 'monthly',
      amount: 0,
      currency: 'INR',
      is_trial: true,
      trial_started_at: new Date().toISOString(),
      trial_ends_at: trialEndDate.toISOString(),
      start_date: new Date().toISOString(),
      end_date: trialEndDate.toISOString(),
    })

    if (error) throw new Error(error.message)
  }

  async changeTier(subscriptionId: string, tier: string): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('subscriptions')
      .update({
        tier: tier,
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscriptionId)

    if (error) throw new Error(error.message)
  }
}

