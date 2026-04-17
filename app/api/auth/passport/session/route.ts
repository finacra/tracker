/**
 * API endpoint to get current Passport session
 * Used by PassportClientAuthAdapter
 */

import { NextResponse } from 'next/server'
import { getSession, clearSession } from '@/lib/auth/passport-session'
import { prisma } from '@/lib/prisma'
import { handleAPIError } from '@/lib/errors/handle-error'

export async function GET() {
  try {
    const session = await getSession()

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
    } catch (dbErr) {
      console.error('[SESSION] DB check FAILED:', dbErr instanceof Error ? dbErr.message : dbErr)
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
      try { await clearSession() } catch (e) { console.error('[SESSION] clearSession failed:', e) }
      const resp = NextResponse.json({ session: null })
      resp.cookies.delete('passport_session')
      return resp
    }

    return NextResponse.json({
      session: {
        appUserId: session.appUserId,
        email: session.email,
        googleId: session.googleId,
      },
    })
  } catch (error) {
    return handleAPIError(error)
  }
}
