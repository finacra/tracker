'use client'

import { useState, useEffect, useRef, useCallback, startTransition } from 'react'
import { getRegulatoryRequirements, type RegulatoryRequirement } from '@/app/data-room/actions'

interface UseRequirementsOptions {
  enabled?: boolean
  hasAccess?: boolean
}

/**
 * Custom hook that manages regulatory requirements fetching with proper
 * stale-request prevention. When the company changes, any in-flight request
 * for the previous company is discarded — preventing the race condition where
 * old data overwrites the current company's data.
 */
export function useRequirements(
  companyId: string | null | undefined,
  options: UseRequirementsOptions = {}
) {
  const { enabled = true, hasAccess = true } = options

  const [requirements, setRequirements] = useState<RegulatoryRequirement[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Tracks which companyId the current in-flight request is for.
  // Updated immediately on each fetch call. When a response arrives, we
  // compare its companyId to this ref and discard if they don't match.
  const activeCompanyRef = useRef<string | null>(null)
  // Tracks which companyId we already have fresh data for (skip re-fetch).
  const fetchedForRef = useRef<string | null>(null)

  const fetchForCompany = useCallback(async (id: string) => {
    activeCompanyRef.current = id
    setIsLoading(true)

    try {
      const result = await getRegulatoryRequirements(id)

      // Discard if company changed while this request was in flight
      if (activeCompanyRef.current !== id) return

      startTransition(() => {
        if (result.success && result.requirements) {
          setRequirements(result.requirements)
          fetchedForRef.current = id
        } else {
          setRequirements([])
          if (result.error?.includes('UnrecognizedActionError')) {
            window.location.reload()
          }
        }
      })
    } catch (err: any) {
      if (activeCompanyRef.current !== id) return
      if (err?.message?.includes('UnrecognizedActionError')) {
        window.location.reload()
        return
      }
      startTransition(() => setRequirements([]))
    } finally {
      if (activeCompanyRef.current === id) {
        setIsLoading(false)
      }
    }
  }, [])

  const refresh = useCallback(() => {
    if (!companyId || !enabled || !hasAccess) return
    fetchedForRef.current = null
    fetchForCompany(companyId)
  }, [companyId, enabled, hasAccess, fetchForCompany])

  useEffect(() => {
    if (!companyId || !enabled || !hasAccess) {
      activeCompanyRef.current = null
      fetchedForRef.current = null
      startTransition(() => {
        setRequirements([])
        setIsLoading(false)
      })
      return
    }

    // Already have fresh data for this company — skip
    if (fetchedForRef.current === companyId) return

    fetchForCompany(companyId)
  }, [companyId, enabled, hasAccess, fetchForCompany])

  // Mark data as fresh for a specific company (used when data is set externally, e.g. batched fetch)
  const markFresh = useCallback((id: string) => {
    fetchedForRef.current = id
    activeCompanyRef.current = id
  }, [])

  return { requirements, setRequirements, isLoading, refresh, markFresh }
}
