import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server-side Supabase client.
 *
 * Same rationale as the browser client (utils/supabase/client.ts):
 * this project authenticates users via Passport JWT, not Supabase
 * Auth. The Supabase client is only used for PostgREST and Storage
 * — both of which authenticate via the anon key, not via Supabase
 * Auth cookies/sessions.
 *
 * Turning off `persistSession` + `autoRefreshToken` +
 * `detectSessionInUrl` stops the SDK from reading/writing Supabase
 * auth cookies and from firing background refresh requests against
 * /auth/v1/token. Keeps the cookie adapter wired for forward
 * compatibility but it'll be a no-op while auth is off.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
