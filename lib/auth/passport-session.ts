/**
 * Passport session management for Next.js App Router
 * Handles session storage in encrypted cookies
 */

import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { PassportSessionUser } from './passport-config'

const SESSION_COOKIE_NAME = 'passport_session'

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required but not set')
}
const SESSION_SECRET = process.env.SESSION_SECRET

/**
 * Create a session token from user data
 */
export async function createSession(user: PassportSessionUser): Promise<string> {
  const secret = new TextEncoder().encode(SESSION_SECRET)
  const token = await new SignJWT({
    appUserId: user.appUserId,
    email: user.email,
    googleId: user.googleId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d') // 7 days session
    .sign(secret)

  return token
}

/**
 * Verify and decode session token
 */
export async function verifySession(token: string): Promise<PassportSessionUser | null> {
  try {
    const secret = new TextEncoder().encode(SESSION_SECRET)
    const { payload } = await jwtVerify(token, secret)

    return {
      appUserId: payload.appUserId as string,
      email: payload.email as string,
      googleId: payload.googleId as string,
    }
  } catch (error) {
    return null
  }
}

/**
 * Get session from cookies
 */
export async function getSession(): Promise<PassportSessionUser | null> {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (!sessionToken) {
    return null
  }

  return verifySession(sessionToken)
}

/**
 * Set session in cookies
 * Can be used in Server Components/Actions or Route Handlers
 */
export async function setSession(user: PassportSessionUser): Promise<void> {
  const cookieStore = await cookies()
  const token = await createSession(user)

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })
}

/**
 * Set session in cookies (for Route Handlers - returns Response with Set-Cookie header)
 */
export async function setSessionInResponse(
  user: PassportSessionUser,
  response: NextResponse
): Promise<NextResponse> {
  const token = await createSession(user)
  
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })
  
  return response
}

/**
 * Mark the user's session as email-verified in a cookie cache so the
 * proxy middleware (proxy.ts) doesn't have to hit Postgres for this
 * status on every request.
 *
 * Performance: Vercel iad1 ↔ Supabase ap-south-1 ≈ 250 ms RTT. Without
 * this cache, the middleware ran a raw SQL query on app_users every
 * time `email_verified` cookies weren't yet set — i.e., on the very
 * first request after every login / OAuth callback / link-password,
 * and on every subsequent redirect (signup → /subscribe → /onboarding
 * → /data-room) until proxy.ts itself populated them retroactively.
 *
 * Set this proactively at every session-creation site where we already
 * know the user is verified (Google OAuth, post-link-password, login
 * for verified accounts). For unverified users we deliberately leave
 * the cookies unset — middleware will re-check on each request, which
 * is the correct behavior since we want to detect when they verify.
 *
 * 30-day TTL matches proxy.ts's existing cookie expectation.
 */
const VERIFIED_COOKIE = 'email_verified'
const VERIFIED_USER_COOKIE = 'email_verified_user_id'

export function setVerificationCookiesInResponse(
  response: NextResponse,
  options: { userId: string; verified: boolean },
): NextResponse {
  // Only positively cache `verified=true`. Leaving the cookie unset for
  // unverified users keeps the middleware honest — it must re-check
  // every request until they actually verify.
  if (!options.verified) {
    response.cookies.delete(VERIFIED_COOKIE)
    response.cookies.delete(VERIFIED_USER_COOKIE)
    return response
  }
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  }
  response.cookies.set(VERIFIED_COOKIE, 'true', opts)
  response.cookies.set(VERIFIED_USER_COOKIE, options.userId, opts)
  return response
}

export async function setVerificationCookies(options: {
  userId: string
  verified: boolean
}): Promise<void> {
  const cookieStore = await cookies()
  if (!options.verified) {
    cookieStore.delete(VERIFIED_COOKIE)
    cookieStore.delete(VERIFIED_USER_COOKIE)
    return
  }
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  }
  cookieStore.set(VERIFIED_COOKIE, 'true', opts)
  cookieStore.set(VERIFIED_USER_COOKIE, options.userId, opts)
}

/**
 * Clear session from cookies
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
  cookieStore.delete(VERIFIED_COOKIE)
  cookieStore.delete(VERIFIED_USER_COOKIE)
}

/**
 * Clear session from cookies (for Route Handlers)
 */
export function clearSessionInResponse(response: NextResponse): NextResponse {
  response.cookies.delete(SESSION_COOKIE_NAME)
  response.cookies.delete(VERIFIED_COOKIE)
  response.cookies.delete(VERIFIED_USER_COOKIE)
  return response
}
