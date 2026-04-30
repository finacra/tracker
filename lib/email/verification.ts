import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/resend'
import { renderEmailVerificationEmail, getEmailVerificationUrl } from '@/lib/email/templates/emailVerification'

/**
 * Generate a secure random token for email verification
 */
export function generateVerificationToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Create and send email verification token
 */
export async function sendVerificationEmail(
  userId: string,
  email: string,
  recipientName?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    // Generate token
    const token = generateVerificationToken()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24) // Token expires in 24 hours

    // Store token in database
    await prisma.$executeRaw`
      INSERT INTO public.email_verification_tokens (user_id, token, email, expires_at)
      VALUES (${userId}::uuid, ${token}, ${email}, ${expiresAt})
      ON CONFLICT DO NOTHING
    `

    // Generate verification URL
    const verificationUrl = getEmailVerificationUrl(token)

    // Render email
    const { subject, html } = renderEmailVerificationEmail({
      recipientEmail: email,
      recipientName: recipientName || null,
      verificationUrl,
    })

    // Send email
    await sendEmail({
      to: email,
      subject,
      html,
    })

    return { success: true }
  } catch (error) {
    console.error('[Email Verification] Error sending verification email:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to send verification email' }
  }
}

/**
 * Look up a verification token WITHOUT consuming it.
 *
 * Used by the verify-email GET endpoint to inspect what kind of flow
 * is needed (regular email-verify vs. Google-only-no-password linking)
 * before deciding whether to consume the token. The link-password
 * POST endpoint re-validates the same token to complete linking, so
 * the GET must not delete it on the way through.
 */
export async function peekVerificationToken(token: string): Promise<{
  success: boolean
  userId?: string
  email?: string
  error?: string
}> {
  try {
    const result = await prisma.$queryRaw<Array<{
      user_id: string
      email: string
      expires_at: Date
    }>>`
      SELECT user_id, email, expires_at
      FROM public.email_verification_tokens
      WHERE token = ${token}
      LIMIT 1
    `
    if (!result || result.length === 0) {
      return { success: false, error: 'Invalid or already-used verification token' }
    }
    const r = result[0]
    if (new Date(r.expires_at) < new Date()) {
      // Drop expired row so the table doesn't accumulate dead tokens.
      await prisma.$executeRaw`
        DELETE FROM public.email_verification_tokens
        WHERE token = ${token}
      `
      return { success: false, error: 'Verification link has expired. Please request a new one.' }
    }
    return { success: true, userId: r.user_id, email: r.email }
  } catch (error) {
    console.error('[Email Verification] peek error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to verify token' }
  }
}

/**
 * Verify email using token (consuming).
 *
 * Single-use semantics: the token row is DELETED on successful
 * verification rather than marked with a `verified_at` timestamp.
 * The Prisma schema for EmailVerificationToken doesn't include a
 * `verified_at` column, and earlier code that referenced it crashed
 * with `column "verified_at" does not exist` on production. Delete-
 * after-use achieves the same single-use guarantee — the second
 * attempt fails with "Invalid verification token" because the row
 * is gone — without requiring a schema change.
 */
export async function verifyEmailToken(token: string): Promise<{
  success: boolean
  userId?: string
  email?: string
  error?: string
}> {
  try {
    // Find token in database
    const result = await prisma.$queryRaw<Array<{
      user_id: string
      email: string
      expires_at: Date
    }>>`
      SELECT user_id, email, expires_at
      FROM public.email_verification_tokens
      WHERE token = ${token}
      LIMIT 1
    `

    if (!result || result.length === 0) {
      return { success: false, error: 'Invalid or already-used verification token' }
    }

    const tokenRecord = result[0]

    // Check if expired
    if (new Date(tokenRecord.expires_at) < new Date()) {
      // Drop the expired row so the table doesn't accumulate dead tokens.
      await prisma.$executeRaw`
        DELETE FROM public.email_verification_tokens
        WHERE token = ${token}
      `
      return { success: false, error: 'Verification link has expired. Please request a new one.' }
    }

    // Single-use: delete the token now so it can't be replayed. Keep
    // this BEFORE the user update so a partial success on the first
    // call still invalidates the token for the second.
    await prisma.$executeRaw`
      DELETE FROM public.email_verification_tokens
      WHERE token = ${token}
    `

    // Update user's email_verified status
    await prisma.$executeRaw`
      UPDATE public.app_users
      SET email_verified = TRUE, email_verified_at = NOW()
      WHERE id = ${tokenRecord.user_id}::uuid
    `

    // Note: The proxy middleware will cache this status in a cookie on the next request
    // No need to set cookie here as it's handled by the middleware

    return {
      success: true,
      userId: tokenRecord.user_id,
      email: tokenRecord.email,
    }
  } catch (error) {
    console.error('[Email Verification] Error verifying token:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to verify email' }
  }
}

/**
 * Resend verification email
 */
export async function resendVerificationEmail(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get user info
    const user = await prisma.appUser.findUnique({
      where: { id: userId },
      select: { id: true, primary_email: true, full_name: true, email_verified: true },
    })

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    if (user.email_verified) {
      return { success: false, error: 'Email is already verified' }
    }

    // Send verification email
    return await sendVerificationEmail(user.id, user.primary_email, user.full_name)
  } catch (error) {
    console.error('[Email Verification] Error resending verification email:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to resend verification email' }
  }
}
