'use client'

import { useQuery } from '@tanstack/react-query'
import { getUserRole } from '@/app/data-room/actions'
import { queryKeys } from '@/lib/react-query/query-keys'

interface UseUserRoleOptions {
  companyId: string | null
  enabled?: boolean
  initialData?: string | null
}

export function useUserRoleQuery({
  companyId,
  enabled = true,
  initialData,
}: UseUserRoleOptions) {
  return useQuery({
    queryKey: queryKeys.userRole(companyId),
    queryFn: async () => {
      if (!companyId) {
        return null
      }
      const result = await getUserRole(companyId)
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch user role')
      }
      return result.role
    },
    enabled: enabled && !!companyId,
    initialData,
    staleTime: 5 * 60 * 1000, // 5 minutes - roles don't change often
    gcTime: 10 * 60 * 1000,
  })
}
