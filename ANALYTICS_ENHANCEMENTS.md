# Google Analytics Enhancements

This document outlines all the analytics tracking enhancements added to the Finacra application.

## Overview

We've implemented comprehensive Google Analytics tracking beyond basic page views, including:
- Automatic page view tracking for client-side navigation
- Event tracking for user interactions
- Conversion tracking
- User engagement metrics
- Product interaction tracking

## Files Created

### 1. `lib/analytics.ts`
Central analytics utility library with functions for:
- `trackEvent()` - Generic event tracking
- `trackPageView()` - Manual page view tracking
- `trackButtonClick()` - Button click tracking
- `trackLinkClick()` - Link click tracking
- `trackFormSubmit()` - Form submission tracking
- `trackProductInteraction()` - Product card interactions (hover/click/view)
- `trackSubscriptionEvent()` - Subscription/trial events
- `trackConversion()` - Conversion goal tracking
- `trackScrollDepth()` - Scroll depth tracking
- `trackTimeOnPage()` - Time spent on page
- `trackSearch()` - Search query tracking
- `trackDownload()` - File download tracking
- `trackVideoPlay()` - Video play tracking

### 2. `hooks/useAnalytics.ts`
React hooks for automatic tracking:
- `usePageView()` - Automatically tracks page views on route changes
- `useScrollTracking()` - Tracks scroll depth (25%, 50%, 75%, 90%, 100%)
- `useTimeOnPage()` - Tracks time spent on each page

### 3. `components/AnalyticsWrapper.tsx`
Wrapper component that automatically applies all tracking hooks to all pages.

## Implementation Details

### Automatic Tracking (No Code Required)

These are automatically tracked on all pages:
- ✅ Page views (on route changes)
- ✅ Scroll depth (25%, 50%, 75%, 90%, 100%)
- ✅ Time on page

### Manual Event Tracking

#### Home Page (`app/home/page.tsx`)
- ✅ Product card hover events
- ✅ Product card click events
- ✅ "Learn More" button clicks for each product

#### Public Header (`components/PublicHeader.tsx`)
- ✅ Navigation link clicks (Features, Plans, Customers, Contact Us)
- ✅ Anchor link clicks (smooth scroll navigation)
- ✅ Dropdown menu item clicks (Compliance Tracker, Company Onboarding)
- ✅ "Start Trial for free" button clicks
- ✅ "Log In" link clicks

#### Subscribe Page (`app/subscribe/page.tsx`)
- ✅ Trial start events (with tier information)
- ✅ Conversion tracking for trial starts

## Event Categories

### 1. Button Clicks
- Event: `button_click`
- Parameters: `button_name`, `location`

### 2. Link Clicks
- Event: `link_click`
- Parameters: `link_text`, `link_url`

### 3. Product Interactions
- Event: `product_interaction`
- Parameters: `product_name`, `interaction_type` (hover/click/view), `location`

### 4. Subscription Events
- Event: `subscription_event`
- Parameters: `event_type` (trial_start/subscription_start/upgrade/downgrade), `tier`, `billing_cycle`, `value`, `currency`

### 5. Conversions
- Event: `conversion`
- Parameters: `conversion_type` (signup/trial_start/subscription/contact_form/download), `value`, `currency`

### 6. Scroll Depth
- Event: `scroll_depth`
- Parameters: `scroll_depth` (25/50/75/90/100)

### 7. Time on Page
- Event: `time_on_page`
- Parameters: `time_on_page` (seconds)

## Usage Examples

### Track a Custom Button Click
```typescript
import { trackButtonClick } from '@/lib/analytics'

<button onClick={() => trackButtonClick('Custom Button', '/page')}>
  Click Me
</button>
```

### Track a Form Submission
```typescript
import { trackFormSubmit } from '@/lib/analytics'

const handleSubmit = () => {
  trackFormSubmit('Contact Form', '/contact')
  // ... rest of form logic
}
```

### Track a Conversion
```typescript
import { trackConversion } from '@/lib/analytics'

// After successful signup
trackConversion('signup')

// After successful subscription
trackConversion('subscription', 9999) // value in INR
```

### Track Product Interaction
```typescript
import { trackProductInteraction } from '@/lib/analytics'

<div onMouseEnter={() => trackProductInteraction('Compliance Tracker', 'hover', '/home')}>
  Product Card
</div>
```

## Google Analytics Dashboard

You can view all these events in your Google Analytics dashboard:
1. Go to **Reports** → **Engagement** → **Events**
2. Filter by event name to see specific interactions
3. Set up custom reports for conversion tracking
4. Create goals based on conversion events

## KPI Tracking

We've created a comprehensive KPI tracking system that maps all business KPIs to Google Analytics events. See `docs/KPI_TRACKING_SETUP.md` for complete documentation.

### KPI Tracking Functions

All KPI tracking functions are available in `lib/analytics/kpi-tracking.ts`:

- **General KPIs**: User login, session time, onboarding, CIN retrieval, NPS, system errors, churn
- **Company Overview**: Company edits, data accuracy
- **Compliance Tracker**: Tracker usage, calendar sync, document uploads
- **DSC Management**: DSC exports, notifications, credential views
- **Reports**: Report generation, downloads, export formats
- **Team Access**: User additions, access changes, CA additions, email sends
- **Document Vault**: File uploads, exports, shares, note usage
- **Reminders**: Email opens, notification clicks

### Usage Example

```typescript
import { trackUserLogin, trackTrackerTabOpen } from '@/lib/analytics/kpi-tracking'

// Track when user logs in
trackUserLogin(userId, companyId)

// Track when tracker tab is opened
trackTrackerTabOpen(companyId)
```

## Next Steps (Optional Enhancements)

1. **Integrate KPI Tracking**: Add KPI tracking functions throughout the application at key interaction points
2. **Set up GA4 Custom Dimensions**: Configure custom dimensions in Google Analytics for KPI segmentation
3. **Create KPI Dashboards**: Build custom reports in GA4 for KPI monitoring
4. **E-commerce Tracking**: Add detailed purchase tracking with items, quantities, and revenue
5. **User Properties**: Track user segments (trial users, paid users, etc.)
6. **Error Tracking**: Track JavaScript errors and failed API calls
7. **Performance Tracking**: Track page load times and Core Web Vitals
8. **A/B Testing**: Integrate with Google Optimize for A/B testing
9. **Enhanced Conversions**: Set up enhanced e-commerce tracking for subscription flows

## Measurement ID

- **Measurement ID**: `G-NQ740DGFEQ`
- **Stream URL**: `https://finacra.com`
- **Stream ID**: `13633323082`

All tracking is configured to use this measurement ID automatically.
