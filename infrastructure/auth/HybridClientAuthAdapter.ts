import type { ClientAuthAdapter, ClientAuthSession } from '@/application/interfaces/ClientAuthAdapter'
import { SupabaseClientAuthAdapter } from '@/infrastructure/auth/supabase/SupabaseClientAuthAdapter'
import { PassportClientAuthAdapter } from '@/infrastructure/auth/passport/PassportClientAuthAdapter'
import type { SupabaseClient } from '@supabase/supabase-js'

export class HybridClientAuthAdapter implements ClientAuthAdapter {
  private supabaseAdapter: SupabaseClientAuthAdapter
  private passportAdapter: PassportClientAuthAdapter

  constructor(supabase: SupabaseClient) {
    this.supabaseAdapter = new SupabaseClientAuthAdapter(supabase)
    this.passportAdapter = new PassportClientAuthAdapter()
  }

  async getSession(): Promise<ClientAuthSession | null> {
    // Try Passport first (if preferred) then Supabase, or vice versa
    // Actually, we should check both.
    const passportSession = await this.passportAdapter.getSession()
    if (passportSession) return passportSession

    return this.supabaseAdapter.getSession()
  }

  onAuthStateChange(
    callback: (event: string, session: ClientAuthSession | null) => void,
    options?: { skipInitialCheck?: boolean }
  ): { unsubscribe: () => void } {
    // This is tricky. We need to listen to BOTH.
    const sub1 = this.supabaseAdapter.onAuthStateChange(callback, options)
    const sub2 = this.passportAdapter.onAuthStateChange(callback, options)

    return {
      unsubscribe: () => {
        sub1.unsubscribe()
        sub2.unsubscribe()
      }
    }
  }

  async signOut(): Promise<void> {
    await Promise.all([
      this.supabaseAdapter.signOut(),
      this.passportAdapter.signOut()
    ])
  }
}
