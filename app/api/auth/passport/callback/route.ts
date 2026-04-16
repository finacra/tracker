/**
 * Passport Google OAuth callback endpoint
 * Handles the OAuth callback from Google and creates/updates user session
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPassport } from '@/lib/auth/passport-config'
import { setSession, clearSession } from '@/lib/auth/passport-session'
import { createServerContainer } from '@/lib/composition/server-container'
import { GetRootDestination } from '@/application/use-cases/navigation/GetRootDestination'
import { resolvePostAuthRedirect } from '@/application/use-cases/navigation/resolvePostAuthRedirect'
import { trackLogin } from '@/lib/tracking/kpi-tracker'

export async function GET(request: NextRequest) {
  try {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    // Handle OAuth errors
    if (error) {
      console.error('[Passport] OAuth error:', error)
      return NextResponse.redirect(new URL('/login?error=oauth_failed', origin))
    }

    if (!code) {
      return NextResponse.redirect(new URL('/login?error=no_code', origin))
    }

    // Verify state (CSRF protection)
    const cookieStore = request.cookies
    const storedState = cookieStore.get('passport_oauth_state')?.value
    if (!state || state !== storedState) {
      console.error('[Passport] State mismatch')
      return NextResponse.redirect(new URL('/login?error=invalid_state', origin))
    }

    // Exchange code for user info
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const callbackUrl = process.env.NEXT_PUBLIC_PASSPORT_CALLBACK_URL || 'http://localhost:3000/auth/callback'
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
        // Existing user - create Passport identity. Converge email_verified
        // to true: Google has confirmed ownership of this address, so any
        // gate that trusts email_verified should pass immediately.
        const { prisma } = await import('@/lib/prisma')
        await prisma.appUser.update({
          where: { id: appUser.id },
          data: { email_verified: true, email_verified_at: new Date() } as any,
        })
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
        // Google OAuth users are auto-verified (Google verifies emails)
        const { prisma } = await import('@/lib/prisma')
        const newAppUserRow = await prisma.appUser.create({
          data: {
            primary_email: email,
            full_name: fullName,
            status: 'active',
            email_verified: true, // Google OAuth users are auto-verified
            email_verified_at: new Date(),
          } as any,
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

    // Create session
    await setSession({
      appUserId: appUser.id,
      email: appUser.email,
      googleId,
    })

    // Track login
    await trackLogin(appUser.id)

    // Get redirect destination
    const { authService, companyRepository, subscriptionService } = createServerContainer()
    const useCase = new GetRootDestination(
      authService,
      companyRepository,
      subscriptionService
    )

    // Get stored redirect destination
    const redirectTo = cookieStore.get('passport_redirect_to')?.value || null
    const baseDestination = await useCase.executeForUser(appUser.id)

    const next = resolvePostAuthRedirect({
      baseDestination,
      overridePath: redirectTo,
      allowOverrideForDataRoomUsers: false,
    })

    // Clear OAuth state cookies
    const response = NextResponse.redirect(new URL(next, origin))
    response.cookies.delete('passport_oauth_state')
    response.cookies.delete('passport_redirect_to')

    return response
  } catch (error) {
    console.error('[Passport] Callback error:', error)
    return NextResponse.redirect(new URL('/login?error=callback_failed', request.url))
  }
}
