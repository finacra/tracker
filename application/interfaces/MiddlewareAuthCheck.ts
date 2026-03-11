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
