import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPasswordResetEmail } from '@/lib/email/password-reset'
import { handleAPIError } from '@/lib/errors/handle-error'

/**
 * Request password reset
 * POST /api/auth/passport/forgot-password
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email } = body

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Find user by email
    const user = await prisma.appUser.findFirst({
      where: {
        primary_email: {
          equals: email.trim(),
          mode: 'insensitive',
        },
        password_hash: {
          not: null,
        },
      },
      select: {
        id: true,
        primary_email: true,
        full_name: true,
      },
    })

    // Always return success (don't reveal if email exists)
    // This prevents email enumeration attacks
    if (user) {
      // Send reset email (don't wait for it to complete)
      sendPasswordResetEmail(user.id, user.primary_email, user.full_name).catch((error) => {
        console.error('[Forgot Password] Failed to send reset email:', error)
        // Don't fail the request if email fails
      })
    }

    return NextResponse.json({
      success: true,
      message: 'If an account with that email exists, we\'ve sent a password reset link.',
    })
  } catch (error) {
    return handleAPIError(error)
  }
}
