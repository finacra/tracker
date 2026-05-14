import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import { validateEnv } from '@/lib/config/validate-env'

// Validate all required env vars at startup — crash early with clear message
validateEnv()
import { Providers } from './providers'
import { QueryProvider } from '@/lib/react-query/QueryProvider'
import Analytics from '@/components/features/Analytics'
import AnalyticsWrapper from '@/components/features/AnalyticsWrapper'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics as VercelAnalytics } from '@vercel/analytics/next'
import ToastContainer from '@/components/ui/Toast'
import { ThemeProvider, THEME_INLINE_SCRIPT } from '@/lib/theme/ThemeProvider'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { getSession } from '@/lib/auth/passport-session'
import { createServerContainer } from '@/lib/composition/server-container'
import type { AppUser } from '@/domain/models/AppUser'

export const metadata: Metadata = {
  title: 'Finacra - Financial Compliance Management',
  description: 'Sign in to manage your financial compliance',
}

/**
 * Resolve the current user server-side once per request so the client
 * Providers doesn't have to do its own getSession() + /api/auth/profile
 * two-step on mount. Vercel iad1 ↔ Supabase ap-south-1 ≈ 250 ms RTT
 * per round trip; absorbing this trip into the initial server render
 * removes a visible ~250 ms "shell-then-fill" flash on every page mount
 * (Header, useAuth-gated components stop flickering empty → filled).
 *
 * Returns null when there's no session or the user row no longer exists
 * (e.g. DB wipe with a stale cookie still around) — matches the client
 * adapter's fallback exactly. Failure here is non-fatal: client takes
 * over with its original fetch chain if initialAppUser is null.
 */
async function resolveInitialAppUser(): Promise<AppUser | null> {
  try {
    const session = await getSession()
    if (!session) return null
    const { authService } = createServerContainer()
    return await authService.getCurrentUser()
  } catch (err) {
    console.error('[layout] resolveInitialAppUser threw',
      err instanceof Error ? err.message : err,
      err instanceof Error ? err.stack : '')
    return null
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const initialAppUser = await resolveInitialAppUser()

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* PR-3 FOUC guard: set data-theme synchronously before paint. Default
            is dark — only flip to light if the user has explicitly chosen it
            in localStorage. Mounted via dangerouslySetInnerHTML so it ships
            inline (no extra request) and runs before the body renders. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INLINE_SCRIPT }} />
      </head>
      <body className="font-sans" suppressHydrationWarning>
        <Analytics />
        <SpeedInsights />
        <VercelAnalytics />
        <ThemeProvider>
          <QueryProvider>
            <Providers initialAppUser={initialAppUser}>
              <AnalyticsWrapper>{children}</AnalyticsWrapper>
            </Providers>
          </QueryProvider>
          <ThemeToggle />
        </ThemeProvider>
        <ToastContainer />
      </body>
    </html>
  )
}
