/**
 * API endpoint to logout (clear Passport session)
 */

import { NextResponse } from 'next/server'
import { clearSession } from '@/lib/auth/passport-session'

export async function POST() {
  try {
    await clearSession()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Passport Logout API] Error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
