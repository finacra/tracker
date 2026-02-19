# KPI Tracking Setup Guide

This document explains how to set up Google Analytics 4 (GA4) to track all business KPIs defined in the admin panel.

## Overview

We've created a comprehensive KPI tracking system that maps each business KPI to specific Google Analytics events. This allows you to:
- Track user behavior across all KPIs
- Analyze performance by company, user, and feature
- Create custom reports in Google Analytics
- Set up alerts and goals based on KPI thresholds

## Google Analytics 4 Setup

### 1. Custom Dimensions

You need to create custom dimensions in GA4 to properly segment KPI data:

1. Go to **Admin** → **Custom Definitions** → **Custom Dimensions**
2. Click **Create custom dimension** and add:

#### User-Level Dimensions:
- **user_id** (User ID)
- **company_id** (Company ID)
- **user_role** (User Role)

#### Event-Level Dimensions:
- **kpi_category** (KPI Category)
- **kpi_name** (KPI Name)
- **company_id** (Company ID)
- **notification_id** (Notification ID)
- **report_type** (Report Type)
- **file_type** (File Type)

### 2. Custom Metrics

Create custom metrics for quantitative KPIs:

1. Go to **Admin** → **Custom Definitions** → **Custom Metrics**
2. Create:
- **value_saved** (Value saved in INR)
- **time_taken_ms** (Time taken in milliseconds)
- **recipient_count** (Number of email recipients)
- **people_count** (Number of people onboarded)

### 3. Event Mapping

Each KPI is tracked via specific events. Here's the mapping:

#### General KPIs

| KPI | Event Name | Key Parameters |
|-----|------------|----------------|
| Value | `value_saved` | value, company_id, notification_id |
| Addictiveness | `user_login` | user_id, company_id |
| CIN Retrieval Accuracy | `cin_retrieval` | success, error_type, company_id |
| Happiness | `nps_score` | score, company_id |
| Reliability | `system_error` | error_type, severity, company_id |
| Churn (Ghosting) | `user_activity` | user_id, company_id, week_number |
| Time | `session_time` | time_seconds, company_id |
| Onboarding | `onboarding_complete` | company_id, people_count |

#### Company Overview KPIs

| KPI | Event Name | Key Parameters |
|-----|------------|----------------|
| Accuracy of Data | `company_edit` | company_id, field |
| Numbers of times "Edit Company" | `company_edit` | company_id, field |

#### Compliance Tracker KPIs

| KPI | Event Name | Key Parameters |
|-----|------------|----------------|
| Tracker Accuracy | `tracker_status_change` | company_id, notification_id |
| Tracker Usage | `tracker_tab_open`, `tracker_status_change` | company_id |
| Calendar Usage | `calendar_sync` | company_id |
| Document Upload | `tracker_document_upload` | company_id, document_type |

#### DSC Management KPIs

| KPI | Event Name | Key Parameters |
|-----|------------|----------------|
| Function | `dsc_export` | company_id |
| Notifications | `dsc_notification_click` | company_id, notification_id |
| Dependency | `platform_credentials_view` | company_id |

#### Reports KPIs

| KPI | Event Name | Key Parameters |
|-----|------------|----------------|
| Report Generation Efficiency | `report_generation` | company_id, report_type, time_taken_ms |
| Retention | `report_download` | company_id, report_type, export_format |
| Coming soon interest | `coming_soon_click` | feature, company_id |
| Export Format | `report_download` | export_format |

#### Team Access KPIs

| KPI | Event Name | Key Parameters |
|-----|------------|----------------|
| Team Adoption | `team_user_added`, `team_access_change`, `ca_added` | company_id, role, change_type |
| Cont | `email_sent` | company_id, recipient_count |

#### Document Vault KPIs

| KPI | Event Name | Key Parameters |
|-----|------------|----------------|
| Usage | `vault_file_upload`, `vault_file_export`, `vault_file_share` | company_id, file_type |
| Password Usage | `note_usage` | company_id, action |

#### Reminders KPIs

| KPI | Event Name | Key Parameters |
|-----|------------|----------------|
| Email Responsiveness | `notification_email_open`, `notification_click` | notification_id, company_id, source |

## Implementation Status

### ✅ Already Implemented
- Basic analytics setup
- Page view tracking
- Button/link click tracking
- Product interaction tracking
- Subscription/trial tracking

### 🔄 To Be Implemented
The following tracking functions need to be integrated into the application:

1. **User Login Tracking** - Add to login/auth flow
2. **Company Edit Tracking** - Add to company edit forms
3. **Compliance Tracker Tracking** - Add to tracker page interactions
4. **DSC Management Tracking** - Add to DSC export/notification handlers
5. **Reports Tracking** - Add to report generation/download
6. **Team Access Tracking** - Add to team management actions
7. **Document Vault Tracking** - Add to vault upload/export/share
8. **Reminders Tracking** - Add to notification handlers

## Usage Examples

### In Your Components

```typescript
import { trackUserLogin, trackTrackerTabOpen, trackVaultFileUpload } from '@/lib/analytics/kpi-tracking'

// Track user login
trackUserLogin(userId, companyId)

// Track tracker tab open
trackTrackerTabOpen(companyId)

// Track vault file upload
trackVaultFileUpload(companyId, 'pdf')
```

## Creating Reports in GA4

### 1. KPI Dashboard

Create a custom report:
1. Go to **Explore** → **Blank**
2. Add dimensions: `kpi_category`, `kpi_name`, `company_id`
3. Add metrics: `Event count`
4. Add filters for specific KPIs

### 2. Company Performance

1. Create a report with:
   - Dimension: `company_id`
   - Metrics: Event counts for each KPI category
   - Breakdown by `kpi_name`

### 3. User Engagement

1. Track `user_login` events
2. Group by `user_id` and `week_number`
3. Calculate login frequency per week

## Next Steps

1. **Integrate tracking functions** into the application at key interaction points
2. **Set up custom dimensions** in GA4 (one-time setup)
3. **Create custom reports** in GA4 for KPI monitoring
4. **Set up alerts** for critical KPIs (e.g., system errors, churn)
5. **Schedule weekly reports** for stakeholders

## Notes

- All events include `kpi_category` and `kpi_name` for easy filtering
- Company ID is included where applicable for company-level analysis
- User ID is included for user-level analysis (respecting privacy)
- Some KPIs require backend tracking (e.g., login frequency) - these can be aggregated and sent via GA4 Measurement Protocol
