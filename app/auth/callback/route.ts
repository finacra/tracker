import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  let next = searchParams.get('next') ?? '/onboarding'
  if (!next.startsWith('/')) {
    // if "next" is not a relative URL, use the default
    next = '/onboarding'
  }
  
  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('Code exchange error:', error)
      return NextResponse.redirect(`${origin}/auth/auth-code-error`)
    }
    
    if (data.session) {
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
      
      // Create redirect response - cookies are already set by Supabase client
      const redirectResponse = NextResponse.redirect(redirectUrl)
      
      return redirectResponse
    }
  }
  
  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
