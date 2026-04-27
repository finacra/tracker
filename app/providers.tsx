'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PassportClientAuthAdapter } from '@/infrastructure/auth/passport/PassportClientAuthAdapter'
import type { ClientAuthSession } from '@/application/interfaces/ClientAuthAdapter'
import { trackLogin } from '@/lib/tracking/kpi-tracker'
import { AuthProvider, type AuthContextValue } from '@/contexts/AuthContext'
import type { AppUser } from '@/domain/models/AppUser'
import { useAppStore } from '@/lib/store/appStore'

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
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
  // Track which user.id we've already resolved superadmin status for —
  // this lives in providers (mounted once at app root) instead of
  // Header.tsx so that Header unmount/remount cycles (e.g. /data-room
  // flipping between loading and final render) don't re-roundtrip
  // checkSuperadminStatus.
  const superadminResolvedForRef = useRef<string | null>(null)
  const setIsSuperadmin = useAppStore((s) => s.setIsSuperadmin)
  const setNotificationCount = useAppStore((s) => s.setNotificationCount)

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
        credentials: 'include',
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
      console.error('[SYNC] Profile fetch error:', error instanceof Error ? error.message : error)

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
    let initialLoadDone = false

    // Initial load: wait for session AND app profile before releasing loading state
    authAdapter.getSession().then(async (session) => {
      const resolvedUser = await syncAppUser(session)
      initialLoadDone = true
      setLoading(false)
      await trackLoginOnce(session, undefined, resolvedUser)
    }).catch(err => {
      console.error('[PROVIDERS] getSession error:', err)
      initialLoadDone = true
      setLoading(false)
    })

    const { unsubscribe } = authAdapter.onAuthStateChange(async (_event, session) => {
      // Skip if initial load hasn't finished — avoid racing with getSession above
      if (!initialLoadDone) return
      if (!session) {
        trackedLoginUserIdRef.current = null
      }
      const resolvedUser = await syncAppUser(session)
      setLoading(false)
      await trackLoginOnce(session, _event, resolvedUser)
    }, { skipInitialCheck: true })

    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authAdapter])

  // Resolve superadmin status once per user.id and stash in Zustand.
  // Lives here (not in Header) so Header unmount/remount doesn't
  // re-trigger the network call. The ref persists across signed-out
  // transitions so a flip user → null → user (same id) doesn't refire.
  useEffect(() => {
    if (!appUser) {
      setIsSuperadmin(false)
      return
    }
    if (superadminResolvedForRef.current === appUser.id) return
    superadminResolvedForRef.current = appUser.id

    let cancelled = false
    import('@/app/admin/actions').then(({ checkSuperadminStatus }) =>
      checkSuperadminStatus().then((result) => {
        if (!cancelled) setIsSuperadmin(result.success ? (result.isSuperadmin ?? false) : false)
      })
    ).catch(() => { if (!cancelled) setIsSuperadmin(false) })
    return () => { cancelled = true }
  }, [appUser, setIsSuperadmin])

  // Unread notification count poller — owns the badge value in Zustand.
  // Lives here (not in Header) because Header used to mount in a layout
  // BEFORE /data-room/page.tsx populated the Zustand seed via init's
  // batched payload, causing a redundant getNotifications roundtrip on
  // every cold load. Polling here also runs only when authed, and skips
  // the immediate fire when a fresh seed already exists in Zustand —
  // which the page sets after init returns.
  useEffect(() => {
    if (!appUser) return
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    const fetchOnce = async () => {
      try {
        const { getNotifications } = await import('@/app/actions/notifications')
        const result = await getNotifications({ unreadOnly: true, limit: 50 })
        if (cancelled) return
        if (result.success) setNotificationCount(result.unreadCount ?? 0)
      } catch (err) {
        console.warn('[providers:notif-poll] fetchOnce threw', err instanceof Error ? err.message : err)
      }
    }

    // Initial fire — but only if no fresh seed already exists in Zustand
    // (e.g. from /data-room/page.tsx which puts the count there as part
    // of getDataRoomInitState's batched payload).
    const seededAt = useAppStore.getState().notificationCountSeededAt
    const seedFresh = seededAt !== null && Date.now() - seededAt < 60_000
    if (!seedFresh) fetchOnce()

    // 60-second background poll (matches the previous useUnreadCountQuery cadence).
    intervalId = setInterval(fetchOnce, 60 * 1000)

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
    }
  }, [appUser, setNotificationCount])

  const signOut = async () => {
    trackedLoginUserIdRef.current = null
    resolvedAppUserIdRef.current = null
    superadminResolvedForRef.current = null
    await authAdapter.signOut()
    setAppUser(null)
    setIsSuperadmin(false)
    // Drop every cached query — otherwise the next user in this browser
    // can see the previous user's companies/subscriptions until each
    // query's staleTime expires.
    queryClient.clear()
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
