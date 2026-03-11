import { SupabaseMiddlewareAuthCheck } from '@/infrastructure/auth/supabase/SupabaseMiddlewareAuthCheck'
import { PassportMiddlewareAuthCheck } from '@/infrastructure/auth/passport/PassportMiddlewareAuthCheck'
import { NextResponse, type NextRequest } from 'next/server'

// Composition: swap this to change auth provider for middleware
// Choose based on AUTH_PROVIDER env var (default to Supabase for backward compatibility)
const authProvider = process.env.AUTH_PROVIDER || 'supabase'
const authCheck =
  authProvider === 'passport'
    ? new PassportMiddlewareAuthCheck()
    : new SupabaseMiddlewareAuthCheck()

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isServerAction = request.method === 'POST' && request.headers.has('next-action')

  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    console.log('[PROXY] Processing request:', { pathname, method: request.method })
  }

  // Public routes that should be accessible without authentication
  const publicRoutes = ['/home', '/privacy-policy', '/terms-of-service', '/pricing', '/contact', '/login', '/compliance-tracker', '/company-onboarding', '/customers', '/auth/reset-password']

  if (
    pathname === '/' ||
    isServerAction ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp)$/) ||
    publicRoutes.includes(pathname)
  ) {
    // Server actions perform their own auth checks, so avoid duplicate middleware auth.
    return NextResponse.next({ request })
  }

  // Use the abstract auth check — no direct Supabase coupling here
  const { result, response } = await authCheck.check(request)

  if (isDev && result.authenticated) {
    console.log('[PROXY] Auth check result:', {
      pathname,
      hasUser: true,
      userId: result.userId,
    })
  }

  // Protect routes that require authentication
  if (!result.authenticated) {
    if (pathname === '/subscribe') {
      if (isDev) console.log('[PROXY] No user, redirecting /subscribe to /login')
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    if (isDev) console.log('[PROXY] No user, redirecting to /home')
    const url = request.nextUrl.clone()
    url.pathname = '/home'
    return NextResponse.redirect(url)
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
