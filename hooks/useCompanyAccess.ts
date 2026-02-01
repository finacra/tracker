'use client'

import { useState, useEffect } from 'react'
import { useAuth } from './useAuth'
import { createClient } from '@/utils/supabase/client'
import type { CompanyAccessType } from '@/lib/subscriptions/subscription'

interface SubscriptionInfo {
  hasSubscription: boolean
  tier: string
  isTrial: boolean
  trialDaysRemaining: number
  companyLimit: number
  userLimit: number
}

// RPC response type from check_user_subscription function
interface SubscriptionRPCResponse {
  has_subscription: boolean
  tier: string
  is_trial: boolean
  trial_days_remaining: number
  company_limit: number
  user_limit: number
}

interface CompanyAccessResult {
  hasAccess: boolean
  accessType: CompanyAccessType
  isLoading: boolean
  trialDaysRemaining: number | null
  isOwner: boolean
  error: string | null
  subscriptionInfo: SubscriptionInfo | null
}

/**
 * Hook to check if the current user has access to a specific company
 * 
 * User-based subscription model:
 * 1. User subscribes to a plan (Starter/Professional/Enterprise)
 * 2. Plan determines how many companies they can create
 * 3. Invited team members get access without needing their own subscription
 * 
 * Access is granted if:
 * 1. User is superadmin
 * 2. User is invited member (has role in user_roles for this company, not owner)
 * 3. User is owner AND has active subscription/trial on their account
 */
export function useCompanyAccess(companyId: string | null): CompanyAccessResult {
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  
  const [hasAccess, setHasAccess] = useState(false)
  const [accessType, setAccessType] = useState<CompanyAccessType>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null)

  useEffect(() => {
    async function checkAccess() {
      if (authLoading) return
      
      if (!user) {
        setHasAccess(false)
        setAccessType(null)
        setIsLoading(false)
        return
      }

      if (!companyId) {
        setHasAccess(false)
        setAccessType(null)
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        // 1. Check if user is superadmin
        const { data: superadminRole } = await supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', user.id)
          .eq('role', 'superadmin')
          .is('company_id', null)
          .single()

        if (superadminRole) {
          console.log('[useCompanyAccess] User is superadmin, granting access')
          setHasAccess(true)
          setAccessType('superadmin')
          setIsOwner(false)
          setIsLoading(false)
          return
        }

        // 2. Check if user is company owner
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select('id, user_id')
          .eq('id', companyId)
          .single()

        if (companyError) {
          console.log('[useCompanyAccess] Company query error:', companyError.message)
        }

        const userIsOwner = company?.user_id === user.id
        setIsOwner(userIsOwner)
        console.log('[useCompanyAccess] Company user_id:', company?.user_id, 'Current user:', user.id, 'isOwner:', userIsOwner)

        // 3. Check if user has a role for this company
        const { data: userRole, error: roleError } = await supabase
          .from('user_roles')
          .select('id, role')
          .eq('user_id', user.id)
          .eq('company_id', companyId)
          .single()

        if (roleError && roleError.code !== 'PGRST116') {
          console.log('[useCompanyAccess] Role query error:', roleError.message)
        }
        
        console.log('[useCompanyAccess] User role for this company:', userRole?.role || 'none')

        // If user is invited member (has role but NOT owner), they always have access
        // Invited members bypass subscription requirements
        if (userRole && !userIsOwner) {
          console.log('[useCompanyAccess] User is invited member, granting access (no subscription needed)')
          setHasAccess(true)
          setAccessType('invited')
          setIsLoading(false)
          return
        }

        // 4. If user is owner, check USER's subscription (not company's)
        if (userIsOwner) {
          console.log('[useCompanyAccess] User is owner, checking USER subscription status')
          
          // Try using the RPC function first (more reliable)
          try {
            const { data, error: rpcError } = await supabase
              .rpc('check_user_subscription', { target_user_id: user.id })
              .single()

            const subInfo = data as SubscriptionRPCResponse | null

            if (!rpcError && subInfo) {
              console.log('[useCompanyAccess] Subscription info from RPC:', subInfo)
              
              setSubscriptionInfo({
                hasSubscription: subInfo.has_subscription,
                tier: subInfo.tier,
                isTrial: subInfo.is_trial,
                trialDaysRemaining: subInfo.trial_days_remaining,
                companyLimit: subInfo.company_limit,
                userLimit: subInfo.user_limit,
              })

              if (subInfo.has_subscription) {
                if (subInfo.is_trial) {
                  console.log('[useCompanyAccess] User has active trial, days remaining:', subInfo.trial_days_remaining)
                  setHasAccess(true)
                  setAccessType('trial')
                  setTrialDaysRemaining(subInfo.trial_days_remaining)
                } else {
                  console.log('[useCompanyAccess] User has active subscription:', subInfo.tier)
                  setHasAccess(true)
                  setAccessType('subscription')
                }
                setIsLoading(false)
                return
              }
            }
          } catch (rpcErr) {
            console.log('[useCompanyAccess] RPC not available, falling back to direct query')
          }

          // Fallback: Direct query for user's subscription
          try {
            // Check for active paid subscription (user-based)
            const { data: activeSubscription } = await supabase
              .from('subscriptions')
              .select('id, status, tier, is_trial, trial_ends_at, end_date')
              .eq('user_id', user.id)
              .eq('status', 'active')
              .gt('end_date', new Date().toISOString())
              .order('end_date', { ascending: false })
              .limit(1)
              .single()

            if (activeSubscription && !activeSubscription.is_trial) {
              console.log('[useCompanyAccess] Found active user subscription:', activeSubscription.tier)
              setHasAccess(true)
              setAccessType('subscription')
              setSubscriptionInfo({
                hasSubscription: true,
                tier: activeSubscription.tier || 'starter',
                isTrial: false,
                trialDaysRemaining: 0,
                companyLimit: activeSubscription.tier === 'enterprise' ? 999999 : activeSubscription.tier === 'professional' ? 20 : 5,
                userLimit: activeSubscription.tier === 'enterprise' ? 999999 : activeSubscription.tier === 'professional' ? 10 : 3,
              })
              setIsLoading(false)
              return
            }

            // Check for active trial
            const { data: trialSubscription } = await supabase
              .from('subscriptions')
              .select('id, status, tier, is_trial, trial_ends_at')
              .eq('user_id', user.id)
              .eq('is_trial', true)
              .in('status', ['active', 'trial'])
              .order('trial_ends_at', { ascending: false })
              .limit(1)
              .single()

            if (trialSubscription && trialSubscription.trial_ends_at) {
              const trialEnd = new Date(trialSubscription.trial_ends_at)
              const now = new Date()
              
              if (trialEnd > now) {
                const diffTime = trialEnd.getTime() - now.getTime()
                const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                
                console.log('[useCompanyAccess] Active trial, days remaining:', daysRemaining)
                setHasAccess(true)
                setAccessType('trial')
                setTrialDaysRemaining(daysRemaining)
                setSubscriptionInfo({
                  hasSubscription: true,
                  tier: 'starter',
                  isTrial: true,
                  trialDaysRemaining: daysRemaining,
                  companyLimit: 5,
                  userLimit: 3,
                })
                setIsLoading(false)
                return
              }
            }
          } catch (err) {
            console.error('[useCompanyAccess] Error checking user subscriptions:', err)
          }

          // Owner but no subscription or trial
          console.log('[useCompanyAccess] Owner without active subscription/trial')
          setHasAccess(false)
          setAccessType(null)
          setIsLoading(false)
          return
        }

        // 5. User has no role and is not owner - no access
        console.log('[useCompanyAccess] User has no access to this company')
        setHasAccess(false)
        setAccessType(null)
        setIsLoading(false)

      } catch (err: any) {
        console.error('Error checking company access:', err)
        setError(err.message || 'Failed to check access')
        setHasAccess(false)
        setAccessType(null)
        setIsLoading(false)
      }
    }

    checkAccess()
  }, [user, authLoading, companyId, supabase])

  return {
    hasAccess,
    accessType,
    isLoading,
    trialDaysRemaining,
    isOwner,
    error,
    subscriptionInfo,
  }
}

/**
 * Hook to check user's subscription status (user-based)
 * Returns subscription info for the current user
 */
export function useUserSubscription(): {
  hasSubscription: boolean
  tier: string
  isTrial: boolean
  trialDaysRemaining: number
  companyLimit: number
  currentCompanyCount: number
  canCreateCompany: boolean
  isLoading: boolean
} {
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  
  const [hasSubscription, setHasSubscription] = useState(false)
  const [tier, setTier] = useState('none')
  const [isTrial, setIsTrial] = useState(false)
  const [trialDaysRemaining, setTrialDaysRemaining] = useState(0)
  const [companyLimit, setCompanyLimit] = useState(0)
  const [currentCompanyCount, setCurrentCompanyCount] = useState(0)
  const [canCreateCompany, setCanCreateCompany] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function checkSubscription() {
      if (authLoading) return
      
      if (!user) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)

      try {
        // Try RPC first
        const { data, error: rpcError } = await supabase
          .rpc('check_user_subscription', { target_user_id: user.id })
          .single()

        const subInfo = data as SubscriptionRPCResponse | null

        if (!rpcError && subInfo) {
          setHasSubscription(subInfo.has_subscription)
          setTier(subInfo.tier)
          setIsTrial(subInfo.is_trial)
          setTrialDaysRemaining(subInfo.trial_days_remaining)
          setCompanyLimit(subInfo.company_limit)
        }

        // Get company count
        const { data: limitsData, error: limitsError } = await supabase
          .rpc('get_user_company_limits', { target_user_id: user.id })
          .single()

        const limits = limitsData as { current_count: number; max_allowed: number; can_create_more: boolean } | null

        if (!limitsError && limits) {
          setCurrentCompanyCount(limits.current_count)
          setCanCreateCompany(limits.can_create_more)
        } else {
          // Fallback: count companies manually
          const { count } = await supabase
            .from('companies')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
          
          setCurrentCompanyCount(count || 0)
          setCanCreateCompany(Boolean(subInfo?.has_subscription && (count || 0) < (subInfo?.company_limit || 0)))
        }

        setIsLoading(false)
      } catch (err) {
        console.error('Error checking user subscription:', err)
        setIsLoading(false)
      }
    }

    checkSubscription()
  }, [user, authLoading, supabase])

  return {
    hasSubscription,
    tier,
    isTrial,
    trialDaysRemaining,
    companyLimit,
    currentCompanyCount,
    canCreateCompany,
    isLoading,
  }
}

/**
 * Check if any of the user's companies has valid access
 * Used for initial data-room load before company selection
 */
export function useAnyCompanyAccess(): {
  hasAnyAccess: boolean
  accessibleCompanyIds: string[]
  isLoading: boolean
} {
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  
  const [hasAnyAccess, setHasAnyAccess] = useState(false)
  const [accessibleCompanyIds, setAccessibleCompanyIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function checkAnyAccess() {
      if (authLoading) return
      
      if (!user) {
        setHasAnyAccess(false)
        setAccessibleCompanyIds([])
        setIsLoading(false)
        return
      }

      setIsLoading(true)

      try {
        // Check if user is superadmin (has access to all)
        const { data: superadminRole } = await supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', user.id)
          .eq('role', 'superadmin')
          .is('company_id', null)
          .single()

        if (superadminRole) {
          // Superadmin has access to all companies
          const { data: allCompanies } = await supabase
            .from('companies')
            .select('id')
          
          setHasAnyAccess(true)
          setAccessibleCompanyIds(allCompanies?.map(c => c.id) || [])
          setIsLoading(false)
          return
        }

        const accessibleIds: string[] = []

        // Get companies user is invited to (invited members always have access)
        const { data: invitedRoles } = await supabase
          .from('user_roles')
          .select('company_id')
          .eq('user_id', user.id)
          .not('company_id', 'is', null)

        if (invitedRoles) {
          for (const role of invitedRoles) {
            if (role.company_id) {
              const { data: company } = await supabase
                .from('companies')
                .select('user_id')
                .eq('id', role.company_id)
                .single()
              
              // If not owner, they're invited and have access
              if (company && company.user_id !== user.id) {
                accessibleIds.push(role.company_id)
              }
            }
          }
        }

        // Check if user has subscription for their owned companies
        const { data: subData } = await supabase
          .rpc('check_user_subscription', { target_user_id: user.id })
          .single()

        const subInfo = subData as SubscriptionRPCResponse | null

        if (subInfo?.has_subscription) {
          // User has subscription, all their owned companies are accessible
          const { data: ownedCompanies } = await supabase
            .from('companies')
            .select('id')
            .eq('user_id', user.id)

          if (ownedCompanies) {
            for (const company of ownedCompanies) {
              if (!accessibleIds.includes(company.id)) {
                accessibleIds.push(company.id)
              }
            }
          }
        }

        setHasAnyAccess(accessibleIds.length > 0)
        setAccessibleCompanyIds(accessibleIds)
        setIsLoading(false)

      } catch (err) {
        console.error('Error checking any company access:', err)
        setHasAnyAccess(false)
        setAccessibleCompanyIds([])
        setIsLoading(false)
      }
    }

    checkAnyAccess()
  }, [user, authLoading, supabase])

  return {
    hasAnyAccess,
    accessibleCompanyIds,
    isLoading,
  }
}
