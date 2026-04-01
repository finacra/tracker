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
      if (!companyId) {
        throw new Error('Company ID is required')
      }
      const result = await getCompanyAccessState(companyId)
      if (!result.success || !result.access) {
        throw new Error(result.error || 'Failed to fetch company access')
      }
      return result.access
    },
    enabled: enabled && !!companyId && isAuthReady,
    initialData,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  })
}
