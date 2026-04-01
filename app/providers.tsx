'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { PassportClientAuthAdapter } from '@/infrastructure/auth/passport/PassportClientAuthAdapter'
import type { ClientAuthSession } from '@/application/interfaces/ClientAuthAdapter'
import { trackLogin } from '@/lib/tracking/kpi-tracker'
import { AuthProvider, type AuthContextValue } from '@/contexts/AuthContext'
import type { AppUser } from '@/domain/models/AppUser'

export function Providers({ children }: { children: React.ReactNode }) {
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Choose auth provider based on environment variable (default to Supabase for backward compatibility)
  // Composition: Only use Passport now
  const authAdapter = useMemo(() => {
    return new PassportClientAuthAdapter()
  }, [])
  const trackedLoginUserIdRef = useRef<string | null>(null)
  const appUserRequestIdRef = useRef(0)
  const resolvedAppUserIdRef = useRef<string | null>(null)

  const buildFallbackAppUser = (session: ClientAuthSession): AppUser => ({
    id: session.userId,
    canonicalId: null,
    email: session.email ?? '',
    fullName: null,
    legacyAuthProvider: 'passport',
    legacyAuthId: session.userId,
  })

  const trackLoginOnce = async (session: ClientAuthSession | null, event?: string, resolvedAppUser?: AppUser | null) => {
    if (!session?.userId) return
    if (trackedLoginUserIdRef.current === session?.userId) return

    if (!event || event === 'SIGNED_IN') {
      trackedLoginUserIdRef.current = session?.userId ?? null
      
      // For Passport users, always use the API endpoint
      const appUserId = resolvedAppUser?.canonicalId || resolvedAppUser?.id || session?.userId
      
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
    }
  }

  const syncAppUser = async (session: ClientAuthSession | null) => {
    const requestId = ++appUserRequestIdRef.current

    if (!session) {
      console.log('[SYNC] No session, clearing user')
      resolvedAppUserIdRef.current = null
      setAppUser(null)
      return null
    }

    if (resolvedAppUserIdRef.current === session.userId) {
      console.log('[SYNC] Already resolved for', session.userId, '→ returning cached appUser:', appUser?.id || 'null')
      return appUser
    }

    try {
      console.log('[SYNC] Fetching /api/auth/profile for', session.userId)
      const response = await fetch('/api/auth/profile', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      })

      console.log('[SYNC] Profile response status:', response.status)

      if (!response.ok) {
        throw new Error(`Profile request failed with status ${response.status}`)
      }

      const payload = (await response.json()) as { user?: AppUser | null }
      console.log('[SYNC] Profile payload:', payload.user ? `uid:${payload.user.id}` : 'null', 'error:', (payload as any).error || 'none')

      if (requestId !== appUserRequestIdRef.current) {
        console.log('[SYNC] Stale request, ignoring')
        return null
      }

      const nextAppUser = payload.user ?? buildFallbackAppUser(session)
      resolvedAppUserIdRef.current = session.userId
      setAppUser(nextAppUser)
      return nextAppUser
    } catch (error: any) {
      console.error('[SYNC] Profile fetch error:', error.message || error)

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
      console.log('[PROVIDERS] getSession result:', session ? `uid:${session.userId} email:${session.email}` : 'null')
      const resolvedUser = await syncAppUser(session)
      console.log('[PROVIDERS] syncAppUser result:', resolvedUser ? `uid:${resolvedUser.id}` : 'null')
      setLoading(false)
      console.log('[PROVIDERS] loading set to false, appUser:', resolvedUser ? 'SET' : 'NULL')
      // Track login after appUser is resolved
      await trackLoginOnce(session, undefined, resolvedUser)
    }).catch(err => {
      console.error('[PROVIDERS] getSession error:', err)
      setLoading(false)
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
