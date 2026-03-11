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

      if (!data.session) {
        return null
      }

      return {
        userId: data.session.appUserId,
        email: data.session.email,
        accessToken: null, // Passport doesn't use access tokens in the same way
      }
    } catch (error) {
      console.error('[PassportClientAuthAdapter] Error getting session:', error)
      return null
    }
  }

  onAuthStateChange(
    callback: (event: string, session: ClientAuthSession | null) => void
  ): { unsubscribe: () => void } {
    // For Passport, we'll poll the session endpoint
    // In a production app, you might want to use Server-Sent Events or WebSockets
    let intervalId: NodeJS.Timeout | null = null
    let lastSession: ClientAuthSession | null = null

    const checkSession = async () => {
      const session = await this.getSession()

      // Only fire callback if session state changed
      if (
        (session?.userId !== lastSession?.userId) ||
        (session === null && lastSession !== null) ||
        (session !== null && lastSession === null)
      ) {
        const event = session ? 'SIGNED_IN' : 'SIGNED_OUT'
        callback(event, session)
        lastSession = session
      }
    }

    // Check immediately
    checkSession()

    // Poll every 5 seconds
    intervalId = setInterval(checkSession, 5000)

    return {
      unsubscribe: () => {
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
      console.error('[PassportClientAuthAdapter] Error signing out:', error)
    }
  }
}
