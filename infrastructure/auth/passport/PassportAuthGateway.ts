/**
 * Passport implementation of AuthGateway.
 * Handles OAuth login URL generation, callback processing, sign-out, and session refresh.
 */

import type { AuthGateway } from '@/application/interfaces/AuthGateway'

export class PassportAuthGateway implements AuthGateway {
  async getOAuthLoginUrl(
    provider: 'google' | 'github',
    redirectTo?: string
  ): Promise<string> {
    if (provider !== 'google') {
      throw new Error(`Provider ${provider} is not supported yet`)
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || 'http://localhost:3000'
    const baseUrl = `${origin}/api/auth/passport/google`

    const params = new URLSearchParams()
    if (redirectTo) {
      params.set('redirectTo', redirectTo)
    }

    return `${baseUrl}${params.toString() ? `?${params.toString()}` : ''}`
  }

  async handleOAuthCallback(code: string): Promise<{ userId: string } | { error: string }> {
    // The callback is handled by the API route directly
    // This method is kept for interface compatibility but the actual work
    // is done in app/api/auth/passport/callback/route.ts
    // 
    // If called from elsewhere, we'd need to exchange the code here,
    // but for Next.js App Router, the callback route handles it.
    
    return { error: 'OAuth callback should be handled via /api/auth/passport/callback route' }
  }

  async signOut(): Promise<void> {
    const { clearSession } = await import('@/lib/auth/passport-session')
    await clearSession()
  }

  async refreshSession(): Promise<boolean> {
    // For JWT-based sessions, we don't need explicit refresh
    // The session is valid until expiration
    // We can verify it's still valid by checking the token
    const { getSession } = await import('@/lib/auth/passport-session')
    const session = await getSession()
    return session !== null
  }
}
