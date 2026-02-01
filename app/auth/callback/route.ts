import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const explicitNext = searchParams.get('next')
  
  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('Code exchange error:', error)
      return NextResponse.redirect(`${origin}/auth/auth-code-error`)
    }
    
    if (data.session) {
      // Check if user has companies (owned or via user_roles)
      const { data: ownedCompanies } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', data.session.user.id)
        .limit(1)
      
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', data.session.user.id)
        .not('company_id', 'is', null)
        .limit(1)
      
      const hasCompanies = (ownedCompanies && ownedCompanies.length > 0) || (userRoles && userRoles.length > 0)
      
      // Determine redirect destination based on whether user has companies
      let next = hasCompanies ? '/data-room' : '/onboarding'
      
      // If "next" is explicitly provided in params, honor invite-accept flows even for existing users.
      if (explicitNext && explicitNext.startsWith('/')) {
        const isInviteAccept =
          explicitNext.startsWith('/invite/accept') ||
          explicitNext.includes('/invite/accept') ||
          explicitNext.includes('token=')

        if (isInviteAccept) {
          next = explicitNext
        } else if (!hasCompanies) {
          // Only use explicit next if user doesn't have companies (to allow onboarding for new companies)
          next = explicitNext
        }
      }
      
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
      
      console.log(`[AUTH CALLBACK] User ${data.session.user.id} has companies: ${hasCompanies}, redirecting to: ${next}`)
      
      // Create redirect response - cookies are already set by Supabase client
      const redirectResponse = NextResponse.redirect(redirectUrl)
      
      return redirectResponse
    }
  }
  
  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
