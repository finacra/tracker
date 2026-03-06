'use client'

import { Suspense, useEffect } from 'react'
import { usePageView, useScrollTracking, useTimeOnPage } from '@/hooks/useAnalytics'
import { useAuth } from '@/hooks/useAuth'
import { usePathname } from 'next/navigation'
import { trackTimeOnPage as trackKPITimeOnPage } from '@/lib/tracking/kpi-tracker'

function AnalyticsTracking({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const pathname = usePathname()

  // Automatically track page views on route changes
  usePageView()
  
  // Track scroll depth
  useScrollTracking()
  
  // Track time on page (Google Analytics)
  useTimeOnPage()

  // Track time on page (KPI system)
  useEffect(() => {
    if (!user?.id) return

    const startTime = Date.now()
    const page = pathname || 'unknown'

    const handleBeforeUnload = async () => {
      const timeSpent = Math.round((Date.now() - startTime) / 1000)
      if (timeSpent > 0) {
        // Get company ID from URL params or localStorage if available
        const urlParams = new URLSearchParams(window.location.search)
        const companyId = urlParams.get('company_id') || urlParams.get('company') || undefined
        await trackKPITimeOnPage(user.id, companyId, page, timeSpent)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [user?.id, pathname])

  return <>{children}</>
}

export default function AnalyticsWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<>{children}</>}>
      <AnalyticsTracking>{children}</AnalyticsTracking>
    </Suspense>
  )
}
