/**
 * API endpoint to get current Passport session
 * Used by PassportClientAuthAdapter
 */

import { NextResponse } from 'next/server'
import { getSession, clearSession } from '@/lib/auth/passport-session'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getSession()
    console.log('[SESSION] getSession →', session ? `uid:${session.appUserId} email:${session.email}` : 'null')

    if (!session) {
      return NextResponse.json({ session: null })
    }

    // Verify user still exists in DB (handles DB wipe / deleted users)
    let userExists = false
    try {
      const row = await prisma.appUser.findUnique({
        where: { id: session.appUserId },
        select: { id: true },
      })
      userExists = !!row
      console.log('[SESSION] DB check →', userExists ? 'EXISTS' : 'NOT FOUND', 'for', session.appUserId)
    } catch (dbErr: any) {
      console.error('[SESSION] DB check FAILED:', dbErr.message || dbErr)
      // If DB check fails, still return the session (fail-open)
      return NextResponse.json({
        session: {
          appUserId: session.appUserId,
          email: session.email,
          googleId: session.googleId,
        },
      })
    }

    if (!userExists) {
      console.log('[SESSION] Clearing stale cookie for deleted user:', session.appUserId)
      try { await clearSession() } catch (e) { console.error('[SESSION] clearSession failed:', e) }
      const resp = NextResponse.json({ session: null })
      resp.cookies.delete('passport_session')
      return resp
    }

    console.log('[SESSION] Returning valid session for', session.appUserId)
    return NextResponse.json({
      session: {
        appUserId: session.appUserId,
        email: session.email,
        googleId: session.googleId,
      },
    })
  } catch (error: any) {
    console.error('[SESSION] Fatal error:', error.message || error)
    return NextResponse.json({ session: null }, { status: 500 })
  }
}
