import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client.
 *
 * This project's auth provider is Passport JWT, NOT Supabase Auth.
 * The Supabase client is used only for PostgREST (`from(...).select`)
 * and Storage operations, which authenticate via the anon key in
 * request headers — no session, no cookies, no refresh tokens.
 *
 * By default `createBrowserClient` enables the full auth machinery
 * (persistSession, autoRefreshToken, detectSessionInUrl). With no
 * Supabase Auth session ever present, that machinery sits in a
 * retry loop hammering `/auth/v1/token?grant_type=refresh_token`,
 * flooding the console with `AuthRetryableFetchError` whenever
 * Supabase's auth endpoint hiccups (we observed 504s in prod).
 *
 * Turn it all off so the client only ever talks to PostgREST/Storage.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )
}
