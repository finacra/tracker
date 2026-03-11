import type {
  MiddlewareAuthCheck,
  MiddlewareAuthResult,
} from '@/application/interfaces/MiddlewareAuthCheck'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Supabase implementation of MiddlewareAuthCheck.
 * Creates a Supabase server client from request cookies, checks auth,
 * and returns the updated response with refreshed cookies.
 */
export class SupabaseMiddlewareAuthCheck implements MiddlewareAuthCheck {
  async check(request: NextRequest): Promise<{
    result: MiddlewareAuthResult
    response: Response
  }> {
    let response = NextResponse.next({ request })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              const existingCookie = request.cookies.get(name)
              if (!existingCookie || existingCookie.value !== value) {
                request.cookies.set(name, value)
                response.cookies.set(name, value, {
                  ...options,
                  path: options?.path ?? '/',
                  sameSite: options?.sameSite ?? 'lax',
                  httpOnly: options?.httpOnly ?? true,
                  secure: options?.secure ?? process.env.NODE_ENV === 'production',
                })
              }
            })
          },
        },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const result: MiddlewareAuthResult = {
      authenticated: !!user,
      userId: user?.id ?? null,
    }

    return { result, response }
  }
}
