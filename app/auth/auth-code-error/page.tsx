'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AuthCodeErrorPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-primary-dark flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="relative z-10 w-full max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-red-400"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        </div>
        
        <h1 className="text-4xl font-light text-white mb-4">
          Authentication Error
        </h1>
        <p className="text-gray-400 mb-8 font-light">
          There was an error during authentication. Please try signing in again.
        </p>
        
        <button
          onClick={() => router.push('/')}
          className="px-8 py-4 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors font-light"
        >
          Return to Sign In
        </button>
      </div>
    </div>
  )
}
