'use client'

import { useQuery } from '@tanstack/react-query'
import { getAccessibleCompanyState } from '@/app/data-room/actions'
import { queryKeys } from '@/lib/react-query/query-keys'

interface UseAccessibleCompaniesOptions {
  enabled?: boolean
  initialData?: string[]
}

export function useAccessibleCompaniesQuery({
  enabled = true,
  initialData,
}: UseAccessibleCompaniesOptions = {}) {
  return useQuery({
    queryKey: queryKeys.accessibleCompanies(),
    queryFn: async () => {
      try {
        const result = await getAccessibleCompanyState()
        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch accessible companies')
        }
        return result.accessibleCompanyIds || []
      } catch (err) {
        console.error('[useAccessibleCompaniesQuery] queryFn threw', err, (err as any)?.stack)
        throw err
      }
    },
    enabled,
    initialData,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
  })
}
