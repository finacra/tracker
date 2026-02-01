import { Resend } from 'resend'

export type SendEmailArgs = {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
}

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY')
  }
  return new Resend(apiKey)
}

export function getResendFrom(): string {
  const from = process.env.RESEND_FROM
  if (!from) {
    throw new Error('Missing RESEND_FROM (must be a verified sender in Resend)')
  }
  return from
}

export function getSiteUrl(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (siteUrl && siteUrl.startsWith('http')) return siteUrl.replace(/\/+$/, '')
  // Safe fallback for local dev
  return 'http://localhost:3000'
}

export async function sendEmail(args: SendEmailArgs) {
  const resend = getResendClient()
  const from = getResendFrom()

  return await resend.emails.send({
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    replyTo: args.replyTo,
  })
}

