'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function DataRoomError({
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>

        <h1 className="text-2xl font-light text-white mb-2">Failed to load Dashboard</h1>
        <p className="text-fg-muted text-sm font-light mb-8 leading-relaxed">
          We couldn't load your data room. This is usually a temporary issue — please try refreshing the page.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#1E3A5F]/80 text-white text-sm font-medium transition-colors"
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
