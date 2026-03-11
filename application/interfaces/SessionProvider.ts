/**
 * SessionProvider abstracts the session/auth-state resolution away from
 * any specific provider (Supabase, Passport, etc.).
 *
 * Server-side code uses this to discover the authenticated user without
 * coupling to Supabase's getUser() or cookie-handling specifics.
 */
export interface SessionUser {
  id: string
  email: string
  fullName: string | null
}

export interface SessionProvider {
  /**
   * Resolve the current session user from the incoming request context
   * (cookies, headers, etc.). Returns null if not authenticated.
   */
  getSessionUser(): Promise<SessionUser | null>
}
