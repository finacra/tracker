import type {
  ClientAuthAdapter,
  ClientAuthSession,
} from '@/application/interfaces/ClientAuthAdapter'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase implementation of ClientAuthAdapter.
 * Wraps the Supabase client auth methods behind the abstract interface.
 */
export class SupabaseClientAuthAdapter implements ClientAuthAdapter {
  constructor(private readonly supabase: SupabaseClient) {}

  async getSession(): Promise<ClientAuthSession | null> {
    const {
      data: { session },
    } = await this.supabase.auth.getSession()

    if (!session?.user) return null

    return {
      userId: session.user.id,
      email: session.user.email ?? '',
      accessToken: session.access_token,
    }
  }

  onAuthStateChange(
    callback: (event: string, session: ClientAuthSession | null) => void
  ): { unsubscribe: () => void } {
    const {
      data: { subscription },
    } = this.supabase.auth.onAuthStateChange((_event, session) => {
      const adapted: ClientAuthSession | null = session?.user
        ? {
            userId: session.user.id,
            email: session.user.email ?? '',
            accessToken: session.access_token,
          }
        : null

      callback(_event, adapted)
    })

    return { unsubscribe: () => subscription.unsubscribe() }
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut()
  }
}
