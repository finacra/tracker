/**
 * API endpoint to get current Passport session
 * Used by PassportClientAuthAdapter
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/passport-session'

export async function GET() {
  try {
    const session = await getSession()

    return NextResponse.json({
      session: session
        ? {
            appUserId: session.appUserId,
            email: session.email,
            googleId: session.googleId,
          }
        : null,
    })
  } catch (error) {
    console.error('[Passport Session API] Error:', error)
    return NextResponse.json({ session: null }, { status: 500 })
  }
}
