import type { AuthGateway } from '@/application/interfaces/AuthGateway'
import { createClient } from '@/utils/supabase/server'

/**
 * Supabase implementation of AuthGateway.
 * Handles OAuth login URL generation, callback processing, sign-out, and session refresh.
 */
export class SupabaseAuthGateway implements AuthGateway {
  async getOAuthLoginUrl(
    provider: 'google' | 'github',
    redirectTo?: string
  ): Promise<string> {
    const supabase = await createClient()
    const origin = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || 'http://localhost:3000'
    const callbackUrl = `${origin}/auth/callback${redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ''}`

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl,
      },
    })

    if (error || !data?.url) {
      throw new Error(error?.message ?? 'Failed to generate OAuth login URL')
    }

    return data.url
  }

  async handleOAuthCallback(code: string): Promise<{ userId: string } | { error: string }> {
    const supabase = await createClient()

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      return { error: error.message }
    }

    if (!data?.user) {
      return { error: 'No user returned from auth callback' }
    }

    return { userId: data.user.id }
  }

  async signOut(): Promise<void> {
    const supabase = await createClient()
    await supabase.auth.signOut()
  }

  async refreshSession(): Promise<boolean> {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.refreshSession()

    if (error || !data?.session) {
      return false
    }

    return true
  }
}
