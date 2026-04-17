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
 * Verify email using token
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
      verified_at: Date | null
    }>>`
      SELECT user_id, email, expires_at, verified_at
      FROM public.email_verification_tokens
      WHERE token = ${token}
      LIMIT 1
    `

    if (!result || result.length === 0) {
      return { success: false, error: 'Invalid verification token' }
    }

    const tokenRecord = result[0]

    // Check if already verified
    if (tokenRecord.verified_at) {
      return { success: false, error: 'This verification link has already been used' }
    }

    // Check if expired
    if (new Date(tokenRecord.expires_at) < new Date()) {
      return { success: false, error: 'Verification link has expired. Please request a new one.' }
    }

    // Mark token as verified
    await prisma.$executeRaw`
      UPDATE public.email_verification_tokens
      SET verified_at = NOW()
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
