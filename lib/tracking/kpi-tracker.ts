// KPI Tracking Utility
// This module provides functions to track KPI metrics throughout the application

import { recordKPIMetric } from '@/app/admin/tracking/actions'

/**
 * Track a KPI metric
 * @param kpiName - Name of the KPI (must match KPI_DATA)
 * @param category - Category of the KPI (must match KPI_DATA)
 * @param metricValue - Numeric value to record
 * @param userId - Optional user ID
 * @param companyId - Optional company ID
 * @param metricData - Optional additional data as JSON
 */
export async function trackKPI(
  kpiName: string,
  category: string,
  metricValue: number,
  userId?: string,
  companyId?: string,
  metricData?: Record<string, any>
) {
  try {
    await recordKPIMetric(kpiName, category, metricValue, userId, companyId, metricData)
  } catch (error) {
    console.error('Error tracking KPI:', error)
    // Don't throw - tracking failures shouldn't break the app
  }
}

// Convenience functions for common KPIs

/**
 * Track user login (Addictiveness KPI)
 */
export async function trackLogin(userId: string) {
  await trackKPI('Addictiveness', 'General', 1, userId, undefined, { action: 'login' })
}

/**
 * Track tracker tab opened (Tracker Usage KPI)
 */
export async function trackTrackerTabOpened(userId: string, companyId: string) {
  await trackKPI('Tracker Usage', 'Compliance Tracker', 1, userId, companyId, { action: 'tab_opened' })
}

/**
 * Track status change (Tracker Usage KPI)
 */
export async function trackStatusChange(userId: string, companyId: string, requirementId: string, oldStatus: string, newStatus: string) {
  await trackKPI('Tracker Usage', 'Compliance Tracker', 1, userId, companyId, {
    action: 'status_changed',
    requirement_id: requirementId,
    old_status: oldStatus,
    new_status: newStatus,
  })
}

/**
 * Track calendar sync (Calendar Usage KPI)
 */
export async function trackCalendarSync(userId: string, companyId: string) {
  await trackKPI('Calendar Usage', 'Compliance Tracker', 1, userId, companyId, { action: 'calendar_sync' })
}

/**
 * Track document upload (Document Upload KPI)
 */
export async function trackDocumentUpload(userId: string, companyId: string, documentType: string) {
  await trackKPI('Document Upload', 'Compliance Tracker', 1, userId, companyId, {
    action: 'document_uploaded',
    document_type: documentType,
  })
}

/**
 * Track company edit (Numbers of times "Edit Company" KPI)
 */
export async function trackCompanyEdit(userId: string, companyId: string) {
  await trackKPI('Numbers of times "Edit Company"', 'Company Overview', 1, userId, companyId, { action: 'company_edited' })
}

/**
 * Track DSC export (Function KPI)
 */
export async function trackDSCExport(userId: string, companyId: string) {
  await trackKPI('Function', 'DSC Management', 1, userId, companyId, { action: 'dsc_exported' })
}

/**
 * Track notification click (Notifications KPI)
 */
export async function trackNotificationClick(userId: string, companyId: string, notificationType: string) {
  await trackKPI('Notifications', 'DSC Management', 1, userId, companyId, {
    action: 'notification_clicked',
    notification_type: notificationType,
  })
}

/**
 * Track report download (Retention KPI)
 */
export async function trackReportDownload(userId: string, companyId: string, reportType: string) {
  await trackKPI('Retention', 'Reports', 1, userId, companyId, {
    action: 'report_downloaded',
    report_type: reportType,
  })
}

/**
 * Track team member added (Team Adoption KPI)
 */
export async function trackTeamMemberAdded(addedByUserId: string, companyId: string, role: string) {
  await trackKPI('Team Adoption', 'Team Access', 1, addedByUserId, companyId, {
    action: 'team_member_added',
    role: role,
  })
}

/**
 * Track vault file upload (Usage KPI)
 */
export async function trackVaultFileUpload(userId: string, companyId: string, fileType: string) {
  await trackKPI('Usage', 'Document Vault', 1, userId, companyId, {
    action: 'file_uploaded',
    file_type: fileType,
  })
}

/**
 * Track vault file export (Usage KPI)
 */
export async function trackVaultFileExport(userId: string, companyId: string, fileCount: number) {
  await trackKPI('Usage', 'Document Vault', fileCount, userId, companyId, {
    action: 'files_exported',
    file_count: fileCount,
  })
}

/**
 * Track note usage (Password Usage KPI)
 */
export async function trackNoteUsage(userId: string, companyId: string, action: 'created' | 'viewed' | 'updated') {
  await trackKPI('Password Usage', 'Document Vault', 1, userId, companyId, {
    action: `note_${action}`,
  })
}

/**
 * Track email notification open (Email Responsiveness KPI)
 */
export async function trackEmailOpen(userId: string, companyId: string, notificationType: string) {
  await trackKPI('Email Responsiveness', 'Reminders', 1, userId, companyId, {
    action: 'email_opened',
    notification_type: notificationType,
  })
}

/**
 * Track time spent on page (Time KPI)
 */
export async function trackTimeOnPage(userId: string, companyId: string | undefined, page: string, timeInSeconds: number) {
  await trackKPI('Time', 'General', timeInSeconds, userId, companyId, {
    action: 'time_on_page',
    page: page,
  })
}
