'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function GlobalError({
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h1 className="text-2xl font-light text-white mb-2">Something went wrong</h1>
        <p className="text-fg-muted text-sm font-light mb-8 leading-relaxed">
          An unexpected error occurred. Our team has been notified. You can try again or return to the dashboard.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#1E3A5F]/80 text-white text-sm font-medium transition-colors"
          >
            Try again
          </button>
          <Link
            href="/data-room"
            className="px-6 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-fg-secondary text-sm font-medium transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>

        {error.digest && (
          <p className="mt-6 text-fg-muted/60 text-xs font-mono">Error ID: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
