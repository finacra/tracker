# KPI Tracking Integration Examples

This document provides practical examples of how to integrate KPI tracking into your application.

## 1. User Login Tracking

**Location**: `app/login/page.tsx` or authentication callback

```typescript
import { trackUserLogin } from '@/lib/analytics/kpi-tracking'
import { useAuth } from '@/hooks/useAuth'

// After successful login
const handleLogin = async () => {
  const { user } = await signIn()
  if (user) {
    // Get company ID if available
    const companyId = await getCurrentCompanyId()
    trackUserLogin(user.id, companyId)
  }
}
```

## 2. Compliance Tracker Tracking

**Location**: `app/data-room/page.tsx` or compliance tracker component

```typescript
import { trackTrackerTabOpen, trackTrackerStatusChange, trackCalendarSync } from '@/lib/analytics/kpi-tracking'

// When tracker tab is opened
useEffect(() => {
  if (activeTab === 'tracker') {
    trackTrackerTabOpen(companyId)
  }
}, [activeTab, companyId])

// When status is changed
const handleStatusChange = (notificationId: string, newStatus: string) => {
  // Update status in database
  await updateStatus(notificationId, newStatus)
  
  // Track the change
  trackTrackerStatusChange(companyId, notificationId)
}

// When calendar sync is clicked
const handleCalendarSync = async () => {
  await syncCalendar()
  trackCalendarSync(companyId)
}
```

## 3. Document Vault Tracking

**Location**: `app/data-room/page.tsx` or vault component

```typescript
import { trackVaultFileUpload, trackVaultFileExport, trackVaultFileShare, trackNoteUsage } from '@/lib/analytics/kpi-tracking'

// When file is uploaded
const handleFileUpload = async (file: File) => {
  await uploadFile(file)
  trackVaultFileUpload(companyId, file.type)
}

// When file is exported
const handleFileExport = async (fileId: string) => {
  const file = await exportFile(fileId)
  trackVaultFileExport(companyId, file.type)
}

// When file is shared
const handleFileShare = async (fileId: string, recipients: string[]) => {
  await shareFile(fileId, recipients)
  trackVaultFileShare(companyId)
}

// When note is created/viewed
const handleNoteAction = (action: 'create' | 'view' | 'update') => {
  trackNoteUsage(companyId, action)
}
```

## 4. Company Edit Tracking

**Location**: `app/manage-company/page.tsx` or company edit form

```typescript
import { trackCompanyEdit } from '@/lib/analytics/kpi-tracking'

const handleCompanyUpdate = async (formData: CompanyFormData) => {
  // Update company
  await updateCompany(companyId, formData)
  
  // Track each field edit
  Object.keys(formData).forEach(field => {
    if (formData[field] !== originalData[field]) {
      trackCompanyEdit(companyId, field)
    }
  })
}
```

## 5. Reports Tracking

**Location**: Reports generation/download components

```typescript
import { trackReportGeneration, trackReportDownload } from '@/lib/analytics/kpi-tracking'

// When report is generated
const generateReport = async (reportType: string) => {
  const startTime = Date.now()
  const report = await generateReportData(reportType)
  const timeTaken = Date.now() - startTime
  
  trackReportGeneration(companyId, reportType, timeTaken)
  return report
}

// When report is downloaded
const downloadReport = async (reportId: string, format: 'pdf' | 'excel' | 'csv') => {
  await downloadReportFile(reportId, format)
  trackReportDownload(companyId, reportType, format)
}
```

## 6. Team Access Tracking

**Location**: Team management components

```typescript
import { trackTeamUserAdded, trackTeamAccessChange, trackCAAdded } from '@/lib/analytics/kpi-tracking'

// When user is added to team
const addTeamMember = async (email: string, role: string) => {
  await addUserToCompany(companyId, email, role)
  trackTeamUserAdded(companyId, role)
}

// When access is changed
const updateAccess = async (userId: string, newRole: string) => {
  await updateUserRole(companyId, userId, newRole)
  trackTeamAccessChange(companyId, 'role_change')
}

// When CA is added
const addCA = async (caEmail: string) => {
  await addCAUser(companyId, caEmail)
  trackCAAdded(companyId)
}
```

## 7. Session Time Tracking

**Location**: Root layout or app wrapper

```typescript
import { trackSessionTime } from '@/lib/analytics/kpi-tracking'

// Track session time on page unload
useEffect(() => {
  const startTime = Date.now()
  
  const handleBeforeUnload = () => {
    const timeSpent = Math.round((Date.now() - startTime) / 1000)
    if (timeSpent > 0) {
      trackSessionTime(timeSpent, companyId)
    }
  }
  
  window.addEventListener('beforeunload', handleBeforeUnload)
  return () => window.removeEventListener('beforeunload', handleBeforeUnload)
}, [companyId])
```

## 8. Notification Tracking

**Location**: Notification handlers (email and in-app)

```typescript
import { trackNotificationEmailOpen, trackNotificationClick } from '@/lib/analytics/kpi-tracking'

// In email template (pixel tracker)
// Add 1x1 pixel image that calls your API endpoint
// API endpoint should call:
trackNotificationEmailOpen(notificationId, companyId)

// When notification is clicked (in-app or email)
const handleNotificationClick = (notificationId: string, source: 'email' | 'app') => {
  trackNotificationClick(notificationId, companyId, source)
  // Navigate to notification details
}
```

## 9. DSC Management Tracking

**Location**: DSC management components

```typescript
import { trackDSCExport, trackDSCNotificationClick, trackPlatformCredentialsView } from '@/lib/analytics/kpi-tracking'

// When DSC is exported
const exportDSC = async () => {
  await exportDSCFile()
  trackDSCExport(companyId)
}

// When DSC notification is clicked
const handleDSCNotification = (notificationId: string) => {
  trackDSCNotificationClick(companyId, notificationId)
  // Show notification details
}

// When platform credentials are viewed
const viewCredentials = () => {
  trackPlatformCredentialsView(companyId)
  // Show credentials
}
```

## 10. Onboarding Tracking

**Location**: `app/onboarding/page.tsx`

```typescript
import { trackOnboardingComplete } from '@/lib/analytics/kpi-tracking'

const completeOnboarding = async (formData: OnboardingData) => {
  const company = await createCompany(formData)
  const peopleCount = formData.directors?.length || 0
  
  trackOnboardingComplete(company.id, peopleCount)
}
```

## Best Practices

1. **Always include company_id** when available for company-level analysis
2. **Track after successful operations** to ensure data accuracy
3. **Don't track sensitive data** - use IDs and types, not actual content
4. **Use consistent naming** - follow the existing event naming patterns
5. **Handle errors gracefully** - tracking failures shouldn't break functionality
6. **Respect user privacy** - only track necessary data, comply with privacy regulations

## Testing

After integrating tracking, verify in Google Analytics:

1. Go to **Reports** → **Realtime**
2. Perform the action in your app
3. Check if the event appears in realtime reports
4. Verify event parameters are correct

## Monitoring

Set up alerts in GA4 for critical KPIs:
- System errors (Reliability KPI)
- Low login frequency (Churn KPI)
- High report generation times (Report Generation Efficiency KPI)
