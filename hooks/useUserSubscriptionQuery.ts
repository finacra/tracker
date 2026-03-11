'use client'

import { useQuery } from '@tanstack/react-query'
import { getUserSubscriptionSummary } from '@/app/data-room/actions'
import { queryKeys } from '@/lib/react-query/query-keys'

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
  return useQuery({
    queryKey: queryKeys.userSubscription(),
    queryFn: async () => {
      const result = await getUserSubscriptionSummary()
      if (!result.success || !result.summary) {
        throw new Error(result.error || 'Failed to fetch subscription')
      }
      return result.summary
    },
    enabled,
    initialData,
    staleTime: 2 * 60 * 1000, // 2 minutes - subscription can change
    gcTime: 5 * 60 * 1000,
  })
}
