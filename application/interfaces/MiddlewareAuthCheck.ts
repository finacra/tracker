import type { NextRequest } from 'next/server'

/**
 * MiddlewareAuthCheck abstracts the middleware-level auth verification
 * away from any specific auth provider.
 *
 * This is used by proxy.ts to determine if a request is authenticated
 * without coupling to Supabase-specific cookie/session handling.
 */
export interface MiddlewareAuthResult {
  authenticated: boolean
  userId: string | null
  /**
   * Optional verification flag surfaced from the session token itself.
   * When true, proxy middleware can skip its DB gating query (PR-36 —
   * shaves ~250 ms iad1↔ap-south-1 RTT on every protected request).
   * When false/undefined, fall back to the existing DB check (old JWTs
   * without the claim default to undefined here).
   */
  emailVerified?: boolean
}

export interface MiddlewareAuthCheck {
  /**
   * Check if the request has a valid auth session.
   * The implementation handles cookie reading, token verification, etc.
   * Returns a response object that may have updated cookies (for token refresh).
   */
  check(request: NextRequest): Promise<{
    result: MiddlewareAuthResult
    response: Response
  }>
}
