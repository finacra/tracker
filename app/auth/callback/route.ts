import { NextRequest, NextResponse } from 'next/server'
import { GetRootDestination } from '@/application/use-cases/navigation/GetRootDestination'
import { resolvePostAuthRedirect } from '@/application/use-cases/navigation/resolvePostAuthRedirect'
import { createClient } from '@/utils/supabase/server'
import { trackLogin } from '@/lib/tracking/kpi-tracker'
import { createServerContainer } from '@/lib/composition/server-container'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const explicitNext = searchParams.get('next')
  
  // Check which auth provider is configured
  const authProvider = process.env.AUTH_PROVIDER || 'supabase'
  
  // If Passport is configured, handle Passport callback
  if (authProvider === 'passport' && code) {
    // Use Next.js cookies helper for better cookie handling
    const cookieStore = await cookies()
    const state = searchParams.get('state')
    const storedState = cookieStore.get('passport_oauth_state')?.value
    const redirectTo = cookieStore.get('passport_redirect_to')?.value || null
    
    // Import Passport callback handler logic
    const { handlePassportCallback } = await import('@/lib/auth/passport-callback-handler')
    return handlePassportCallback(request, code, explicitNext, storedState, redirectTo)
  }
  
  // Supabase callback handling (existing logic)
  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('Code exchange error:', error)
      return NextResponse.redirect(`${origin}/auth/auth-code-error`)
    }
    
    if (data.session) {
      const { authService, companyRepository, subscriptionService } =
        createServerContainer()
      const useCase = new GetRootDestination(
        authService,
        companyRepository,
        subscriptionService
      )
      const next = resolvePostAuthRedirect({
        baseDestination: await useCase.executeForUser(data.session.user.id),
        overridePath: explicitNext,
        allowOverrideForDataRoomUsers: false,
      })
      
      // Create redirect response
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'
      
      let redirectUrl: string
      if (isLocalEnv) {
        redirectUrl = `${origin}${next}`
      } else if (forwardedHost) {
        redirectUrl = `https://${forwardedHost}${next}`
      } else {
        redirectUrl = `${origin}${next}`
      }
      
      console.log(`[AUTH CALLBACK] User ${data.session.user.id} redirecting to: ${next}`)
      
      // Track login
      await trackLogin(data.session.user.id)
      
      // Create redirect response - cookies are already set by Supabase client
      const redirectResponse = NextResponse.redirect(redirectUrl)
      
      return redirectResponse
    }
  }
  
  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
