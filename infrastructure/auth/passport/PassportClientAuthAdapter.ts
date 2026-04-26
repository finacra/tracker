/**
 * Passport implementation of ClientAuthAdapter.
 * Manages client-side auth state by reading session from API endpoint.
 */

import type {
  ClientAuthAdapter,
  ClientAuthSession,
} from '@/application/interfaces/ClientAuthAdapter'

export class PassportClientAuthAdapter implements ClientAuthAdapter {
  async getSession(): Promise<ClientAuthSession | null> {
    try {
      // Fetch session from API endpoint
      const response = await fetch('/api/auth/passport/session', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      })

      if (!response.ok) {
        return null
      }

      const data = await response.json()

      if (!data?.session) {
        return null
      }

      return {
        userId: data.session.appUserId,
        email: data.session.email,
        accessToken: null,
      }
    } catch (error) {
      // Quiet down network errors for non-active providers
      if (process.env.NODE_ENV === 'development') {
        console.debug('[PassportClientAuthAdapter] No session found or endpoint unreachable')
      }
      return null
    }
  }

  onAuthStateChange(
    callback: (event: string, session: ClientAuthSession | null) => void,
    options?: { skipInitialCheck?: boolean }
  ): { unsubscribe: () => void } {
    let intervalId: NodeJS.Timeout | null = null
    let lastSession: ClientAuthSession | null = null
    let isInitialCheck = true

    const checkSession = async () => {
      try {
        const session = await this.getSession()

        // Only fire callback if session state changed
        const sessionChanged =
          (session?.userId !== lastSession?.userId) ||
          (session === null && lastSession !== null) ||
          (session !== null && lastSession === null)

        if (sessionChanged || isInitialCheck) {
          isInitialCheck = false
          const event = session ? 'SIGNED_IN' : 'SIGNED_OUT'
          callback(event, session)
          lastSession = session
        }
      } catch (e) {
        // Suppress errors during polling
      }
    }

    // Initial check with a small delay to avoid race conditions during
    // page load. Skipped when the caller already resolved the session
    // via getSession() (e.g. providers.tsx) — otherwise we'd double the
    // /api/auth/passport/session roundtrip on every cold load.
    const timeoutId = options?.skipInitialCheck
      ? null
      : setTimeout(checkSession, 500)

    // Poll every 5 minutes (down from 5 seconds) — session is a 7-day JWT cookie,
    // no need to check frequently. Also check on tab focus for instant responsiveness.
    intervalId = setInterval(checkSession, 5 * 60 * 1000)

    // Check session when user returns to the tab (covers logout in another tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkSession()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return {
      unsubscribe: () => {
        if (timeoutId) clearTimeout(timeoutId)
        if (intervalId) {
          clearInterval(intervalId)
          intervalId = null
        }
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      },
    }
  }

  async signOut(): Promise<void> {
    try {
      await fetch('/api/auth/passport/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } catch (error) {
      // Quiet down
    }
  }
}
