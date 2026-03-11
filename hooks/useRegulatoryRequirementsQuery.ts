'use client'

import { useQuery } from '@tanstack/react-query'
import { getRegulatoryRequirements } from '@/app/data-room/actions'
import { queryKeys } from '@/lib/react-query/query-keys'
import type { RegulatoryRequirement } from '@/app/data-room/actions'

interface UseRegulatoryRequirementsOptions {
  companyId: string | null
  enabled?: boolean
  initialData?: RegulatoryRequirement[]
}

export function useRegulatoryRequirementsQuery({
  companyId,
  enabled = true,
  initialData,
}: UseRegulatoryRequirementsOptions) {
  return useQuery({
    queryKey: queryKeys.regulatoryRequirements(companyId),
    queryFn: async () => {
      if (!companyId) {
        return []
      }
      const result = await getRegulatoryRequirements(companyId)
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch requirements')
      }
      return result.requirements || []
    },
    enabled: enabled && !!companyId,
    initialData,
    staleTime: 1 * 60 * 1000, // 1 minute - requirements can change frequently
    gcTime: 5 * 60 * 1000,
  })
}
