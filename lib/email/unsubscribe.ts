import { createHmac } from 'crypto'

const SECRET = process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret'

export type UnsubscribeType = 'status_changes' | 'reminders' | 'team_updates' | 'all'

/**
 * Generate a signed unsubscribe token for a user + type
 * Format: base64(userId:type:signature)
 */
export function generateUnsubscribeToken(userId: string, type: UnsubscribeType): string {
  const payload = `${userId}:${type}`
  const signature = createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 16)
  const token = Buffer.from(`${payload}:${signature}`).toString('base64url')
  return token
}

/**
 * Verify and decode an unsubscribe token
 * Returns null if invalid
 */
export function verifyUnsubscribeToken(token: string): { userId: string; type: UnsubscribeType } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const parts = decoded.split(':')
    if (parts.length !== 3) return null

    const [userId, type, signature] = parts
    const expectedPayload = `${userId}:${type}`
    const expectedSignature = createHmac('sha256', SECRET).update(expectedPayload).digest('hex').slice(0, 16)

    if (signature !== expectedSignature) return null
    if (!['status_changes', 'reminders', 'team_updates', 'all'].includes(type)) return null

    return { userId, type: type as UnsubscribeType }
  } catch {
    return null
  }
}

/**
 * Generate unsubscribe URL for email footer
 */
export function getUnsubscribeUrl(userId: string, type: UnsubscribeType): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const token = generateUnsubscribeToken(userId, type)
  return `${siteUrl.replace(/\/+$/, '')}/api/unsubscribe?token=${token}`
}

/**
 * Generate email preferences URL
 */
export function getEmailPreferencesUrl(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return `${siteUrl.replace(/\/+$/, '')}/settings/email-preferences`
}
