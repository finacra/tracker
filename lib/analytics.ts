// Google Analytics event tracking utility

declare global {
  interface Window {
    gtag: (
      command: 'config' | 'event' | 'js' | 'set',
      targetId: string | Date,
      config?: {
        [key: string]: any
      }
    ) => void
    dataLayer: any[]
  }
}

// Track custom events
export const trackEvent = (
  eventName: string,
  eventParams?: {
    [key: string]: any
  }
) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, eventParams)
  }
}

// Track page views (for client-side navigation)
export const trackPageView = (url: string, title?: string) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', 'G-NQ740DGFEQ', {
      page_path: url,
      page_title: title,
    })
  }
}

// Track button clicks
export const trackButtonClick = (buttonName: string, location?: string) => {
  trackEvent('button_click', {
    button_name: buttonName,
    location: location || window.location.pathname,
  })
}

// Track link clicks
export const trackLinkClick = (linkText: string, linkUrl: string) => {
  trackEvent('link_click', {
    link_text: linkText,
    link_url: linkUrl,
  })
}

// Track form submissions
export const trackFormSubmit = (formName: string, formLocation?: string) => {
  trackEvent('form_submit', {
    form_name: formName,
    form_location: formLocation || window.location.pathname,
  })
}

// Track product interactions
export const trackProductInteraction = (
  productName: string,
  interactionType: 'hover' | 'click' | 'view',
  location?: string
) => {
  trackEvent('product_interaction', {
    product_name: productName,
    interaction_type: interactionType,
    location: location || window.location.pathname,
  })
}

// Track subscription events
export const trackSubscriptionEvent = (
  eventType: 'trial_start' | 'subscription_start' | 'subscription_upgrade' | 'subscription_downgrade',
  tier?: string,
  billingCycle?: string,
  value?: number
) => {
  trackEvent('subscription_event', {
    event_type: eventType,
    tier: tier,
    billing_cycle: billingCycle,
    value: value,
    currency: 'INR',
  })
}

// Track conversion events
export const trackConversion = (
  conversionType: 'signup' | 'trial_start' | 'subscription' | 'contact_form' | 'download',
  value?: number
) => {
  trackEvent('conversion', {
    conversion_type: conversionType,
    value: value,
    currency: value ? 'INR' : undefined,
  })
}

// Track scroll depth
export const trackScrollDepth = (depth: number) => {
  trackEvent('scroll_depth', {
    scroll_depth: depth,
  })
}

// Track time on page
export const trackTimeOnPage = (timeInSeconds: number) => {
  trackEvent('time_on_page', {
    time_on_page: timeInSeconds,
  })
}

// Track search queries (if applicable)
export const trackSearch = (searchQuery: string, resultsCount?: number) => {
  trackEvent('search', {
    search_term: searchQuery,
    results_count: resultsCount,
  })
}

// Track file downloads
export const trackDownload = (fileName: string, fileType: string) => {
  trackEvent('file_download', {
    file_name: fileName,
    file_type: fileType,
  })
}

// Track video plays (if applicable)
export const trackVideoPlay = (videoName: string, videoDuration?: number) => {
  trackEvent('video_play', {
    video_name: videoName,
    video_duration: videoDuration,
  })
}

// Export KPI tracking functions
export * from './analytics/kpi-tracking'
