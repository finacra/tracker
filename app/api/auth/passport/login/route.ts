import { NextRequest, NextResponse } from 'next/server'
import { getPassport } from '@/lib/auth/passport-config'
import { setSessionInResponse } from '@/lib/auth/passport-session'
import type { PassportSessionUser } from '@/lib/auth/passport-config'

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

    // Success! Create an encrypted session cookie
    const response = NextResponse.json({ 
      success: true, 
      user: {
        id: user.appUserId,
        email: user.email
      }
    })

    await setSessionInResponse(user, response)

    return response
  } catch (error: any) {
    console.error('[Passport Login API] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
