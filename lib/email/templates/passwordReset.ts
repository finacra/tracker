import { emailLayout, primaryButton } from './layout'
import { getSiteUrl } from '../resend'

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export type PasswordResetEmailArgs = {
  recipientEmail: string
  recipientName: string | null
  resetUrl: string
}

export function renderPasswordResetEmail(args: PasswordResetEmailArgs): { subject: string; html: string } {
  const { recipientEmail, recipientName, resetUrl } = args
  const displayName = recipientName || recipientEmail.split('@')[0]

  const subject = 'Reset Your Password - Finacra'

  const html = emailLayout({
    title: 'Reset Your Password',
    preheader: 'Click the link below to reset your password',
    bodyHtml: `
      <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 22px;">
        Hi ${escapeHtml(displayName)},
      </p>
      <p style="margin: 0 0 24px 0; color: #374151; font-size: 15px; line-height: 22px;">
        We received a request to reset your password. Click the button below to create a new password:
      </p>
      <div style="margin: 32px 0;">
        ${primaryButton(resetUrl, 'Reset Password')}
      </div>
      <p style="margin: 24px 0 0 0; color: #6B7280; font-size: 14px; line-height: 20px;">
        If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
      </p>
      <p style="margin: 16px 0 0 0; color: #6B7280; font-size: 13px; line-height: 18px;">
        This link will expire in 1 hour for security reasons.
      </p>
    `,
  })

  return { subject, html }
}
