'use client'

import { Suspense } from 'react'
import { usePageView, useScrollTracking, useTimeOnPage } from '@/hooks/useAnalytics'

function AnalyticsTracking({ children }: { children: React.ReactNode }) {
  // Automatically track page views on route changes
  usePageView()
  
  // Track scroll depth
  useScrollTracking()
  
  // Track time on page
  useTimeOnPage()

  return <>{children}</>
}

export default function AnalyticsWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<>{children}</>}>
      <AnalyticsTracking>{children}</AnalyticsTracking>
    </Suspense>
  )
}
