/**
 * Passport OAuth callback handler
 * Processes OAuth callback and creates/updates user session
 */

import { NextRequest, NextResponse } from 'next/server'
import { setSessionInResponse } from './passport-session'
import { createServerContainer } from '@/lib/composition/server-container'
import { GetRootDestination } from '@/application/use-cases/navigation/GetRootDestination'
import { resolvePostAuthRedirect } from '@/application/use-cases/navigation/resolvePostAuthRedirect'
import { trackLogin } from '@/lib/tracking/kpi-tracker'

export async function handlePassportCallback(
  request: Request,
  code: string,
  explicitNext: string | null,
  storedState?: string,
  redirectTo?: string | null
): Promise<NextResponse> {
  try {
    const { origin, searchParams } = new URL(request.url)
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    // Handle OAuth errors
    if (error) {
      console.error('[Passport] OAuth error:', error)
      return NextResponse.redirect(new URL('/login?error=oauth_failed', origin))
    }

    // If storedState wasn't passed in, try to get it from cookies as fallback
    let actualStoredState = storedState
    if (!actualStoredState) {
      // Fallback: Get cookies from request headers - improved parsing
      const cookieHeader = request.headers.get('cookie') || ''
      const cookies = new Map<string, string>()
      cookieHeader.split(';').forEach((cookie) => {
        const trimmed = cookie.trim()
        const equalIndex = trimmed.indexOf('=')
        if (equalIndex > 0) {
          const name = trimmed.substring(0, equalIndex).trim()
          const value = decodeURIComponent(trimmed.substring(equalIndex + 1).trim())
          if (name && value) {
            cookies.set(name, value)
          }
        }
      })
      actualStoredState = cookies.get('passport_oauth_state')
    }

    // Verify state (CSRF protection)
    // Debug logging
    console.log('[Passport] State verification:', {
      stateFromUrl: state,
      stateFromCookie: actualStoredState,
      statesMatch: state === actualStoredState,
    })
    
    if (!state || !actualStoredState || state !== actualStoredState) {
      console.error('[Passport] State mismatch', {
        stateFromUrl: state,
        stateFromCookie: actualStoredState,
      })
      return NextResponse.redirect(new URL('/login?error=invalid_state', origin))
    }

    // Exchange code for user info
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    let callbackUrl = process.env.NEXT_PUBLIC_PASSPORT_CALLBACK_URL || 'http://localhost:3000/auth/callback'
    
    // Normalize origin and callback URL: remove www. prefix to ensure consistent redirect URI
    // This prevents www vs non-www mismatch with Google OAuth redirect URIs
    if (origin.includes('://www.')) {
      origin = origin.replace('://www.', '://')
    }
    if (callbackUrl.includes('://www.')) {
      callbackUrl = callbackUrl.replace('://www.', '://')
    }
    
    const fullCallbackUrl = `${origin}${callbackUrl.replace(/^https?:\/\/[^/]+/, '')}`

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: fullCallbackUrl,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error('[Passport] Token exchange failed:', errorData)
      return NextResponse.redirect(new URL('/login?error=token_exchange_failed', origin))
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userInfoResponse.ok) {
      console.error('[Passport] User info fetch failed')
      return NextResponse.redirect(new URL('/login?error=user_info_failed', origin))
    }

    const googleProfile = await userInfoResponse.json()

    // Process user with Passport strategy logic
    const { userRepository, authIdentityRepository } = createServerContainer()

    const googleId = googleProfile.id
    const email = googleProfile.email || ''
    const fullName = googleProfile.name || null

    if (!email) {
      return NextResponse.redirect(new URL('/login?error=no_email', origin))
    }

    // 1. Check if Passport identity exists
    let identity = await authIdentityRepository.findByLegacyAuthId('passport', googleId)

    let appUser
    if (identity) {
      // Existing Passport user
      appUser = await userRepository.getById(identity.appUserId)
      if (!appUser) {
        return NextResponse.redirect(new URL('/login?error=user_not_found', origin))
      }
    } else {
      // 2. Check if user exists by email
      appUser = await userRepository.findByEmail(email)

      if (appUser) {
        // Existing user - create Passport identity
        identity = await authIdentityRepository.create({
          appUserId: appUser.id,
          provider: 'passport',
          legacyAuthId: googleId,
          email: email,
          isPrimary: false,
          metadata: {
            googleProfile: {
              displayName: googleProfile.name,
              photo: googleProfile.picture,
            },
          },
        })
      } else {
        // 3. New user - create app_user and Passport identity
        const { prisma } = await import('@/lib/prisma')
        const newAppUserRow = await prisma.appUser.create({
          data: {
            primary_email: email,
            full_name: fullName,
            status: 'active',
          },
        })

        appUser = {
          id: newAppUserRow.id,
          canonicalId: newAppUserRow.id,
          email: newAppUserRow.primary_email,
          fullName: newAppUserRow.full_name,
          legacyAuthProvider: 'passport',
          legacyAuthId: googleId,
        }

        identity = await authIdentityRepository.create({
          appUserId: appUser.id,
          provider: 'passport',
          legacyAuthId: googleId,
          email: email,
          isPrimary: true,
          metadata: {
            googleProfile: {
              displayName: googleProfile.name,
              photo: googleProfile.picture,
            },
          },
        })
      }
    }

    // Track login - use Supabase user_id if available (for KPI metrics foreign key)
    // KPI metrics table references auth.users(id), so we need the Supabase ID
    // Check if user has a Supabase identity linked to this app_user
    const allIdentities = await authIdentityRepository.findByAppUserId(appUser.id)
    const supabaseIdentity = allIdentities.find((id) => id.provider === 'supabase')
    
    if (supabaseIdentity && supabaseIdentity.legacyAuthId) {
      // User has Supabase identity - use it for tracking
      await trackLogin(supabaseIdentity.legacyAuthId)
    } else {
      // Track without user_id for Passport-only users (new users without Supabase account)
      const { trackKPI } = await import('@/lib/tracking/kpi-tracker')
      await trackKPI('Addictiveness', 'General', 1, undefined, undefined, { 
        action: 'login', 
        app_user_id: appUser.id,
        provider: 'passport'
      })
    }

    // Get redirect destination
    const { authService, companyRepository, subscriptionService } = createServerContainer()
    const useCase = new GetRootDestination(
      authService,
      companyRepository,
      subscriptionService
    )

    // Get the correct destination from GetRootDestination
    const baseDestination = await useCase.executeForUser(appUser.id)
    
    // Only use redirectTo if it's explicitly provided and not the default '/home'
    // This ensures GetRootDestination logic is respected
    const redirectDestination = redirectTo && redirectTo !== '/home' ? redirectTo : null

    const next = resolvePostAuthRedirect({
      baseDestination,
      overridePath: explicitNext || redirectDestination,
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

    // Create redirect response and set session cookie
    let response = NextResponse.redirect(redirectUrl)
    
    // Set session in response
    response = await setSessionInResponse(
      {
        appUserId: appUser.id,
        email: appUser.email,
        googleId,
      },
      response
    )
    
    // Clear OAuth state cookies
    response.cookies.delete('passport_oauth_state')
    response.cookies.delete('passport_redirect_to')

    return response
  } catch (error) {
    console.error('[Passport] Callback error:', error)
    return NextResponse.redirect(new URL('/login?error=callback_failed', request.url))
  }
}
