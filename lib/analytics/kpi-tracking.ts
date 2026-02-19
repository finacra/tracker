// KPI Tracking Functions for Google Analytics
// Maps business KPIs to GA4 events and custom dimensions

import { trackEvent } from '../analytics'

// Track user login (for Addictiveness KPI)
export const trackUserLogin = (userId?: string, companyId?: string) => {
  trackEvent('user_login', {
    user_id: userId,
    company_id: companyId,
    kpi_category: 'General',
    kpi_name: 'Addictiveness',
  })
}

// Track company edit (for Company Overview KPI)
export const trackCompanyEdit = (companyId: string, field?: string) => {
  trackEvent('company_edit', {
    company_id: companyId,
    field: field,
    kpi_category: 'Company Overview',
    kpi_name: 'Numbers of times "Edit Company"',
  })
}

// Track compliance tracker usage (for Compliance Tracker KPIs)
export const trackTrackerTabOpen = (companyId?: string) => {
  trackEvent('tracker_tab_open', {
    company_id: companyId,
    kpi_category: 'Compliance Tracker',
    kpi_name: 'Tracker Usage',
  })
}

export const trackTrackerStatusChange = (companyId?: string, notificationId?: string) => {
  trackEvent('tracker_status_change', {
    company_id: companyId,
    notification_id: notificationId,
    kpi_category: 'Compliance Tracker',
    kpi_name: 'Tracker Usage',
  })
}

export const trackCalendarSync = (companyId?: string) => {
  trackEvent('calendar_sync', {
    company_id: companyId,
    kpi_category: 'Compliance Tracker',
    kpi_name: 'Calendar Usage',
  })
}

export const trackTrackerDocumentUpload = (companyId?: string, documentType?: string) => {
  trackEvent('tracker_document_upload', {
    company_id: companyId,
    document_type: documentType,
    kpi_category: 'Compliance Tracker',
    kpi_name: 'Document Upload',
  })
}

// Track DSC Management (for DSC Management KPIs)
export const trackDSCExport = (companyId?: string) => {
  trackEvent('dsc_export', {
    company_id: companyId,
    kpi_category: 'DSC Management',
    kpi_name: 'Function',
  })
}

export const trackDSCNotificationClick = (companyId?: string, notificationId?: string) => {
  trackEvent('dsc_notification_click', {
    company_id: companyId,
    notification_id: notificationId,
    kpi_category: 'DSC Management',
    kpi_name: 'Notifications',
  })
}

export const trackPlatformCredentialsView = (companyId?: string) => {
  trackEvent('platform_credentials_view', {
    company_id: companyId,
    kpi_category: 'DSC Management',
    kpi_name: 'Dependency',
  })
}

// Track Reports (for Reports KPIs)
export const trackReportGeneration = (companyId?: string, reportType?: string, timeTaken?: number) => {
  trackEvent('report_generation', {
    company_id: companyId,
    report_type: reportType,
    time_taken_ms: timeTaken,
    kpi_category: 'Reports',
    kpi_name: 'Report Generation Efficiency',
  })
}

export const trackReportDownload = (companyId?: string, reportType?: string, format?: string) => {
  trackEvent('report_download', {
    company_id: companyId,
    report_type: reportType,
    export_format: format,
    kpi_category: 'Reports',
    kpi_name: 'Retention',
  })
}

export const trackComingSoonClick = (feature: string, companyId?: string) => {
  trackEvent('coming_soon_click', {
    feature: feature,
    company_id: companyId,
    kpi_category: 'Reports',
    kpi_name: 'Coming soon interest',
  })
}

// Track Team Access (for Team Access KPIs)
export const trackTeamUserAdded = (companyId: string, role?: string) => {
  trackEvent('team_user_added', {
    company_id: companyId,
    role: role,
    kpi_category: 'Team Access',
    kpi_name: 'Team Adoption',
  })
}

export const trackTeamAccessChange = (companyId: string, changeType?: string) => {
  trackEvent('team_access_change', {
    company_id: companyId,
    change_type: changeType,
    kpi_category: 'Team Access',
    kpi_name: 'Team Adoption',
  })
}

export const trackCAAdded = (companyId: string) => {
  trackEvent('ca_added', {
    company_id: companyId,
    kpi_category: 'Team Access',
    kpi_name: 'Team Adoption',
  })
}

export const trackEmailSent = (companyId?: string, recipientCount?: number) => {
  trackEvent('email_sent', {
    company_id: companyId,
    recipient_count: recipientCount,
    kpi_category: 'Team Access',
    kpi_name: 'Cont',
  })
}

// Track Document Vault (for Document Vault KPIs)
export const trackVaultFileUpload = (companyId?: string, fileType?: string) => {
  trackEvent('vault_file_upload', {
    company_id: companyId,
    file_type: fileType,
    kpi_category: 'Document Vault',
    kpi_name: 'Usage',
  })
}

export const trackVaultFileExport = (companyId?: string, fileType?: string) => {
  trackEvent('vault_file_export', {
    company_id: companyId,
    file_type: fileType,
    kpi_category: 'Document Vault',
    kpi_name: 'Usage',
  })
}

export const trackVaultFileShare = (companyId?: string) => {
  trackEvent('vault_file_share', {
    company_id: companyId,
    kpi_category: 'Document Vault',
    kpi_name: 'Usage',
  })
}

export const trackNoteUsage = (companyId?: string, action: 'create' | 'view' | 'update' = 'view') => {
  trackEvent('note_usage', {
    company_id: companyId,
    action: action,
    kpi_category: 'Document Vault',
    kpi_name: 'Password Usage',
  })
}

// Track Reminders (for Reminders KPIs)
export const trackNotificationEmailOpen = (notificationId?: string, companyId?: string) => {
  trackEvent('notification_email_open', {
    notification_id: notificationId,
    company_id: companyId,
    kpi_category: 'Reminders',
    kpi_name: 'Email Responsiveness',
  })
}

export const trackNotificationClick = (notificationId?: string, companyId?: string, source?: 'email' | 'app') => {
  trackEvent('notification_click', {
    notification_id: notificationId,
    company_id: companyId,
    source: source,
    kpi_category: 'Reminders',
    kpi_name: 'Email Responsiveness',
  })
}

// Track session time (for Time KPI)
export const trackSessionTime = (timeInSeconds: number, companyId?: string) => {
  trackEvent('session_time', {
    time_seconds: timeInSeconds,
    company_id: companyId,
    kpi_category: 'General',
    kpi_name: 'Time',
  })
}

// Track onboarding completion (for Onboarding KPI)
export const trackOnboardingComplete = (companyId: string, peopleCount?: number) => {
  trackEvent('onboarding_complete', {
    company_id: companyId,
    people_count: peopleCount,
    kpi_category: 'General',
    kpi_name: 'Onboarding',
  })
}

// Track CIN retrieval (for CIN Retrieval Accuracy KPI)
export const trackCINRetrieval = (success: boolean, companyId?: string, errorType?: string) => {
  trackEvent('cin_retrieval', {
    success: success,
    company_id: companyId,
    error_type: errorType,
    kpi_category: 'General',
    kpi_name: 'CIN Retrieval Accuracy',
  })
}

// Track value saved (for Value KPI)
export const trackValueSaved = (value: number, companyId?: string, notificationId?: string) => {
  trackEvent('value_saved', {
    value: value,
    currency: 'INR',
    company_id: companyId,
    notification_id: notificationId,
    kpi_category: 'General',
    kpi_name: 'Value',
  })
}

// Track NPS/Happiness (for Happiness KPI)
export const trackNPS = (score: number, companyId?: string) => {
  trackEvent('nps_score', {
    score: score,
    company_id: companyId,
    kpi_category: 'General',
    kpi_name: 'Happiness',
  })
}

// Track system error/crash (for Reliability KPI)
export const trackSystemError = (errorType: string, severity: 'low' | 'medium' | 'high' | 'critical', companyId?: string) => {
  trackEvent('system_error', {
    error_type: errorType,
    severity: severity,
    company_id: companyId,
    kpi_category: 'General',
    kpi_name: 'Reliability',
  })
}

// Track user churn/ghosting (for Churn KPI)
export const trackUserActivity = (userId: string, companyId?: string, weekNumber?: number) => {
  trackEvent('user_activity', {
    user_id: userId,
    company_id: companyId,
    week_number: weekNumber,
    kpi_category: 'General',
    kpi_name: 'Churn (Ghosting)',
  })
}
