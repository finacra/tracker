'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { SupabaseClientAuthAdapter } from '@/infrastructure/auth/supabase/SupabaseClientAuthAdapter'
import { PassportClientAuthAdapter } from '@/infrastructure/auth/passport/PassportClientAuthAdapter'
import type { ClientAuthSession } from '@/application/interfaces/ClientAuthAdapter'
import { trackLogin } from '@/lib/tracking/kpi-tracker'
import { AuthProvider, type AuthContextValue } from '@/contexts/AuthContext'
import type { AppUser } from '@/domain/models/AppUser'

export function Providers({ children }: { children: React.ReactNode }) {
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Choose auth provider based on environment variable (default to Supabase for backward compatibility)
  const authProvider = process.env.NEXT_PUBLIC_AUTH_PROVIDER || 'supabase'
  const supabase = useMemo(() => createClient(), [])
  
  // Composition: swap this adapter to change client-side auth provider
  const authAdapter = useMemo(() => {
    if (authProvider === 'passport') {
      return new PassportClientAuthAdapter()
    }
    return new SupabaseClientAuthAdapter(supabase)
  }, [supabase, authProvider])
  const trackedLoginUserIdRef = useRef<string | null>(null)
  const appUserRequestIdRef = useRef(0)
  const resolvedAppUserIdRef = useRef<string | null>(null)

  const buildFallbackAppUser = (session: ClientAuthSession): AppUser => ({
    id: session.userId,
    canonicalId: null,
    email: session.email ?? '',
    fullName: null,
    legacyAuthProvider: authProvider === 'passport' ? 'passport' : 'supabase',
    legacyAuthId: session.userId,
  })

  const trackLoginOnce = async (session: ClientAuthSession | null, event?: string, resolvedAppUser?: AppUser | null) => {
    if (!session?.userId) return
    if (trackedLoginUserIdRef.current === session.userId) return

    if (!event || event === 'SIGNED_IN') {
      trackedLoginUserIdRef.current = session.userId
      
      // For Passport users, use the API endpoint that handles Supabase identity lookup
      // For Supabase users, use the direct trackLogin function
      if (authProvider === 'passport') {
        // Get app_user_id from the resolved appUser or use session.userId
        const appUserId = resolvedAppUser?.canonicalId || resolvedAppUser?.id || session.userId
        
        try {
          await fetch('/api/auth/track-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appUserId }),
          })
        } catch (error) {
          console.error('Error tracking login:', error)
          // Don't throw - tracking failures shouldn't break the app
        }
      } else {
        // Supabase user - use direct tracking
      trackLogin(session.userId)
      }
    }
  }

  const syncAppUser = async (session: ClientAuthSession | null) => {
    const requestId = ++appUserRequestIdRef.current

    if (!session) {
      resolvedAppUserIdRef.current = null
      setAppUser(null)
      return null
    }

    if (resolvedAppUserIdRef.current === session.userId) {
      return appUser
    }

    try {
      const response = await fetch('/api/auth/profile', {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`Profile request failed with status ${response.status}`)
      }

      const payload = (await response.json()) as { user?: AppUser | null }
      if (requestId !== appUserRequestIdRef.current) {
        return null
      }

      const nextAppUser = payload.user ?? buildFallbackAppUser(session)
      resolvedAppUserIdRef.current = session.userId
      setAppUser(nextAppUser)
      return nextAppUser
    } catch (error) {
      console.error('Error resolving canonical auth profile:', error)

      if (requestId !== appUserRequestIdRef.current) {
        return null
      }

      const fallbackUser = buildFallbackAppUser(session)
      resolvedAppUserIdRef.current = session.userId
      setAppUser(fallbackUser)
      return fallbackUser
    }
  }

  useEffect(() => {
    // Initial load: wait for session AND app profile before releasing loading state
    authAdapter.getSession().then(async (session) => {
      const resolvedUser = await syncAppUser(session)
      setLoading(false)
      // Track login after appUser is resolved
      await trackLoginOnce(session, undefined, resolvedUser)
    })

    const { unsubscribe } = authAdapter.onAuthStateChange(async (_event, session) => {
      // For auth events, we update sync status but only toggle loading if it was forced back to true
      // or if we want to ensure data consistency before UI updates.
      if (!session) {
        trackedLoginUserIdRef.current = null
      }
      const resolvedUser = await syncAppUser(session)
      setLoading(false)
      // Track login after appUser is resolved
      await trackLoginOnce(session, _event, resolvedUser)
    })

    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authAdapter]) // Only authAdapter changes, authProvider is constant

  const signOut = async () => {
    trackedLoginUserIdRef.current = null
    await authAdapter.signOut()
  }

  const contextValue = useMemo(() => ({
    // Legacy fields kept for backward compatibility during transition.
    // Components should prefer appUser over user/session.
    user: appUser,
    session: null,
    appUser,
    loading,
    signOut,
  }), [appUser, loading])

  return (
    <AuthProvider value={contextValue}>
      {children}
    </AuthProvider>
  )
}
