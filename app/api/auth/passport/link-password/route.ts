import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { verifyEmailToken } from '@/lib/email/verification'
import { setSessionInResponse, setVerificationCookiesInResponse } from '@/lib/auth/passport-session'
import type { PassportSessionUser } from '@/lib/auth/passport-config'
import { handleAPIError } from '@/lib/errors/handle-error'

/**
 * Link password to existing Google OAuth account
 * POST /api/auth/passport/link-password
 * Body: { token: string, password: string }
 * 
 * Flow:
 * 1. Verify email token (proves email ownership)
 * 2. Check if user exists and has Google OAuth but no password
 * 3. Add password to account
 * 4. Create session
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, password } = body

    if (!token || !password) {
      return NextResponse.json({ 
        error: 'Verification token and password are required' 
      }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ 
        error: 'Password must be at least 6 characters' 
      }, { status: 400 })
    }

    // 1. Verify email token (this proves email ownership)
    const verificationResult = await verifyEmailToken(token)

    if (!verificationResult.success || !verificationResult.userId) {
      return NextResponse.json({ 
        error: verificationResult.error || 'Invalid or expired verification token' 
      }, { status: 400 })
    }

    const userId = verificationResult.userId

    // 2. Get user and check they have Google OAuth but no password
    const user = await prisma.appUser.findUnique({
      where: { id: userId },
      include: {
        authIdentities: true,
      },
    })

    if (!user) {
      return NextResponse.json({ 
        error: 'User not found' 
      }, { status: 404 })
    }

    // Check if password already exists
    if ((user as any).password_hash) {
      return NextResponse.json({ 
        error: 'This account already has a password. Please sign in instead.' 
      }, { status: 400 })
    }

    // Check if they have Google OAuth
    const hasGoogleAuth = user.authIdentities.some(
      (identity) => identity.provider === 'passport' && 
                   identity.legacy_auth_id && 
                   identity.legacy_auth_id !== ''
    )

    if (!hasGoogleAuth) {
      return NextResponse.json({ 
        error: 'This account does not have Google authentication. Please use regular sign up.' 
      }, { status: 400 })
    }

    // 3. Add password to account
    const salt = await bcrypt.genSalt(10)
    const hash = await bcrypt.hash(password, salt)

    const updatedUser = await prisma.appUser.update({
      where: { id: user.id },
      data: { password_hash: hash } as any
    })

    // 4. Create session. verifyEmailToken flipped email_verified=true on
    // app_users, so mint the JWT with the matching claim — proxy
    // middleware skips the DB gating query on every subsequent request.
    const sessionUser: PassportSessionUser = {
      appUserId: updatedUser.id,
      email: updatedUser.primary_email,
      googleId: '',
      emailVerified: true,
    }

    const response = NextResponse.json({ 
      success: true, 
      user: {
        id: updatedUser.id,
        email: updatedUser.primary_email,
        emailVerified: true, // Email is verified since we verified the token
      },
      message: 'Password linked successfully. You can now sign in with email and password.'
    })

    await setSessionInResponse(sessionUser, response)
    // verifyEmailToken set email_verified=true on app_users; mirror
    // that into the proxy middleware's cookie cache so the redirect
    // after this response doesn't pay the ~250 ms DB lookup.
    setVerificationCookiesInResponse(response, {
      userId: updatedUser.id,
      verified: true,
    })

    return response
  } catch (error) {
    return handleAPIError(error)
  }
}
