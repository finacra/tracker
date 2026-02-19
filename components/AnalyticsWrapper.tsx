'use client'

import { usePageView, useScrollTracking, useTimeOnPage } from '@/hooks/useAnalytics'

export default function AnalyticsWrapper({ children }: { children: React.ReactNode }) {
  // Automatically track page views on route changes
  usePageView()
  
  // Track scroll depth
  useScrollTracking()
  
  // Track time on page
  useTimeOnPage()

  return <>{children}</>
}
