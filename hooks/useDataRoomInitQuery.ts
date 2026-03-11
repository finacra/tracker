'use client'

import { useQuery } from '@tanstack/react-query'
import { getDataRoomInitState } from '@/app/data-room/actions'
import { queryKeys } from '@/lib/react-query/query-keys'

interface UseDataRoomInitOptions {
  preferredCompanyId?: string | null
  enabled?: boolean
}

export function useDataRoomInitQuery({
  preferredCompanyId = null,
  enabled = true,
}: UseDataRoomInitOptions = {}) {
  return useQuery({
    queryKey: queryKeys.dataRoomInit(preferredCompanyId),
    queryFn: async () => {
      const result = await getDataRoomInitState(preferredCompanyId)
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to initialize data room')
      }
      return result.data
    },
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes - init data changes when company switches
    gcTime: 5 * 60 * 1000,
    // This is expensive, so we want to cache it well
  })
}
