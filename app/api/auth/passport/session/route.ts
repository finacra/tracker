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
    const userExists = await prisma.appUser.findUnique({
      where: { id: session.appUserId },
      select: { id: true },
    })
    console.log('[SESSION] DB check →', userExists ? 'EXISTS' : 'NOT FOUND')

    if (!userExists) {
      console.log('[SESSION] Clearing stale cookie for deleted user:', session.appUserId)
      await clearSession()
      return NextResponse.json({ session: null })
    }

    return NextResponse.json({
      session: {
        appUserId: session.appUserId,
        email: session.email,
        googleId: session.googleId,
      },
    })
  } catch (error) {
    console.error('[Passport Session API] Error:', error)
    return NextResponse.json({ session: null }, { status: 500 })
  }
}
