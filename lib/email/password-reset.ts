import { prisma } from '@/lib/prisma'
import { sendEmail } from './resend'
import { renderPasswordResetEmail } from './templates/passwordReset'
import { getSiteUrl } from './resend'
import crypto from 'crypto'

/**
 * Generate a secure password reset token
 */
function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  userId: string,
  email: string,
  fullName: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    // Generate reset token
    const token = generateResetToken()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 1) // Token expires in 1 hour

    // Store token in database
    await prisma.$executeRaw`
      INSERT INTO public.password_reset_tokens (user_id, email, token, expires_at)
      VALUES (${userId}::uuid, ${email}, ${token}, ${expiresAt}::timestamptz)
      ON CONFLICT (user_id) DO UPDATE
      SET token = ${token}, expires_at = ${expiresAt}::timestamptz, created_at = NOW()
    `

    // Generate reset URL
    const siteUrl = getSiteUrl()
    const resetUrl = `${siteUrl}/auth/reset-password?token=${token}`

    // Render email
    const { subject, html } = renderPasswordResetEmail({
      recipientEmail: email,
      recipientName: fullName,
      resetUrl,
    })

    // Send email
    await sendEmail({
      to: email,
      subject,
      html,
    })

    return { success: true }
  } catch (error: any) {
    console.error('[Password Reset] Error sending reset email:', error)
    return { success: false, error: error.message || 'Failed to send password reset email' }
  }
}

/**
 * Verify password reset token
 */
export async function verifyPasswordResetToken(
  token: string
): Promise<{ success: boolean; userId?: string; email?: string; error?: string }> {
  try {
    const result = await prisma.$queryRaw<Array<{
      user_id: string
      email: string
      expires_at: Date
    }>>`
      SELECT user_id, email, expires_at
      FROM public.password_reset_tokens
      WHERE token = ${token}
      AND expires_at > NOW()
      LIMIT 1
    `

    if (!result || result.length === 0) {
      return { success: false, error: 'Invalid or expired reset token' }
    }

    const tokenRecord = result[0]

    return {
      success: true,
      userId: tokenRecord.user_id,
      email: tokenRecord.email,
    }
  } catch (error: any) {
    console.error('[Password Reset] Error verifying token:', error)
    return { success: false, error: error.message || 'Failed to verify reset token' }
  }
}

/**
 * Reset password using token
 */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify token
    const tokenVerification = await verifyPasswordResetToken(token)
    if (!tokenVerification.success || !tokenVerification.userId) {
      return { success: false, error: tokenVerification.error || 'Invalid token' }
    }

    // Hash new password
    const bcrypt = await import('bcryptjs')
    const salt = await bcrypt.genSalt(10)
    const hash = await bcrypt.hash(newPassword, salt)

    // Update password
    await prisma.$executeRaw`
      UPDATE public.app_users
      SET password_hash = ${hash}, updated_at = NOW()
      WHERE id = ${tokenVerification.userId}::uuid
    `

    // Delete used token
    await prisma.$executeRaw`
      DELETE FROM public.password_reset_tokens
      WHERE token = ${token}
    `

    return { success: true }
  } catch (error: any) {
    console.error('[Password Reset] Error resetting password:', error)
    return { success: false, error: error.message || 'Failed to reset password' }
  }
}
