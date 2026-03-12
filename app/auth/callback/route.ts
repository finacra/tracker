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
  
  // Handle Passport callback if code is present
  if (code) {
    // Use Next.js cookies helper for better cookie handling
    const cookieStore = await cookies()
    const storedState = cookieStore.get('passport_oauth_state')?.value
    const redirectTo = cookieStore.get('passport_redirect_to')?.value || null
    
    // Import Passport callback handler logic
    const { handlePassportCallback } = await import('@/lib/auth/passport-callback-handler')
    return handlePassportCallback(request, code, explicitNext, storedState, redirectTo)
  }
  
  console.error('[AUTH CALLBACK] No code provided')
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
