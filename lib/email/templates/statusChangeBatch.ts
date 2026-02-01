import { emailLayout, primaryButton, sectionHeader } from '@/lib/email/templates/layout'
import { getSiteUrl } from '@/lib/email/resend'
import { getUnsubscribeUrl, getEmailPreferencesUrl } from '@/lib/email/unsubscribe'

export type StatusChangeItem = {
  requirementId: string
  requirementName: string
  companyName: string
  dueDate?: string | null
  oldStatus: string
  newStatus: string
}

export type StatusChangeBatchEmailArgs = {
  recipientUserId: string
  recipientName?: string | null
  items: StatusChangeItem[]
}

/**
 * Render a batched status change email (multiple changes in one email)
 */
export function renderStatusChangeBatchEmail(args: StatusChangeBatchEmailArgs): { subject: string; html: string } {
  const siteUrl = getSiteUrl()
  const count = args.items.length
  
  // Generate subject based on count
  const subject = count === 1
    ? `Status updated: ${args.items[0].requirementName}`
    : `${count} compliance items updated`

  // Group items by status
  const completed = args.items.filter(i => i.newStatus === 'completed')
  const pending = args.items.filter(i => i.newStatus === 'pending')
  const overdue = args.items.filter(i => i.newStatus === 'overdue')
  const other = args.items.filter(i => !['completed', 'pending', 'overdue'].includes(i.newStatus))

  const greeting = args.recipientName 
    ? `<div style="font-size:13px;line-height:20px;color:#374151;">Hi ${args.recipientName},</div>`
    : ''

  const intro = count === 1
    ? `<div style="font-size:13px;line-height:20px;color:#374151;margin-top:${args.recipientName ? '8px' : '0'};">A compliance item was updated:</div>`
    : `<div style="font-size:13px;line-height:20px;color:#374151;margin-top:${args.recipientName ? '8px' : '0'};">${count} compliance items were updated in the last few minutes:</div>`

  // Build sections
  let sectionsHtml = ''
  
  if (completed.length > 0) {
    sectionsHtml += renderSection('Completed', completed, '#059669')
  }
  if (pending.length > 0) {
    sectionsHtml += renderSection('Pending', pending, '#D97706')
  }
  if (overdue.length > 0) {
    sectionsHtml += renderSection('Overdue', overdue, '#DC2626')
  }
  if (other.length > 0) {
    sectionsHtml += renderSection('Updated', other, '#6B7280')
  }

  const bodyHtml = `
${greeting}
${intro}
${sectionsHtml}
${primaryButton(`${siteUrl}/data-room`, 'View All Compliances')}
`.trim()

  const html = emailLayout({
    title: count === 1 ? 'Status Update' : 'Status Updates',
    preheader: subject,
    bodyHtml,
    preferencesUrl: getEmailPreferencesUrl(),
    unsubscribeUrl: getUnsubscribeUrl(args.recipientUserId, 'status_changes'),
  })

  return { subject, html }
}

function renderSection(title: string, items: StatusChangeItem[], accentColor: string): string {
  const border = '#E5E7EB'
  
  const rows = items.slice(0, 15).map((item, idx) => {
    const statusBadge = getStatusBadge(item.newStatus)
    const dueInfo = item.dueDate ? ` • Due: ${item.dueDate}` : ''
    
    return `
    <tr>
      <td style="padding:12px 14px;${idx > 0 ? `border-top:1px solid ${border};` : ''}">
        <div style="font-size:12px;line-height:18px;color:#111827;font-weight:700;">${item.requirementName}</div>
        <div style="font-size:12px;line-height:18px;color:#6B7280;margin-top:2px;">
          ${item.companyName}${dueInfo}
        </div>
        <div style="font-size:11px;line-height:16px;color:#9CA3AF;margin-top:4px;">
          ${item.oldStatus} → ${statusBadge}
        </div>
      </td>
    </tr>
  `
  }).join('')

  const moreCount = items.length - 15
  const moreHtml = moreCount > 0 
    ? `<div style="font-size:12px;line-height:18px;color:#6B7280;margin-top:8px;padding-left:14px;">+${moreCount} more...</div>` 
    : ''

  return `
<div style="margin-top:16px;">
  <div style="font-size:13px;line-height:20px;font-weight:700;margin-bottom:8px;">
    <span style="color:${accentColor};">●</span>
    <span style="color:#111827;margin-left:6px;">${title}</span>
    <span style="color:#6B7280;font-weight:600;margin-left:4px;">(${items.length})</span>
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${border};border-radius:10px;border-collapse:separate;overflow:hidden;">
    ${rows}
  </table>
  ${moreHtml}
</div>
`.trim()
}

function getStatusBadge(status: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    completed: { bg: '#D1FAE5', text: '#059669' },
    pending: { bg: '#FEF3C7', text: '#D97706' },
    overdue: { bg: '#FEE2E2', text: '#DC2626' },
    not_started: { bg: '#F3F4F6', text: '#6B7280' },
    upcoming: { bg: '#DBEAFE', text: '#2563EB' },
  }
  
  const { bg, text } = colors[status] || colors.not_started
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  
  return `<span style="display:inline-block;background:${bg};color:${text};font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase;">${label}</span>`
}
