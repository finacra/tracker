/**
 * Passport implementation of MiddlewareAuthCheck.
 * Checks Passport session cookies to determine if request is authenticated.
 */

import type {
  MiddlewareAuthCheck,
  MiddlewareAuthResult,
} from '@/application/interfaces/MiddlewareAuthCheck'
import { NextResponse, type NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/passport-session'

export class PassportMiddlewareAuthCheck implements MiddlewareAuthCheck {
  async check(request: NextRequest): Promise<{
    result: MiddlewareAuthResult
    response: Response
  }> {
    const response = NextResponse.next({ request })

    try {
      // Get session from cookies
      // Note: In middleware, we need to read cookies from the request
      const sessionToken = request.cookies.get('passport_session')?.value

      if (!sessionToken) {
        return {
          result: {
            authenticated: false,
            userId: null,
          },
          response,
        }
      }

      // Verify session token
      const { verifySession } = await import('@/lib/auth/passport-session')
      const session = await verifySession(sessionToken)

      if (!session) {
        // Invalid session - clear cookie
        response.cookies.delete('passport_session')
        return {
          result: {
            authenticated: false,
            userId: null,
          },
          response,
        }
      }

      return {
        result: {
          authenticated: true,
          userId: session.appUserId,
        },
        response,
      }
    } catch (error) {
      console.error('[PassportMiddlewareAuthCheck] Error:', error)
      return {
        result: {
          authenticated: false,
          userId: null,
        },
        response,
      }
    }
  }
}
