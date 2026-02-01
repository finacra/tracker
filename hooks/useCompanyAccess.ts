'use client'

import { useState, useEffect } from 'react'
import { useAuth } from './useAuth'
import { createClient } from '@/utils/supabase/client'
import type { CompanyAccessType } from '@/lib/subscriptions/subscription'

interface CompanyAccessResult {
  hasAccess: boolean
  accessType: CompanyAccessType
  isLoading: boolean
  trialDaysRemaining: number | null
  isOwner: boolean
  error: string | null
}

/**
 * Hook to check if the current user has access to a specific company
 * 
 * Access is granted if:
 * 1. User is superadmin
 * 2. User is owner with active subscription
 * 3. User is owner with active trial (< 15 days)
 * 4. User is invited member (has role via user_roles)
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

        // 3. Check if user has a role for this company (invited member)
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

        // If user is invited (has role but not owner), they always have access
        // This check happens BEFORE subscription checks, so invited users bypass subscription requirements
        if (userRole && !userIsOwner) {
          console.log('[useCompanyAccess] User is invited member, granting access')
          setHasAccess(true)
          setAccessType('invited')
          setIsLoading(false)
          return
        }

        // If user has a role (including owner with admin role), and NOT owner, treat as invited
        if (userRole) {
          console.log('[useCompanyAccess] User has role, treating as invited')
          setHasAccess(true)
          setAccessType('invited')
          setIsLoading(false)
          return
        }

        // 4. If user is owner, check subscription/trial status
        if (userIsOwner) {
          console.log('[useCompanyAccess] User is owner, checking subscription status')
          
          try {
            // Check for active subscription (non-trial)
            const { data: activeSubscription, error: subError } = await supabase
              .from('subscriptions')
              .select('id, status, is_trial, trial_ends_at, end_date')
              .eq('company_id', companyId)
              .eq('is_trial', false)
              .eq('status', 'active')
              .gt('end_date', new Date().toISOString())
              .single()

            if (subError && subError.code !== 'PGRST116') {
              // If error is not "no rows", check if it's a schema issue (406)
              // In that case, try a simpler query without is_trial
              console.log('[useCompanyAccess] Subscription query error:', subError.message)
              
              // Fallback: check any active subscription without is_trial filter
              const { data: fallbackSub } = await supabase
                .from('subscriptions')
                .select('id, status, end_date')
                .eq('company_id', companyId)
                .eq('status', 'active')
                .gt('end_date', new Date().toISOString())
                .single()
              
              if (fallbackSub) {
                console.log('[useCompanyAccess] Found active subscription (fallback)')
                setHasAccess(true)
                setAccessType('subscription')
                setIsLoading(false)
                return
              }
            }

            if (activeSubscription) {
              console.log('[useCompanyAccess] Found active subscription')
              setHasAccess(true)
              setAccessType('subscription')
              setIsLoading(false)
              return
            }

            // Check for active trial
            const { data: trialSubscription, error: trialError } = await supabase
              .from('subscriptions')
              .select('id, status, is_trial, trial_ends_at')
              .eq('company_id', companyId)
              .eq('is_trial', true)
              .in('status', ['active', 'trial'])
              .single()

            if (trialError && trialError.code !== 'PGRST116') {
              console.log('[useCompanyAccess] Trial query error:', trialError.message)
            }

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
                setIsLoading(false)
                return
              }
            }
          } catch (err) {
            console.error('[useCompanyAccess] Error checking subscriptions:', err)
          }

          // Owner but no subscription or trial
          console.log('[useCompanyAccess] Owner without active subscription/trial')
          setHasAccess(false)
          setAccessType(null)
          setIsLoading(false)
          return
        }

        // No access (shouldn't reach here for invited users)
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

        // Get companies user is invited to (always has access)
        const { data: invitedRoles } = await supabase
          .from('user_roles')
          .select('company_id')
          .eq('user_id', user.id)
          .not('company_id', 'is', null)

        if (invitedRoles) {
          // For invited roles, check if user is not the owner (invited members bypass subscription)
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

        // Get companies user owns
        const { data: ownedCompanies } = await supabase
          .from('companies')
          .select('id')
          .eq('user_id', user.id)

        if (ownedCompanies) {
          for (const company of ownedCompanies) {
            // Check if owner has subscription or trial
            const { data: subscription } = await supabase
              .from('subscriptions')
              .select('id, is_trial, trial_ends_at, end_date, status')
              .eq('company_id', company.id)
              .in('status', ['active', 'trial'])
              .single()

            if (subscription) {
              if (!subscription.is_trial && new Date(subscription.end_date) > new Date()) {
                // Active subscription
                accessibleIds.push(company.id)
              } else if (subscription.is_trial && subscription.trial_ends_at && new Date(subscription.trial_ends_at) > new Date()) {
                // Active trial
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
