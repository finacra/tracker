/**
 * AuthGateway abstracts login, logout, and callback handling away from
 * any specific auth provider (Supabase Auth, Passport, etc.).
 *
 * This is the surface that must be replaced when migrating auth providers.
 */
export interface AuthGateway {
  /**
   * Build the URL for initiating OAuth login with a given provider.
   * The implementation handles redirect URL construction, PKCE flows, etc.
   */
  getOAuthLoginUrl(provider: 'google' | 'github', redirectTo?: string): Promise<string>

  /**
   * Process an OAuth callback and exchange the code for a session.
   * Returns the authenticated user's legacy auth ID on success.
   */
  handleOAuthCallback(code: string): Promise<{ userId: string } | { error: string }>

  /**
   * Sign out the current user and clear the session.
   */
  signOut(): Promise<void>

  /**
   * Refresh the current session if it's about to expire.
   * Returns true if the session was refreshed, false if no session exists.
   */
  refreshSession(): Promise<boolean>
}
