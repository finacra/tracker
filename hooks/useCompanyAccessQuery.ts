'use client'

import { useQuery } from '@tanstack/react-query'
import { getCompanyAccessState } from '@/app/data-room/actions'
import { queryKeys } from '@/lib/react-query/query-keys'
import { useAuth } from '@/hooks/useAuth'
import type { CompanyAccessSnapshot } from '@/domain/types/CompanyAccess'

interface UseCompanyAccessOptions {
  companyId: string | null
  enabled?: boolean
  initialData?: CompanyAccessSnapshot
}

export function useCompanyAccessQuery({
  companyId,
  enabled = true,
  initialData,
}: UseCompanyAccessOptions) {
  const { user, loading: authLoading } = useAuth()
  const isAuthReady = !authLoading && !!user

  return useQuery({
    queryKey: queryKeys.companyAccess(companyId),
    queryFn: async () => {
      try {
        if (!companyId) {
          throw new Error('Company ID is required')
        }
        const result = await getCompanyAccessState(companyId)
        if (!result.success || !result.access) {
          throw new Error(result.error || 'Failed to fetch company access')
        }
        return result.access
      } catch (err) {
        console.error('[useCompanyAccessQuery] queryFn threw', err, (err as any)?.stack)
        throw err
      }
    },
    enabled: enabled && !!companyId && isAuthReady,
    initialData,
    // Mark pre-populated initialData as fresh so React Query doesn't
    // immediately refetch behind it. Without this, every page mount
    // that supplies initialData triggers a redundant background fetch
    // (defeating the whole point of pre-population from the batched
    // init action).
    initialDataUpdatedAt: initialData ? Date.now() : undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  })
}
