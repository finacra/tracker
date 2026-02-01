import { emailLayout, kvRow, primaryButton } from '@/lib/email/templates/layout'
import { getSiteUrl } from '@/lib/email/resend'
import { getUnsubscribeUrl, getEmailPreferencesUrl } from '@/lib/email/unsubscribe'

export type StatusChangeEmailArgs = {
  recipientUserId: string
  companyName: string
  requirementName: string
  dueDate?: string | null
  oldStatus: string
  newStatus: string
}

export function renderStatusChangeEmail(args: StatusChangeEmailArgs): { subject: string; html: string } {
  const siteUrl = getSiteUrl()

  const subject =
    args.newStatus === 'completed'
      ? `Completed: ${args.requirementName}`
      : `Compliance status updated: ${args.requirementName}`

  const bodyHtml = `
<div style="font-size:13px;line-height:20px;color:#374151;">
  A compliance item was updated in <strong>${args.companyName}</strong>.
</div>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:14px;border-collapse:collapse;">
  ${kvRow('Requirement', args.requirementName)}
  ${kvRow('Company', args.companyName)}
  ${kvRow('Due date', args.dueDate ? args.dueDate : '—')}
  ${kvRow('Old status', args.oldStatus)}
  ${kvRow('New status', args.newStatus)}
</table>

${primaryButton(`${siteUrl}/data-room`, 'Open Tracker')}
`.trim()

  const html = emailLayout({
    title: 'Status change',
    preheader: subject,
    bodyHtml,
    preferencesUrl: getEmailPreferencesUrl(),
    unsubscribeUrl: getUnsubscribeUrl(args.recipientUserId, 'status_changes'),
  })

  return { subject, html }
}
