'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PassportClientAuthAdapter } from '@/infrastructure/auth/passport/PassportClientAuthAdapter'
import type { ClientAuthSession } from '@/application/interfaces/ClientAuthAdapter'
import { trackLogin } from '@/lib/tracking/kpi-tracker'
import { AuthProvider, type AuthContextValue } from '@/contexts/AuthContext'
import type { AppUser } from '@/domain/models/AppUser'
import { useAppStore } from '@/lib/store/appStore'

export function Providers({
  children,
  initialAppUser = null,
}: {
  children: React.ReactNode
  /**
   * Pre-resolved AppUser from the server-rendered layout. When this is
   * provided (Phase 1.5), the initial useEffect skips the client-side
   * getSession() + fetch('/api/auth/profile') chain — both have already
   * happened on the server during the initial page render. Saves
   * ~250 ms of visible "shell-then-fill" flash on every page mount.
   *
   * When null (unauthenticated visitor OR server-side resolution
   * failed), Providers falls back to the original two-step client
   * dance — preserves the existing behavior for those paths.
   */
  initialAppUser?: AppUser | null
}) {
  const queryClient = useQueryClient()
  const [appUser, setAppUser] = useState<AppUser | null>(initialAppUser)
  // Seed loading=false when we already have the user — the page can
  // render its full auth-gated state immediately. Otherwise stay
  // loading until the client-side fetch chain resolves.
  const [loading, setLoading] = useState(!initialAppUser)

  // Choose auth provider based on environment variable (default to Supabase for backward compatibility)
  // Composition: Only use Passport now
  const authAdapter = useMemo(() => {
    return new PassportClientAuthAdapter()
  }, [])
  const trackedLoginUserIdRef = useRef<string | null>(null)
  const appUserRequestIdRef = useRef(0)
  // If we have an initialAppUser, seed resolvedAppUserIdRef so syncAppUser's
  // "already resolved" short-circuit (line 75) kicks in immediately on any
  // subsequent onAuthStateChange call for the same user.
  const resolvedAppUserIdRef = useRef<string | null>(
    initialAppUser?.id ?? null,
  )
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

    if (initialAppUser) {
      // Server-rendered seed (Phase 1.5): the user is already known and
      // the React state is already populated. Skip the client-side
      // getSession + /api/auth/profile two-step entirely — they would
      // just re-fetch what the layout already gave us, costing
      // ~250 ms × 2 round-trips on every page mount.
      //
      // Mark initialLoadDone=true synchronously BEFORE we attach the
      // onAuthStateChange listener, so the listener's "skip if not
      // initial-load-done" gate (Rule 10) opens immediately for any
      // subsequent SIGN_OUT/TOKEN_REFRESHED that fires.
      initialLoadDone = true
      // Fire-and-forget the login tracker. trackedLoginUserIdRef
      // de-dupes — same user.id won't trigger a second POST. The
      // accessToken is unused by trackLoginOnce / track-login API
      // (they only need userId + appUser), so passing null is safe.
      void trackLoginOnce(
        { userId: initialAppUser.id, email: initialAppUser.email, accessToken: null },
        undefined,
        initialAppUser,
      )
    } else {
      // No server-side seed (logged out OR layout resolver failed).
      // Fall back to the original two-step dance.
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
    }

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

    // Defer the initial fire so /data-room/page.tsx (or any page that
    // populates Zustand from a batched init payload) wins the race.
    // Both this effect and the page's init useEffect fire on the same
    // appUser change — without the delay, providers' fetch would race
    // and almost always lose because init takes ~3s while a standalone
    // notifications fetch returns in ~1.5s. The 4s delay is long enough
    // for a typical cold init to complete; if no page has populated the
    // seed by then, we fall back to fetching here.
    const initialFireTimer = setTimeout(() => {
      if (cancelled) return
      const seededAt = useAppStore.getState().notificationCountSeededAt
      const seedFresh = seededAt !== null && Date.now() - seededAt < 60_000
      if (!seedFresh) fetchOnce()
    }, 4000)

    // 60-second background poll (matches the previous useUnreadCountQuery cadence).
    intervalId = setInterval(fetchOnce, 60 * 1000)

    return () => {
      cancelled = true
      clearTimeout(initialFireTimer)
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
