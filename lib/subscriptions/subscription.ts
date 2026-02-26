/**
 * Subscription Management Utilities
 */

import { createClient } from '@/utils/supabase/client'

export interface Subscription {
  id: string
  user_id: string
  company_id: string | null
  tier: 'starter' | 'professional' | 'enterprise'
  billing_cycle: 'monthly' | 'quarterly' | 'half-yearly' | 'annual'
  amount: number
  currency: string
  status: 'active' | 'cancelled' | 'expired' | 'pending' | 'trial'
  start_date: string
  end_date: string
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  cancelled_at: string | null
  is_trial: boolean
  trial_started_at: string | null
  trial_ends_at: string | null
  created_at: string
  updated_at: string
}

export type CompanyAccessType = 'subscription' | 'trial' | 'invited' | 'superadmin' | null

export async function getActiveSubscription(userId?: string): Promise<Subscription | null> {
  const supabase = createClient()

  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    userId = user.id
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('end_date', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    return null
  }

  return data as Subscription
}

export async function hasActiveSubscription(userId?: string): Promise<boolean> {
  const subscription = await getActiveSubscription(userId)
  return subscription !== null
}

export async function getSubscriptionTier(userId?: string): Promise<'starter' | 'professional' | 'enterprise' | null> {
  const subscription = await getActiveSubscription(userId)
  return subscription?.tier || null
}

export async function cancelSubscription(subscriptionId: string, cancelAtPeriodEnd: boolean = true): Promise<boolean> {
  const supabase = createClient()

  const { error } = await supabase
    .from('subscriptions')
    .update({
      cancel_at_period_end: cancelAtPeriodEnd,
      cancelled_at: cancelAtPeriodEnd ? null : new Date().toISOString(),
      status: cancelAtPeriodEnd ? 'active' : 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId)

  return !error
}

export function isSubscriptionExpired(subscription: Subscription): boolean {
  return new Date(subscription.end_date) < new Date()
}

export function getDaysUntilExpiry(subscription: Subscription): number {
  const endDate = new Date(subscription.end_date)
  const now = new Date()
  const diffTime = endDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

/**
 * Get subscription for a specific company
 */
export async function getCompanySubscription(companyId: string): Promise<Subscription | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('company_id', companyId)
    .in('status', ['active', 'trial'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    return null
  }

  return data as Subscription
}

/**
 * Check if a company has an active trial
 */
export async function hasActiveTrial(companyId: string): Promise<boolean> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, trial_ends_at')
    .eq('company_id', companyId)
    .eq('is_trial', true)
    .in('status', ['active', 'trial'])
    .single()

  if (error || !data) {
    return false
  }

  if (!data.trial_ends_at) {
    return false
  }

  return new Date(data.trial_ends_at) > new Date()
}

/**
 * Get trial days remaining for a company
 */
export async function getTrialDaysRemaining(companyId: string): Promise<number | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('subscriptions')
    .select('trial_ends_at')
    .eq('company_id', companyId)
    .eq('is_trial', true)
    .single()

  if (error || !data || !data.trial_ends_at) {
    return null
  }

  const trialEnd = new Date(data.trial_ends_at)
  const now = new Date()
  const diffTime = trialEnd.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

/**
 * Create a trial subscription for a company
 */
export async function createTrialSubscription(
  userId: string,
  companyId: string,
  trialDays: number = 15
): Promise<{ success: boolean; subscriptionId?: string; error?: string }> {
  const supabase = createClient()

  const now = new Date()
  const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)

  // Check if trial already exists
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_trial', true)
    .single()

  if (existing) {
    return { success: true, subscriptionId: existing.id }
  }

  // Get company country_code for currency
  const { data: company } = await supabase
    .from('companies')
    .select('country_code')
    .eq('id', companyId)
    .single()

  let currency = 'INR'
  if (company?.country_code) {
    try {
      const { CountryRegistry } = require('../countries')
      const country = CountryRegistry.get(company.country_code)
      if (country) {
        currency = country.currency.code
      }
    } catch {
      // Fallback to INR
    }
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      company_id: companyId,
      tier: 'starter',
      billing_cycle: 'monthly',
      amount: 0,
      currency: currency,
      status: 'trial',
      is_trial: true,
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEnd.toISOString(),
      start_date: now.toISOString(),
      end_date: trialEnd.toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, subscriptionId: data.id }
}
