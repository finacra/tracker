import { NextRequest, NextResponse } from 'next/server'
import { getPassport } from '@/lib/auth/passport-config'
import { setSessionInResponse } from '@/lib/auth/passport-session'
import type { PassportSessionUser } from '@/lib/auth/passport-config'
import { prisma } from '@/lib/prisma'
import { handleAPIError } from '@/lib/errors/handle-error'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const passport = getPassport()

    // Using a promise-based wrapper for passport.authenticate local
    const loginUser = () => 
      new Promise<PassportSessionUser | false>((resolve, reject) => {
        // Mock a request object for passport (it expects express-like req/res)
        const mockReq: any = {
          body: { email, password },
          query: {},
        }
        
        passport.authenticate('local', { session: false }, (err: any, user: PassportSessionUser | false, info: any) => {
          if (err) reject(err)
          else if (!user) resolve(false)
          else resolve(user)
        })(mockReq, {}, (err: any) => {
          if (err) reject(err)
        })
      })

    const user = await loginUser()

    if (!user) {
      // Before returning a generic "Invalid email or password", check if
      // the address belongs to a Google-only account (no password yet).
      // Without this, a user who signed up with Google then forgot and
      // tried email/password login would just get "Invalid" with no
      // clue. Detecting it lets us route them through the linking flow
      // — same shape register/route.ts returns.
      try {
        const normalizedEmail = email.trim().toLowerCase()
        const existingUser = await prisma.appUser.findFirst({
          where: {
            primary_email: { equals: normalizedEmail, mode: 'insensitive' },
          },
          include: { authIdentities: true },
        })

        const hasGoogleAuth = existingUser?.authIdentities?.some(
          (identity) =>
            identity.provider === 'passport' &&
            identity.legacy_auth_id &&
            identity.legacy_auth_id !== '',
        )
        const hasPassword = existingUser && (existingUser as any).password_hash

        if (existingUser && hasGoogleAuth && !hasPassword) {
          // Auto-fire the linking verification email so the user sees a
          // single "check your inbox" message rather than having to
          // click another button on the login page.
          const { sendVerificationEmail } = await import('@/lib/email/verification')
          sendVerificationEmail(
            existingUser.id,
            existingUser.primary_email,
            existingUser.full_name,
          ).catch((err) => {
            console.error('[Passport Login] Failed to send linking email:', err)
          })

          return NextResponse.json(
            {
              success: false,
              requiresLinking: true,
              userId: existingUser.id,
              message:
                "This email is registered with Google. We've sent you a verification email — click the link to set a password.",
            },
            { status: 200 },
          )
        }
      } catch (lookupErr) {
        console.error('[Passport Login] Account-linking lookup failed:', lookupErr)
        // Fall through to generic error — don't leak existence on lookup failure.
      }

      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Check email verification status (but don't block login)
    let emailVerified = false
    try {
      const appUser = await prisma.appUser.findUnique({
        where: { id: user.appUserId },
        select: { email_verified: true },
      })
      emailVerified = appUser?.email_verified || false
    } catch (error) {
      console.error('[Passport Login] Error checking email verification:', error)
      // Don't fail login if we can't check verification status
    }

    // Success! Create an encrypted session cookie
    // Users can login even if email isn't verified, but we'll inform them
    const response = NextResponse.json({ 
      success: true, 
      user: {
        id: user.appUserId,
        email: user.email,
        emailVerified
      },
      ...(emailVerified ? {} : { 
        message: 'Please verify your email address to access all features.',
        requiresVerification: true 
      })
    })

    await setSessionInResponse(user, response)

    return response
  } catch (error) {
    return handleAPIError(error)
  }
}
