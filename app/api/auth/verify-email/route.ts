import { NextRequest, NextResponse } from 'next/server'
import { verifyEmailToken, resendVerificationEmail } from '@/lib/email/verification'
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

    const result = await verifyEmailToken(token)

    if (!result.success) {
      // Return JSON error instead of redirecting - let client handle it
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    // Check if this is a password linking verification (check if user has Google OAuth but no password)
    const user = await prisma.appUser.findUnique({
      where: { id: result.userId },
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

    // If user has Google OAuth but no password, redirect to password linking page
    const needsPasswordLinking = hasGoogleAuth && !hasPassword

    // Check if request wants JSON (from client-side fetch) or redirect (from email link)
    const acceptHeader = request.headers.get('accept') || ''
    const wantsJson = acceptHeader.includes('application/json')

    // Create response
    let response: NextResponse
    if (wantsJson) {
      // Client-side fetch - return JSON
      response = NextResponse.json({
        success: true,
        email: result.email,
        message: 'Email verified successfully',
        needsPasswordLinking,
      })
    } else {
      // Direct link click from email - redirect appropriately
      const origin = new URL(request.url).origin
      if (needsPasswordLinking) {
        // Redirect to password linking page with token
        response = NextResponse.redirect(
          new URL(`/auth/link-password?token=${encodeURIComponent(token)}`, origin)
        )
      } else {
        // Regular verification - redirect to success page
        response = NextResponse.redirect(
          new URL(`/verify-email?success=true&email=${encodeURIComponent(result.email || '')}`, origin)
        )
      }
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
