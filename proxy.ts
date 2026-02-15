import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  })

  // Skip auth check for static files, API routes, and auth routes
  const pathname = request.nextUrl.pathname
  
  console.log('[PROXY] Processing request:', {
    pathname,
    method: request.method,
    url: request.url,
  })
  
  // Public routes that should be accessible without authentication
  const publicRoutes = ['/home', '/privacy-policy', '/terms-of-service', '/pricing', '/contact']
  
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp)$/) ||
    publicRoutes.includes(pathname)
  ) {
    console.log('[PROXY] Skipping auth check for:', pathname)
    return response
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Set cookies efficiently - only update if changed
          cookiesToSet.forEach(({ name, value, options }) => {
            const existingCookie = request.cookies.get(name)
            // Only set if value changed to prevent unnecessary cookie updates
            if (!existingCookie || existingCookie.value !== value) {
              request.cookies.set(name, value)
              response.cookies.set(name, value, {
                ...options,
                // Optimize cookie settings
                path: options?.path ?? '/',
                sameSite: options?.sameSite ?? 'lax',
                httpOnly: options?.httpOnly ?? true,
                secure: options?.secure ?? process.env.NODE_ENV === 'production',
              })
            }
          })
        },
      },
    }
  )

  // Check auth once for all routes
  const {
    data: { user },
  } = await supabase.auth.getUser()

  console.log('[PROXY] Auth check result:', {
    pathname,
    hasUser: !!user,
    userId: user?.id,
  })

  // Protect routes that require authentication
  if (!user && pathname !== '/') {
    console.log('[PROXY] No user, redirecting to /')
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // Don't redirect /admin routes - allow them through
  if (user && pathname.startsWith('/admin')) {
    console.log('[PROXY] Admin route detected, allowing through:', pathname)
    return response
  }

  // Redirect authenticated users away from login page
  if (user && pathname === '/') {
    console.log('[PROXY] User on root path, checking companies...')
    // Check if user has companies (owned or via user_roles)
    const { data: ownedCompanies } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
    
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('company_id')
      .eq('user_id', user.id)
      .not('company_id', 'is', null)
      .limit(1)
    
    const hasCompanies = (ownedCompanies && ownedCompanies.length > 0) || (userRoles && userRoles.length > 0)
    
    console.log('[PROXY] Company check result:', {
      hasCompanies,
      ownedCount: ownedCompanies?.length || 0,
      rolesCount: userRoles?.length || 0,
    })
    
    const url = request.nextUrl.clone()
    if (hasCompanies) {
      url.pathname = '/data-room'
      console.log('[PROXY] Redirecting to /data-room')
    } else {
      url.pathname = '/onboarding'
      console.log('[PROXY] Redirecting to /onboarding')
    }
    return NextResponse.redirect(url)
  }

  console.log('[PROXY] Allowing request through:', pathname)
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
