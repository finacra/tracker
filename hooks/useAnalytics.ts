'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { trackPageView, trackScrollDepth, trackTimeOnPage } from '@/lib/analytics'

// Hook to automatically track page views on route changes
export function usePageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '')
    trackPageView(url, document.title)
  }, [pathname, searchParams])
}

// Hook to track scroll depth
export function useScrollTracking() {
  useEffect(() => {
    const scrollDepths = [25, 50, 75, 90, 100]
    const trackedDepths = new Set<number>()

    const handleScroll = () => {
      const windowHeight = window.innerHeight
      const documentHeight = document.documentElement.scrollHeight
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      const scrollPercentage = Math.round(
        ((scrollTop + windowHeight) / documentHeight) * 100
      )

      scrollDepths.forEach((depth) => {
        if (scrollPercentage >= depth && !trackedDepths.has(depth)) {
          trackedDepths.add(depth)
          trackScrollDepth(depth)
        }
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
}

// Hook to track time on page
export function useTimeOnPage() {
  useEffect(() => {
    const startTime = Date.now()

    const handleBeforeUnload = () => {
      const timeSpent = Math.round((Date.now() - startTime) / 1000)
      if (timeSpent > 0) {
        trackTimeOnPage(timeSpent)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])
}
