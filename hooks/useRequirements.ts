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
  const [isLoading, setIsLoading] = useState(true) // Start true — prevents empty state flash before first fetch

  // Tracks which companyId the current in-flight request is for.
  // Updated immediately on each fetch call. When a response arrives, we
  // compare its companyId to this ref and discard if they don't match.
  const activeCompanyRef = useRef<string | null>(null)
  // Tracks which companyId we already have fresh data for (skip re-fetch).
  const fetchedForRef = useRef<string | null>(null)

  const fetchForCompany = useCallback(async (id: string, quiet = false) => {
    activeCompanyRef.current = id
    // Quiet mode (background refresh from cia:data-changed): keep the
    // existing data on screen, swap atomically when the response
    // arrives. Per project rule 5 — never clear state to empty before
    // replacing. The "Loading compliances…" shell only appears on a
    // truly cold load.
    if (!quiet) setIsLoading(true)

    try {
      const result = await getRegulatoryRequirements(id)

      // Discard if company changed while this request was in flight
      if (activeCompanyRef.current !== id) return

      startTransition(() => {
        if (result.success && result.requirements) {
          setRequirements(result.requirements)
          fetchedForRef.current = id
        } else if (!quiet) {
          // Don't blow away existing data on a quiet background failure.
          setRequirements([])
          if (result.error?.includes('UnrecognizedActionError')) {
            window.location.reload()
          }
        }
      })
    } catch (err) {
      if (activeCompanyRef.current !== id) return
      if (err instanceof Error && err.message?.includes('UnrecognizedActionError')) {
        window.location.reload()
        return
      }
      if (!quiet) startTransition(() => setRequirements([]))
    } finally {
      if (activeCompanyRef.current === id && !quiet) {
        setIsLoading(false)
      }
    }
  }, [])

  const refresh = useCallback((opts?: { quiet?: boolean }) => {
    if (!companyId || !enabled || !hasAccess) return
    fetchedForRef.current = null
    fetchForCompany(companyId, opts?.quiet ?? false)
  }, [companyId, enabled, hasAccess, fetchForCompany])

  useEffect(() => {
    if (!companyId || !enabled || !hasAccess) {
      // Only clear if we don't already have pre-seeded data for this company
      if (fetchedForRef.current !== companyId) {
        activeCompanyRef.current = null
        fetchedForRef.current = null
        startTransition(() => {
          setRequirements([])
          setIsLoading(false)
        })
      }
      return
    }

    // Already have fresh data for this company — skip
    if (fetchedForRef.current === companyId) {
      setIsLoading(false)
      return
    }

    fetchForCompany(companyId)
  }, [companyId, enabled, hasAccess, fetchForCompany])

  // Mark data as fresh for a specific company (used when data is set externally, e.g. batched fetch)
  const markFresh = useCallback((id: string) => {
    fetchedForRef.current = id
    activeCompanyRef.current = id
  }, [])

  // Refresh when the CIA agent mutates requirements (tool calls), or
  // when TrackerEvaluationPanel finishes a (silent) re-evaluation.
  // Uses quiet=true so the existing accordion stays on screen and the
  // updated data atomically swaps in — no "Loading compliances…" flash.
  useEffect(() => {
    const handler = () => refresh({ quiet: true })
    window.addEventListener('cia:data-changed', handler)
    return () => window.removeEventListener('cia:data-changed', handler)
  }, [refresh])

  return { requirements, setRequirements, isLoading, refresh, markFresh }
}
