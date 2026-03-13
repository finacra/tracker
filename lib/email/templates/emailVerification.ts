import { emailLayout, primaryButton } from '@/lib/email/templates/layout'
import { getSiteUrl } from '@/lib/email/resend'

export type EmailVerificationEmailArgs = {
  recipientEmail: string
  recipientName?: string | null
  verificationUrl: string
}

export function renderEmailVerificationEmail(args: EmailVerificationEmailArgs): { subject: string; html: string } {
  const subject = 'Verify your email address - Finacra'

  const bodyHtml = `
<div style="font-size:13px;line-height:20px;color:#374151;">
  Welcome to Finacra! Please verify your email address to complete your registration.
</div>

<div style="font-size:13px;line-height:20px;color:#374151;margin-top:14px;">
  Click the button below to verify your email address:
</div>

${primaryButton(args.verificationUrl, 'Verify Email Address')}

<div style="font-size:12px;line-height:18px;color:#6B7280;margin-top:14px;">
  If the button doesn't work, copy and paste this URL into your browser:
  <div style="word-break:break-all;color:#111827;margin-top:6px;">${args.verificationUrl}</div>
</div>

<div style="font-size:12px;line-height:18px;color:#6B7280;margin-top:16px;padding-top:16px;border-top:1px solid #E5E7EB;">
  <strong>Note:</strong> This verification link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
</div>
`.trim()

  const html = emailLayout({
    title: 'Verify your email address',
    preheader: subject,
    bodyHtml,
  })

  return { subject, html }
}

/**
 * Generate email verification URL
 */
export function getEmailVerificationUrl(token: string): string {
  const siteUrl = getSiteUrl()
  return `${siteUrl}/verify-email?token=${encodeURIComponent(token)}`
}
