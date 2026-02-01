import { emailLayout, primaryButton } from '@/lib/email/templates/layout'
import { getSiteUrl } from '@/lib/email/resend'
import { getUnsubscribeUrl, getEmailPreferencesUrl } from '@/lib/email/unsubscribe'

export type ReminderDigestSection = {
  title: string
  items: Array<{
    companyName: string
    requirementName: string
    dueDate: string
    status: string
  }>
}

export type ReminderDigestEmailArgs = {
  recipientUserId: string
  asOfDate: string
  recipientName?: string | null
  sections: ReminderDigestSection[]
}

function renderList(items: ReminderDigestSection['items']): string {
  const border = '#E5E7EB'
  return `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${border};border-radius:12px;border-collapse:separate;overflow:hidden;margin-top:10px;">
  ${items
    .map(
      (i, idx) => `
    <tr>
      <td style="padding:12px 14px;${idx > 0 ? `border-top:1px solid ${border};` : ''}">
        <div style="font-size:12px;line-height:18px;color:#111827;font-weight:700;">${i.requirementName}</div>
        <div style="font-size:12px;line-height:18px;color:#6B7280;margin-top:2px;">
          ${i.companyName} • Due: ${i.dueDate} • Status: ${i.status}
        </div>
      </td>
    </tr>
  `,
    )
    .join('')}
</table>
`.trim()
}

export function renderReminderDigestEmail(args: ReminderDigestEmailArgs): { subject: string; html: string } {
  const siteUrl = getSiteUrl()
  const subject = `Compliance reminders — ${args.asOfDate}`

  const sectionsHtml =
    args.sections.length === 0
      ? `<div style="font-size:13px;line-height:20px;color:#374151;">No reminders for today.</div>`
      : args.sections
          .filter((s) => s.items.length > 0)
          .map((s) => {
            const count = s.items.length
            return `
              <div style="margin-top:16px;">
                <div style="font-size:13px;line-height:20px;color:#111827;font-weight:700;">${s.title} <span style="color:#6B7280;font-weight:600;">(${count})</span></div>
                ${renderList(s.items.slice(0, 20))}
                ${
                  s.items.length > 20
                    ? `<div style="font-size:12px;line-height:18px;color:#6B7280;margin-top:8px;">Showing 20 of ${s.items.length} items.</div>`
                    : ''
                }
              </div>
            `
          })
          .join('')

  const intro = args.recipientName
    ? `<div style="font-size:13px;line-height:20px;color:#374151;">Hi ${args.recipientName}, here are your compliance reminders.</div>`
    : `<div style="font-size:13px;line-height:20px;color:#374151;">Here are your compliance reminders.</div>`

  const bodyHtml = `
${intro}
${sectionsHtml}
${primaryButton(`${siteUrl}/data-room`, 'Open Tracker')}
`.trim()

  const html = emailLayout({
    title: 'Compliance reminders',
    preheader: subject,
    bodyHtml,
    preferencesUrl: getEmailPreferencesUrl(),
    unsubscribeUrl: getUnsubscribeUrl(args.recipientUserId, 'reminders'),
  })

  return { subject, html }
}
