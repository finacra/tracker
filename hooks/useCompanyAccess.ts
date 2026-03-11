'use client'

import { useMemo } from 'react'
import { useCompanyAccessQuery } from './useCompanyAccessQuery'
import { useAccessibleCompaniesQuery } from './useAccessibleCompaniesQuery'
import { useUserSubscriptionQuery } from './useUserSubscriptionQuery'
import type { CompanyAccessType } from '@/lib/subscriptions/subscription'

interface SubscriptionInfo {
  hasSubscription: boolean
  tier: string
  isTrial: boolean
  trialDaysRemaining: number
  companyLimit: number
  userLimit: number
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
export function useCompanyAccess(companyId: string | null, options: { 
  enabled?: boolean, 
  initialData?: {
    hasAccess: boolean;
    accessType: CompanyAccessType;
    trialDaysRemaining: number | null;
    isOwner: boolean;
    subscriptionInfo?: any;
    ownerSubscriptionExpired?: boolean;
  }
} = {}): CompanyAccessResult {
  const { enabled = true, initialData } = options

  const { data: access, isLoading, error } = useCompanyAccessQuery({
    companyId,
    enabled,
    initialData: initialData
      ? {
          hasAccess: initialData.hasAccess,
          accessType: initialData.accessType,
          trialDaysRemaining: initialData.trialDaysRemaining,
          isOwner: initialData.isOwner,
          subscriptionInfo: initialData.subscriptionInfo,
          ownerSubscriptionExpired: initialData.ownerSubscriptionExpired || false,
        }
      : undefined,
  })

  return useMemo(() => ({
    hasAccess: access?.hasAccess ?? false,
    accessType: (access?.accessType as CompanyAccessType) ?? null,
    isLoading,
    trialDaysRemaining: access?.trialDaysRemaining ?? null,
    isOwner: access?.isOwner ?? false,
    error: error ? (error as Error).message : null,
    subscriptionInfo: access?.subscriptionInfo ?? null,
    ownerSubscriptionExpired: access?.ownerSubscriptionExpired ?? false,
  }), [access, isLoading, error])
}

/**
 * Hook to check user's subscription status (user-based)
 * Returns subscription info for the current user
 */
export function useUserSubscription(options: { 
  enabled?: boolean,
  initialData?: {
    hasSubscription: boolean;
    tier: string;
    isTrial: boolean;
    trialDaysRemaining: number;
    companyLimit: number;
    currentCompanyCount: number;
    canCreateCompany: boolean;
  }
} = {}): {
  hasSubscription: boolean
  tier: string
  isTrial: boolean
  trialDaysRemaining: number
  companyLimit: number
  currentCompanyCount: number
  canCreateCompany: boolean
  isLoading: boolean
} {
  const { enabled = true, initialData } = options

  const { data, isLoading } = useUserSubscriptionQuery({
    enabled,
    initialData,
  })

  return useMemo(() => ({
    hasSubscription: data?.hasSubscription ?? false,
    tier: data?.tier ?? 'none',
    isTrial: data?.isTrial ?? false,
    trialDaysRemaining: data?.trialDaysRemaining ?? 0,
    companyLimit: data?.companyLimit ?? 0,
    currentCompanyCount: data?.currentCompanyCount ?? 0,
    canCreateCompany: data?.canCreateCompany ?? false,
    isLoading,
  }), [data, isLoading])
}

/**
 * Check if any of the user's companies has valid access
 * Used for initial data-room load before company selection
 */
export function useAnyCompanyAccess(options: { 
  enabled?: boolean,
  initialData?: {
    hasAnyAccess: boolean;
    accessibleCompanyIds: string[];
  }
} = {}): {
  hasAnyAccess: boolean
  accessibleCompanyIds: string[]
  isLoading: boolean
} {
  const { enabled = true, initialData } = options

  const { data: accessibleCompanyIds = [], isLoading } = useAccessibleCompaniesQuery({
    enabled,
    initialData: initialData?.accessibleCompanyIds,
  })

  return useMemo(() => ({
    hasAnyAccess: accessibleCompanyIds.length > 0,
    accessibleCompanyIds,
    isLoading,
  }), [accessibleCompanyIds, isLoading])
}
