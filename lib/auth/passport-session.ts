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
 * Clear session from cookies
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
}

/**
 * Clear session from cookies (for Route Handlers)
 */
export function clearSessionInResponse(response: NextResponse): NextResponse {
  response.cookies.delete(SESSION_COOKIE_NAME)
  return response
}
