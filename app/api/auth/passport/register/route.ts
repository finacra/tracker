import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { setSessionInResponse } from '@/lib/auth/passport-session'
import type { PassportSessionUser } from '@/lib/auth/passport-config'
import { sendVerificationEmail } from '@/lib/email/verification'
import { handleAPIError } from '@/lib/errors/handle-error'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // 1. Check if user already exists
    const normalizedEmail = email.trim().toLowerCase()
    const existingUser = await prisma.appUser.findFirst({
      where: {
        primary_email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
      include: {
        authIdentities: true,
      },
    })

    if (existingUser && (existingUser as any).password_hash) {
      return NextResponse.json({ 
        error: 'This email is already registered. Please sign in instead.' 
      }, { status: 400 })
    }

    // Check if user exists with Google OAuth (no password)
    if (existingUser && !(existingUser as any).password_hash) {
      // Check if they have Google OAuth
      const hasGoogleAuth = existingUser.authIdentities.some(
        (identity) => identity.provider === 'passport' && 
                     identity.legacy_auth_id && 
                     identity.legacy_auth_id !== ''
      )

      if (hasGoogleAuth) {
        // Account exists with Google. Auto-fire the verification email
        // immediately so the user sees one clear "check your inbox"
        // message instead of having to click a separate "Send
        // Verification Email" button on the login page. The email links
        // to /api/auth/verify-email?token=… which routes to
        // /auth/link-password when the user has Google-but-no-password.
        sendVerificationEmail(
          existingUser.id,
          existingUser.primary_email,
          existingUser.full_name,
        ).catch((err) => {
          console.error('[Passport Register] Failed to send linking email:', err)
        })

        return NextResponse.json({
          success: false,
          requiresLinking: true,
          emailSent: true,
          message:
            "This email is registered with Google. We've sent you a verification email — click the link to set a password.",
          userId: existingUser.id,
        }, { status: 200 }) // 200 because this is a valid response, not an error
      }
    }

    let user;

    if (existingUser) {
      // User exists (legacy account) but has no password
      // Update them with a password
      const salt = await bcrypt.genSalt(10)
      const hash = await bcrypt.hash(password, salt)
      
      user = await prisma.appUser.update({
        where: { id: existingUser.id },
        data: { password_hash: hash } as any
      })
    } else {
      // 2. Create new user
      const salt = await bcrypt.genSalt(10)
      const hash = await bcrypt.hash(password, salt)

      user = await prisma.appUser.create({
        data: {
          primary_email: email.trim(),
          password_hash: hash,
        } as any,
      })
    }

    // 3. Send verification email (don't wait for it to complete)
    sendVerificationEmail(user.id, user.primary_email, user.full_name).catch((error) => {
      console.error('[Passport Register] Failed to send verification email:', error)
      // Don't fail registration if email fails - user can request resend later
    })

    // 4. Create session
    const sessionUser: PassportSessionUser = {
      appUserId: user.id,
      email: user.primary_email,
      googleId: '',
      // Fresh email/password signup — verification email just sent,
      // claim starts false. The proxy will keep redirecting them to
      // /verify-email until they click the link, at which point a fresh
      // session (carrying emailVerified=true) is minted.
      emailVerified: false,
    }

    const response = NextResponse.json({ 
      success: true, 
      user: {
        id: user.id,
        email: user.primary_email,
        emailVerified: false // User needs to verify email
      },
      message: 'Registration successful. Please check your email to verify your account.'
    })

    await setSessionInResponse(sessionUser, response)

    return response
  } catch (error) {
    return handleAPIError(error)
  }
}
