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
