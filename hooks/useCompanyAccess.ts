'use client'

import { useState, useEffect, useMemo } from 'react'
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
  ownerSubscriptionExpired: boolean // For invited users when owner's subscription expires
}

/**
 * Hook to check if the current user has access to a specific company
 * 
 * Hybrid subscription model:
 * - Starter/Professional: Company-first (each company needs its own subscription)
 * - Enterprise: User-first (one subscription covers all companies)
 * - Invited members: Get free access in both models
 * 
 * Access is granted if:
 * 1. User is superadmin
 * 2. User is invited member (has role in user_roles for this company, not owner)
 * 3. User is owner AND has active subscription/trial:
 *    - For Starter/Professional: Company has active subscription
 *    - For Enterprise: User has active subscription
 */
export function useCompanyAccess(companyId: string | null): CompanyAccessResult {
  const { user, loading: authLoading } = useAuth()
  // Memoize supabase client to prevent infinite re-renders
  const supabase = useMemo(() => createClient(), [])
  
  const [hasAccess, setHasAccess] = useState(false)
  const [accessType, setAccessType] = useState<CompanyAccessType>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null)
  const [ownerSubscriptionExpired, setOwnerSubscriptionExpired] = useState(false)

  useEffect(() => {
    // Reset state when companyId changes - this prevents stale state from causing incorrect redirects
    if (companyId) {
      setIsLoading(true)
      setHasAccess(false) // Reset until we verify
    }
    
    async function checkAccess() {
      if (authLoading) return
      
      if (!user) {
        setHasAccess(false)
        setAccessType(null)
        setIsLoading(false)
        return
      }

      if (!companyId) {
        // No company selected - keep loading true to prevent premature redirect
        // The data-room checks for currentCompany before checking access
        setIsLoading(true)
        return
      }

      // setIsLoading(true) - already set above synchronously
      setError(null)

      try {
        // 1. Check if user is superadmin (platform-level, company_id IS NULL)
        // Try RPC function first (most reliable)
        let isSuperadmin = false
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('is_superadmin', {
            p_user_id: user.id
          })
          if (!rpcError && rpcData !== null) {
            isSuperadmin = !!rpcData
          }
        } catch (rpcErr) {
          // RPC failed, fallback to direct query
          console.log('[useCompanyAccess] RPC failed, falling back to direct query')
        }

        // Fallback: Query all superadmin roles and check if any have company_id = null
        if (!isSuperadmin) {
          const { data: superadminRoles, error: rolesError } = await supabase
            .from('user_roles')
            .select('role, company_id')
            .eq('user_id', user.id)
            .eq('role', 'superadmin')

          if (!rolesError && superadminRoles) {
            isSuperadmin = superadminRoles.some(role => role.company_id === null)
          }
        }

        if (isSuperadmin) {
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

        // 3. Use unified access check RPC (handles both company-first and user-first)
        try {
          const { data: accessData, error: accessError } = await supabase
            .rpc('check_company_access', {
              p_user_id: user.id,
              p_company_id: companyId
            })
            .single()

          if (!accessError && accessData) {
            const access = accessData as {
              has_access: boolean
              access_type: string
              tier: string
              is_trial: boolean
              trial_days_remaining: number
            }

            console.log('[useCompanyAccess] Access check result:', access)

            if (access.has_access) {
              setHasAccess(true)
              setAccessType(access.access_type as CompanyAccessType)
              
              if (access.is_trial) {
                setTrialDaysRemaining(access.trial_days_remaining)
              }

              // Set subscription info for owners
              if (userIsOwner && (access.access_type === 'subscription' || access.access_type === 'trial')) {
                setSubscriptionInfo({
                  hasSubscription: true,
                  tier: access.tier,
                  isTrial: access.is_trial,
                  trialDaysRemaining: access.trial_days_remaining,
                  companyLimit: access.tier === 'enterprise' ? 100 : access.tier === 'professional' ? 20 : 5,
                  userLimit: access.tier === 'enterprise' ? 999999 : access.tier === 'professional' ? 10 : 3,
                })
              }

              // Handle invited member case
              if (!userIsOwner && userRole) {
                if (access.has_access) {
                  setOwnerSubscriptionExpired(false)
                } else {
                  setOwnerSubscriptionExpired(true)
                }
              }

              setIsLoading(false)
              return
            } else {
              // No access
              if (!userIsOwner && userRole) {
                setOwnerSubscriptionExpired(true)
              }
              setHasAccess(false)
              setAccessType(null)
              setIsLoading(false)
              return
            }
          }
        } catch (rpcErr) {
          console.log('[useCompanyAccess] Unified RPC failed, falling back to manual checks:', rpcErr)
        }

        // Fallback: Manual access check if RPC is not available
        // If user is invited member (has role but NOT owner), check if owner has valid subscription
        if (userRole && !userIsOwner) {
          console.log('[useCompanyAccess] User is invited member, checking owner subscription (fallback)')
          
          const ownerId = company?.user_id
          
          if (ownerId) {
            // Check owner's subscription (try both company-first and user-first)
            try {
              // First check company subscription (Starter/Professional)
              const { data: companySubData } = await supabase
                .rpc('check_company_subscription', { p_company_id: companyId })
                .single()
              
              if (companySubData && (companySubData as any).has_subscription) {
                console.log('[useCompanyAccess] Owner has company subscription, granting access')
                setHasAccess(true)
                setAccessType('invited')
                setOwnerSubscriptionExpired(false)
                setIsLoading(false)
                return
              }

              // Then check user subscription (Enterprise)
              const { data: ownerSubData } = await supabase
                .rpc('check_user_subscription', { target_user_id: ownerId })
                .single()
              
              const ownerSub = ownerSubData as SubscriptionRPCResponse | null
              
              if (ownerSub?.has_subscription) {
                console.log('[useCompanyAccess] Owner has user subscription, granting access')
                setHasAccess(true)
                setAccessType('invited')
                setOwnerSubscriptionExpired(false)
                setIsLoading(false)
                return
              }

              console.log('[useCompanyAccess] Owner has no valid subscription')
              setHasAccess(false)
              setOwnerSubscriptionExpired(true)
              setIsLoading(false)
              return
            } catch (err) {
              console.error('[useCompanyAccess] Error checking owner subscription:', err)
              setHasAccess(false)
              setOwnerSubscriptionExpired(true)
              setIsLoading(false)
              return
            }
          }
        }

        // 4. If user is owner, check subscription (company-first or user-first)
        if (userIsOwner) {
          console.log('[useCompanyAccess] User is owner, checking subscription (fallback)')
          
          // First check if company has subscription (Starter/Professional - company-first)
          try {
            const { data: companySubData } = await supabase
              .rpc('check_company_subscription', { p_company_id: companyId })
              .single()
            
            if (companySubData && (companySubData as any).has_subscription) {
              const companySub = companySubData as {
                has_subscription: boolean
                tier: string
                is_trial: boolean
                trial_days_remaining: number
              }
              
              console.log('[useCompanyAccess] Company has subscription:', companySub.tier)
              setHasAccess(true)
              setAccessType(companySub.is_trial ? 'trial' : 'subscription')
              setTrialDaysRemaining(companySub.is_trial ? companySub.trial_days_remaining : null)
              setSubscriptionInfo({
                hasSubscription: true,
                tier: companySub.tier,
                isTrial: companySub.is_trial,
                trialDaysRemaining: companySub.trial_days_remaining,
                companyLimit: companySub.tier === 'professional' ? 20 : 5,
                userLimit: companySub.tier === 'professional' ? 10 : 3,
              })
              setIsLoading(false)
              return
            }
          } catch (err) {
            console.log('[useCompanyAccess] Company subscription check failed:', err)
          }

          // Then check if user has Enterprise subscription (user-first)
          try {
            const { data, error: rpcError } = await supabase
              .rpc('check_user_subscription', { target_user_id: user.id })
              .single()

            const subInfo = data as SubscriptionRPCResponse | null

            if (!rpcError && subInfo && subInfo.has_subscription) {
              console.log('[useCompanyAccess] User has Enterprise subscription:', subInfo.tier)
              
              setSubscriptionInfo({
                hasSubscription: true,
                tier: subInfo.tier,
                isTrial: subInfo.is_trial,
                trialDaysRemaining: subInfo.trial_days_remaining,
                companyLimit: subInfo.company_limit,
                userLimit: subInfo.user_limit,
              })

              setHasAccess(true)
              setAccessType(subInfo.is_trial ? 'trial' : 'subscription')
              setTrialDaysRemaining(subInfo.is_trial ? subInfo.trial_days_remaining : null)
              setIsLoading(false)
              return
            }
          } catch (rpcErr) {
            console.log('[useCompanyAccess] User subscription check failed:', rpcErr)
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
    ownerSubscriptionExpired,
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
  // Memoize supabase client to prevent infinite re-renders
  const supabase = useMemo(() => createClient(), [])
  
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
          // hasSubscription should be true if user has active subscription OR active trial
          setHasSubscription(subInfo.has_subscription || (subInfo.is_trial && subInfo.trial_days_remaining > 0))
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
  // Memoize supabase client to prevent infinite re-renders
  const supabase = useMemo(() => createClient(), [])
  
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
        // Try RPC function first (most reliable)
        let isSuperadmin = false
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('is_superadmin', {
            p_user_id: user.id
          })
          if (!rpcError && rpcData !== null) {
            isSuperadmin = !!rpcData
          }
        } catch (rpcErr) {
          // RPC failed, fallback to direct query
          console.log('[useAnyCompanyAccess] RPC failed, falling back to direct query')
        }

        // Fallback: Query all superadmin roles and check if any have company_id = null
        if (!isSuperadmin) {
          const { data: superadminRoles, error: rolesError } = await supabase
            .from('user_roles')
            .select('role, company_id')
            .eq('user_id', user.id)
            .eq('role', 'superadmin')

          if (!rolesError && superadminRoles) {
            isSuperadmin = superadminRoles.some(role => role.company_id === null)
          }
        }

        if (isSuperadmin) {
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

        // Check if user has Enterprise subscription (user-level)
        const { data: subData } = await supabase
          .rpc('check_user_subscription', { target_user_id: user.id })
          .single()

        const subInfo = subData as SubscriptionRPCResponse | null

        if (subInfo?.has_subscription) {
          // User has Enterprise subscription, all their owned companies are accessible
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
        } else {
          // Check for company-level subscriptions (Starter/Professional)
          const { data: ownedCompanies } = await supabase
            .from('companies')
            .select('id')
            .eq('user_id', user.id)

          if (ownedCompanies) {
            for (const company of ownedCompanies) {
              // Check if this specific company has a subscription
              const { data: companySubData } = await supabase
                .rpc('check_company_subscription', { p_company_id: company.id })
                .single()
              
              if (companySubData && (companySubData as any).has_subscription) {
                if (!accessibleIds.includes(company.id)) {
                  accessibleIds.push(company.id)
                }
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
