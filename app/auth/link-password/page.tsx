'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function LinkPasswordPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Missing verification token')
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!token) {
      setError('Missing verification token')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/auth/passport/link-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        setError(result.error || 'Failed to link password')
        setIsSubmitting(false)
        return
      }

      setSuccess(true)
      setIsSubmitting(false)

      // Redirect after a moment
      setTimeout(() => {
        router.push('/data-room')
      }, 2000)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to link password')
      setIsSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-8">
          <h1 className="text-2xl font-light text-white mb-2">Link Password</h1>
          <p className="text-sm text-red-400 mb-4">Missing verification token.</p>
          <Link
            href="/login"
            className="block w-full bg-primary-orange text-white px-4 py-2.5 rounded-lg hover:bg-primary-orange/90 transition-colors text-center"
          >
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-8">
          <h1 className="text-2xl font-light text-white mb-2">Password Linked!</h1>
          <p className="text-sm text-green-400 mb-4">
            Your password has been successfully linked to your account. Redirecting...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-primary-dark flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-8">
        <h1 className="text-2xl font-light text-white mb-2">Set Password</h1>
        <p className="text-sm text-gray-400 mb-6">
          Your email has been verified. Now set a password for your account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 pr-10 text-white focus:border-primary-orange focus:outline-none"
                placeholder="At least 6 characters"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L7.5 7.5m-1.21-1.21L3 3m4.29 4.29L7.5 7.5m0 0l3.29 3.29M7.5 7.5l3.29 3.29m0 0L15 15m-1.21-1.21L12 12m4.29 4.29L15 15m0 0l3.29 3.29M15 15l3.29 3.29M21 21l-3.29-3.29m0 0L15 15m3.29 3.29L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Confirm Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-primary-orange focus:outline-none"
              placeholder="Confirm your password"
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary-orange text-white px-4 py-2.5 rounded-lg hover:bg-primary-orange/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Linking password...' : 'Link Password'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LinkPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-orange border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LinkPasswordPageInner />
    </Suspense>
  )
}
