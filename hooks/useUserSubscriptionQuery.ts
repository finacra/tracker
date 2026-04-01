'use client'

import { useQuery } from '@tanstack/react-query'
import { getUserSubscriptionSummary } from '@/app/data-room/actions'
import { queryKeys } from '@/lib/react-query/query-keys'
import { useAuth } from '@/hooks/useAuth'

interface UserSubscriptionSummary {
  hasSubscription: boolean
  tier: string
  isTrial: boolean
  trialDaysRemaining: number
  companyLimit: number
  currentCompanyCount: number
  canCreateCompany: boolean
}

interface UseUserSubscriptionOptions {
  enabled?: boolean
  initialData?: UserSubscriptionSummary
}

export function useUserSubscriptionQuery({
  enabled = true,
  initialData,
}: UseUserSubscriptionOptions = {}) {
  const { user, loading: authLoading } = useAuth()

  // Don't fire the query until auth is resolved — prevents
  // server action from running without a session cookie,
  // which returns hasSubscription: false prematurely.
  const isAuthReady = !authLoading && !!user

  return useQuery({
    queryKey: queryKeys.userSubscription(),
    queryFn: async () => {
      const result = await getUserSubscriptionSummary()
      if (!result.success || !result.summary) {
        throw new Error(result.error || 'Failed to fetch subscription')
      }
      return result.summary
    },
    enabled: enabled && isAuthReady,
    initialData,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
  })
}
