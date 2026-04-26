/**
 * ClientAuthAdapter abstracts the client-side auth state management
 * away from any specific provider (Supabase, Passport, etc.).
 *
 * This is consumed by providers.tsx to manage client auth state
 * without coupling to Supabase-specific session/user shapes.
 */

export interface ClientAuthSession {
  userId: string
  email: string
  accessToken: string | null
}

export interface ClientAuthAdapter {
  /**
   * Get the current session. Returns null if not authenticated.
   */
  getSession(): Promise<ClientAuthSession | null>

  /**
   * Subscribe to auth state changes.
   * Returns an unsubscribe function.
   *
   * Pass `skipInitialCheck: true` when the caller has already resolved
   * the initial session via getSession() — otherwise the adapter does
   * its own redundant network roundtrip to /api/auth/passport/session
   * shortly after subscription, doubling the auth latency on cold load.
   */
  onAuthStateChange(
    callback: (event: string, session: ClientAuthSession | null) => void,
    options?: { skipInitialCheck?: boolean }
  ): { unsubscribe: () => void }

  /**
   * Sign out the current user on the client side.
   */
  signOut(): Promise<void>
}
