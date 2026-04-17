import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
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

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700'],
  variable: '--font-poppins',
})

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
    <html lang="en">
      <body className={poppins.className} suppressHydrationWarning>
        <Analytics />
        <SpeedInsights />
        <VercelAnalytics />
        <QueryProvider>
          <Providers>
            <AnalyticsWrapper>{children}</AnalyticsWrapper>
          </Providers>
        </QueryProvider>
        <ToastContainer />
      </body>
    </html>
  )
}
