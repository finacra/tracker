/**
 * Passport Google OAuth initiation endpoint
 * Redirects user to Google OAuth login
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPassport } from '@/lib/auth/passport-config'

export async function GET(request: NextRequest) {
  try {
    const passport = getPassport()
    const { searchParams } = new URL(request.url)
    // Don't default to '/home' - let GetRootDestination determine the correct destination
    const redirectTo = searchParams.get('redirectTo') || null

    // For Next.js, we need to manually construct the OAuth URL
    // Passport's authenticate() middleware doesn't work directly in App Router
    const clientId = process.env.GOOGLE_CLIENT_ID
    const callbackUrl = process.env.NEXT_PUBLIC_PASSPORT_CALLBACK_URL || 'http://localhost:3000/auth/callback'
    const origin = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || 'http://localhost:3000'
    const fullCallbackUrl = `${origin}${callbackUrl.replace(/^https?:\/\/[^/]+/, '')}`

    // Generate state for CSRF protection
    const state = Buffer.from(JSON.stringify({ redirectTo })).toString('base64url')

    // Construct Google OAuth URL
    const params = new URLSearchParams({
      client_id: clientId!,
      redirect_uri: fullCallbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state: state,
      access_type: 'offline',
      prompt: 'consent',
    })

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

    // Create redirect response and set cookies on it
    const response = NextResponse.redirect(googleAuthUrl)
    
    // Store redirect destination in cookie only if explicitly provided
    // If null, GetRootDestination will determine the correct destination
    if (redirectTo) {
      response.cookies.set('passport_redirect_to', redirectTo, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
        path: '/',
      })
    }
    
    response.cookies.set('passport_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[Passport] Google OAuth initiation error:', error)
    return NextResponse.redirect(new URL('/login?error=oauth_init_failed', request.url))
  }
}
