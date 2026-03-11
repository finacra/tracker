import type { SessionProvider, SessionUser } from '@/application/interfaces/SessionProvider'
import { createClient } from '@/utils/supabase/server'

/**
 * Supabase implementation of SessionProvider.
 * Resolves the current authenticated user from Supabase Auth cookies.
 */
export class SupabaseSessionProvider implements SessionProvider {
  async getSessionUser(): Promise<SessionUser | null> {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return null

    return {
      id: user.id,
      email: user.email ?? '',
      fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
    }
  }
}
