# KPI Tracking System

## Overview

The KPI Tracking System is a comprehensive solution for tracking and analyzing Key Performance Indicators (KPIs) across all users and companies in the Finacra platform. It provides real-time metrics, aggregations, and detailed analytics for all 33 defined KPIs.

## Features

### 1. **Tracking System Tab** (`/admin` → Tracking System)
   - View aggregated KPI metrics across all users and companies
   - Filter by category, KPI name, company, and date range
   - View detailed metrics for individual KPIs
   - Real-time data aggregation and statistics

### 2. **Database Schema**
   - `kpi_metrics` table stores all tracking data
   - Supports user-level and company-level tracking
   - Stores additional metadata as JSON
   - Indexed for fast queries

### 3. **Tracking Utility Library**
   - Pre-built functions for common KPIs
   - Easy-to-use API for custom tracking
   - Automatic error handling

## Database Setup

Run the migration file to create the `kpi_metrics` table:

```sql
-- File: supabase/migrations/create_kpi_metrics_table.sql
```

This creates:
- `kpi_metrics` table with proper indexes
- Row Level Security (RLS) policies
- Foreign key relationships to users and companies

## Usage

### Basic Tracking

```typescript
import { trackKPI } from '@/lib/tracking/kpi-tracker'

// Track a custom KPI
await trackKPI(
  'Tracker Usage',           // KPI name
  'Compliance Tracker',      // Category
  1,                         // Metric value
  userId,                    // Optional user ID
  companyId,                 // Optional company ID
  { action: 'tab_opened' }   // Optional metadata
)
```

### Pre-built Tracking Functions

```typescript
import {
  trackLogin,
  trackTrackerTabOpened,
  trackStatusChange,
  trackCalendarSync,
  trackDocumentUpload,
  trackCompanyEdit,
  trackDSCExport,
  trackNotificationClick,
  trackReportDownload,
  trackTeamMemberAdded,
  trackVaultFileUpload,
  trackVaultFileExport,
  trackNoteUsage,
  trackEmailOpen,
  trackTimeOnPage,
} from '@/lib/tracking/kpi-tracker'

// Track user login
await trackLogin(userId)

// Track tracker tab opened
await trackTrackerTabOpened(userId, companyId)

// Track status change
await trackStatusChange(userId, companyId, requirementId, 'pending', 'completed')

// Track document upload
await trackDocumentUpload(userId, companyId, 'PAN')

// Track calendar sync
await trackCalendarSync(userId, companyId)

// Track company edit
await trackCompanyEdit(userId, companyId)

// Track DSC export
await trackDSCExport(userId, companyId)

// Track notification click
await trackNotificationClick(userId, companyId, 'compliance_due')

// Track report download
await trackReportDownload(userId, companyId, 'compliance_report')

// Track team member added
await trackTeamMemberAdded(addedByUserId, companyId, newUserId)

// Track vault file upload
await trackVaultFileUpload(userId, companyId, 'pdf')

// Track vault file export
await trackVaultFileExport(userId, companyId, 5)

// Track note usage
await trackNoteUsage(userId, companyId, 'created')

// Track email open
await trackEmailOpen(userId, companyId, 'compliance_reminder')

// Track time on page
await trackTimeOnPage(userId, companyId, '/data-room', 120)
```

## Integration Points

### Where to Add Tracking

1. **Login Tracking** - Add to authentication success handler
2. **Tracker Usage** - Add to data-room page when tracker tab is opened
3. **Status Changes** - Add to status update handlers
4. **Calendar Sync** - Add to calendar sync button click
5. **Document Upload** - Add to document upload success handlers
6. **Company Edit** - Add to company edit form submission
7. **DSC Export** - Add to DSC export functionality
8. **Notifications** - Add to notification click handlers
9. **Report Downloads** - Add to report download handlers
10. **Team Management** - Add to team member add/remove handlers
11. **Vault Operations** - Add to vault file upload/export handlers
12. **Note Usage** - Add to note create/view/update handlers
13. **Email Opens** - Add to email tracking pixels/webhooks

## Admin Interface

### Accessing the Tracking System

1. Navigate to `/admin` page
2. Click on the "Tracking System" tab
3. Use filters to view specific KPIs:
   - **Category**: Filter by KPI category
   - **KPI**: Filter by specific KPI name
   - **Company**: Filter by company
   - **Date Range**: Last 7/30/90 days or all time

### Viewing Metrics

- **Summary Table**: Shows aggregated metrics for all tracked KPIs
  - Total records
  - Average, min, max values
  - Unique users and companies
  - Last recorded date

- **Detailed View**: Click "View Details" to see individual tracking records
  - Date and time
  - Company name
  - User email
  - Metric value
  - Additional metadata

## Tracked KPIs

The system tracks all 33 KPIs defined in the KPI list:

### General (8 KPIs)
- Value
- Addictiveness
- CIN Retrieval Accuracy
- Happiness
- Reliability
- Churn (Ghosting)
- Time
- Onboarding

### Company Overview (2 KPIs)
- Accuracy of Data
- Numbers of times "Edit Company"

### Compliance Tracker (4 KPIs)
- Tracker Accuracy
- Tracker Usage
- Calendar Usage
- Document Upload

### DSC Management (3 KPIs)
- Function
- Notifications
- Dependency

### Reports (4 KPIs)
- Report Generation Efficiency
- Retention
- Coming soon interest
- Export Format

### Team Access (5 KPIs)
- Team Adoption (multiple metrics)
- Cont

### Document Vault (4 KPIs)
- Usage
- Password Usage (multiple metrics)

### Reminders (1 KPI)
- Email Responsiveness

## Next Steps

1. **Run the database migration** to create the `kpi_metrics` table
2. **Integrate tracking calls** into the application at key interaction points
3. **Monitor the Tracking System tab** to see metrics populate
4. **Set up automated reports** (optional) for regular KPI reviews

## Notes

- Tracking is non-blocking - failures won't break the application
- All tracking is server-side for security
- Data is aggregated in real-time when viewing the admin interface
- Historical data is preserved for trend analysis
