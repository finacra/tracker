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
  created_at: string
  updated_at: string
}

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
