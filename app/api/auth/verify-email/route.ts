import { NextRequest, NextResponse } from 'next/server'
import { verifyEmailToken, peekVerificationToken, resendVerificationEmail } from '@/lib/email/verification'
import { prisma } from '@/lib/prisma'
import { handleAPIError } from '@/lib/errors/handle-error'

/**
 * Email verification endpoint
 * GET /api/auth/verify-email?token=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Verification token is required' },
        { status: 400 }
      )
    }

    // Peek (non-consuming) so we can decide what to do BEFORE deleting
    // the token. If we consumed here and then redirected to
    // /auth/link-password, the link-password POST would have nothing
    // left to validate — it'd reject as "already used", the user would
    // navigate back to /login, the linking flow would re-detect the
    // Google-only-no-password state, and they'd be stuck in a loop.
    const peek = await peekVerificationToken(token)
    if (!peek.success) {
      return NextResponse.json(
        { success: false, error: peek.error },
        { status: 400 }
      )
    }

    // Check if this is a password linking verification (user has Google OAuth but no password)
    const user = await prisma.appUser.findUnique({
      where: { id: peek.userId },
      include: {
        authIdentities: true,
      },
    })

    const hasGoogleAuth = user?.authIdentities.some(
      (identity) => identity.provider === 'passport' &&
                   identity.legacy_auth_id &&
                   identity.legacy_auth_id !== ''
    )
    const hasPassword = user && (user as any).password_hash

    // If user has Google OAuth but no password, redirect to password
    // linking page WITHOUT consuming the token — link-password POST
    // will consume it when the user submits the form. The user's
    // email_verified flag is also set there (verifyEmailToken sets it).
    const needsPasswordLinking = hasGoogleAuth && !hasPassword

    // Check if request wants JSON (from client-side fetch) or redirect (from email link)
    const acceptHeader = request.headers.get('accept') || ''
    const wantsJson = acceptHeader.includes('application/json')

    // Create response
    let response: NextResponse
    if (needsPasswordLinking) {
      // Don't consume the token here — link-password endpoint will.
      const origin = new URL(request.url).origin
      response = wantsJson
        ? NextResponse.json({
            success: true,
            email: peek.email,
            message: 'Verification confirmed — set your password to finish linking',
            needsPasswordLinking: true,
          })
        : NextResponse.redirect(
            new URL(`/auth/link-password?token=${encodeURIComponent(token)}`, origin)
          )
    } else {
      // Regular verification — consume the token now (DELETEs row +
      // marks user.email_verified=true).
      const consumed = await verifyEmailToken(token)
      if (!consumed.success) {
        return NextResponse.json(
          { success: false, error: consumed.error },
          { status: 400 }
        )
      }
      const origin = new URL(request.url).origin
      response = wantsJson
        ? NextResponse.json({
            success: true,
            email: consumed.email,
            message: 'Email verified successfully',
            needsPasswordLinking: false,
          })
        : NextResponse.redirect(
            new URL(`/verify-email?success=true&email=${encodeURIComponent(consumed.email || '')}`, origin)
          )
    }

    // Clear verification cache cookie so next request will check fresh status
    // The proxy will set a new cookie with verified=true on the next request
    response.cookies.delete('email_verified')
    response.cookies.delete('email_verified_user_id')

    return response
  } catch (error) {
    return handleAPIError(error)
  }
}

/**
 * Resend verification email
 * POST /api/auth/verify-email
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      )
    }

    const result = await resendVerificationEmail(userId)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Verification email sent successfully',
    })
  } catch (error) {
    return handleAPIError(error)
  }
}
