'use client'

import { useRouter } from 'next/navigation'
import CircuitBackground from '@/components/CircuitBackground'

export default function AuthCodeErrorPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-primary-dark flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <CircuitBackground />
      
      <div className="relative z-10 w-full max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-xl flex items-center justify-center">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-red-400"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        </div>
        
        <h1 className="text-3xl font-light text-white mb-4">
          Authentication Error
        </h1>
        <p className="text-gray-400 mb-8">
          There was an error during authentication. Please try signing in again.
        </p>
        
        <button
          onClick={() => router.push('/')}
          className="px-6 py-3 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors"
        >
          Return to Sign In
        </button>
      </div>
    </div>
  )
}
