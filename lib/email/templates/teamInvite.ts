import { emailLayout, primaryButton, kvRow } from '@/lib/email/templates/layout'
import { getEmailPreferencesUrl } from '@/lib/email/unsubscribe'

export type TeamInviteEmailArgs = {
  companyName: string
  inviterEmail?: string | null
  role: string
  actionUrl: string
  recipientEmail: string
}

export function renderTeamInviteEmail(args: TeamInviteEmailArgs): { subject: string; html: string } {
  const subject = `You've been invited to ${args.companyName} on Finacra`

  const bodyHtml = `
<div style="font-size:13px;line-height:20px;color:#374151;">
  You've been invited to collaborate on <strong>${args.companyName}</strong>.
</div>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:14px;border-collapse:collapse;">
  ${kvRow('Company', args.companyName)}
  ${kvRow('Role', args.role)}
  ${kvRow('Invited as', args.recipientEmail)}
  ${kvRow('Invited by', args.inviterEmail || '—')}
</table>

${primaryButton(args.actionUrl, 'Accept invitation')}

<div style="font-size:12px;line-height:18px;color:#6B7280;margin-top:14px;">
  If the button doesn't work, copy and paste this URL into your browser:
  <div style="word-break:break-all;color:#111827;margin-top:6px;">${args.actionUrl}</div>
</div>
`.trim()

  // Team invites don't have unsubscribe (transactional, one-time)
  // but we still show the preferences link
  const html = emailLayout({
    title: 'Team invitation',
    preheader: subject,
    bodyHtml,
    preferencesUrl: getEmailPreferencesUrl(),
  })

  return { subject, html }
}
