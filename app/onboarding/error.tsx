'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h1 className="text-2xl font-light text-fg-primary mb-2">Onboarding error</h1>
        <p className="text-fg-muted text-sm font-light mb-8 leading-relaxed">
          Something went wrong during onboarding. Your progress may be saved — try again or contact support if the issue persists.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#1E3A5F]/80 text-fg-primary text-sm font-medium transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-6 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-fg-secondary text-sm font-medium transition-colors"
          >
            Go to Home
          </Link>
        </div>

        {error.digest && (
          <p className="mt-6 text-fg-muted/60 text-xs font-mono">Error ID: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
