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
    callback: (event: string, session: ClientAuthSession | null) => void
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

    // Initial check with a small delay to avoid race conditions during page load
    const timeoutId = setTimeout(checkSession, 500)

    // Poll every 5 seconds
    intervalId = setInterval(checkSession, 5000)

    return {
      unsubscribe: () => {
        clearTimeout(timeoutId)
        if (intervalId) {
          clearInterval(intervalId)
          intervalId = null
        }
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
