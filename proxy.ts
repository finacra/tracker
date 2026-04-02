import { PassportMiddlewareAuthCheck } from '@/infrastructure/auth/passport/PassportMiddlewareAuthCheck'
import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'

// Use Passport authentication (Supabase auth removed)
const authCheck = new PassportMiddlewareAuthCheck()

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isServerAction = request.method === 'POST' && request.headers.has('next-action')

  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    console.log('[PROXY] Processing request:', { pathname, method: request.method })
  }

  // Public routes that should be accessible without authentication
  const publicRoutes = ['/home', '/privacy-policy', '/terms-of-service', '/pricing', '/contact', '/login', '/compliance-tracker', '/company-onboarding', '/customers', '/auth/reset-password', '/forgot-password', '/verify-email', '/invite/accept']

  if (
    pathname === '/' ||
    isServerAction ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/invite') || // Allow all invite routes (for invitation acceptance)
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp)$/) ||
    publicRoutes.includes(pathname)
  ) {
    // Server actions perform their own auth checks, so avoid duplicate middleware auth.
    if (isDev && pathname.startsWith('/invite')) {
      console.log('[PROXY] Allowing invite route:', pathname)
    }
    return NextResponse.next({ request })
  }

  // Use the abstract auth check — no direct Supabase coupling here
  const { result, response } = await authCheck.check(request)

  // Protect routes that require authentication
  if (!result.authenticated) {
    const target = pathname === '/subscribe' ? '/login' : '/home'
    const url = request.nextUrl.clone()
    url.pathname = target
    return NextResponse.redirect(url)
  }

  // Check email verification for email/password users (not Google OAuth)
  // Exclude error/info pages and subscription pages that users might be redirected to
  const excludedFromVerificationCheck = [
    '/verify-email',
    '/owner-subscription-expired',
    '/subscription-required',
    '/subscribe', // Allow unverified users to see subscription page
  ]
  
  if (result.authenticated && result.userId && !excludedFromVerificationCheck.includes(pathname)) {
    // Check if we've already verified this session (cached in cookie)
    const verificationCookie = request.cookies.get('email_verified')
    const cachedVerificationStatus = verificationCookie?.value === 'true'
    const cachedUserId = request.cookies.get('email_verified_user_id')?.value

    // If we have a cached verification status for this user, skip the check
    if (cachedVerificationStatus && cachedUserId === result.userId) {
      // User is verified, allow access
      return response
    }

    try {
      // Check if user has password_hash (email/password auth) and email verification status
      // Also check if user has Google OAuth (no password_hash but has auth_identity with Google)
      const user = await prisma.$queryRaw<Array<{
        email_verified: boolean | null
        has_password: boolean
        has_google_auth: boolean
        primary_email: string
      }>>`
        SELECT 
          au.email_verified,
          (au.password_hash IS NOT NULL AND au.password_hash != '') as has_password,
          EXISTS(
            SELECT 1 FROM public.auth_identities ai
            WHERE ai.app_user_id = au.id
            AND ai.provider = 'passport'
            AND ai.legacy_auth_id IS NOT NULL
            AND ai.legacy_auth_id != ''
            AND au.password_hash IS NULL
          ) as has_google_auth,
          au.primary_email
        FROM public.app_users au
        WHERE au.id = ${result.userId}::uuid
        LIMIT 1
      `

      if (user && user.length > 0) {
        const userData = user[0]
        const isEmailPasswordUser = userData.has_password
        const isGoogleOAuthUser = userData.has_google_auth && !userData.has_password
        const isEmailVerified = userData.email_verified === true

        // Google OAuth users: Skip verification check (emails are verified by Google)
        if (isGoogleOAuthUser) {
          // Set cookie to skip future checks for this user
          const nextResponse = response as NextResponse
          nextResponse.cookies.set('email_verified', 'true', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30, // 30 days
          })
          nextResponse.cookies.set('email_verified_user_id', result.userId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30, // 30 days
          })
          return nextResponse
        }

        // Email/password users: Check verification
        if (isEmailPasswordUser) {
          if (isEmailVerified) {
            // Email is verified - cache it to skip future checks
            const nextResponse = response as NextResponse
            nextResponse.cookies.set('email_verified', 'true', {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 60 * 60 * 24 * 30, // 30 days
            })
            nextResponse.cookies.set('email_verified_user_id', result.userId, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 60 * 60 * 24 * 30, // 30 days
            })
            return nextResponse
          } else {
            // Email not verified - redirect to verify-email
            if (isDev) {
              console.log('[PROXY] Email not verified, redirecting to /verify-email', {
                userId: result.userId,
                email: userData.primary_email,
              })
            }
            const url = request.nextUrl.clone()
            url.pathname = '/verify-email'
            return NextResponse.redirect(url)
          }
        }
      }
    } catch (error) {
      console.error('[PROXY] Error checking email verification:', error)
    }
  }

  // Don't redirect /admin routes - allow them through
  if (result.authenticated && pathname.startsWith('/admin')) {
    return response
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
