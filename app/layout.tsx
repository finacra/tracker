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

export const metadata: Metadata = {
  title: 'Finacra - Financial Compliance Management',
  description: 'Sign in to manage your financial compliance',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
            <Providers>
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
