'use client'

import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

function ForgotPasswordPageInner() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (!email) {
      setError('Email is required')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/passport/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (data.success) {
        setMessage(data.message || 'If an account with that email exists, we\'ve sent a password reset link.')
      } else {
        setError(data.error || 'Failed to send reset email')
      }
    } catch (error) {
      console.error('Error requesting password reset:', error)
      setError('Failed to send reset email. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-primary-dark flex flex-col relative overflow-hidden">
      {/* Top Navigation Bar */}
      <nav className="relative z-10 w-full px-4 sm:px-6 py-4 sm:py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2">
            <img
              src="https://aqziojkjtmyecfglifbc.supabase.co/storage/v1/object/public/logo/WhatsApp_Image_2026-02-09_at_18.02.02-removebg-preview.png"
              alt="Finacra Logo"
              className="h-8 w-auto sm:h-10 object-contain"
            />
          </Link>
          <Link
            href="/login"
            className="text-sm font-light transition-colors text-fg-secondary hover:text-fg-primary"
          >
            Back to Login
          </Link>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-center px-4 py-20">
          <div className="relative z-10 w-full max-w-md">
            {/* Title */}
            <h1 className="text-4xl md:text-5xl font-light text-fg-primary mb-3 text-center tracking-tight">
              Forgot Password
            </h1>
            <p className="text-fg-muted mb-12 text-center font-light">
              Enter your email address and we'll send you a link to reset your password
            </p>

            {/* Form */}
            <div className="bg-bg-card border border-line/10 rounded-xl p-10 w-full">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-light text-fg-secondary mb-2">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-line/30 transition-colors font-light"
                    placeholder="your.email@example.com"
                    disabled={isLoading}
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
                    <p className="text-sm text-red-400 font-light">{error}</p>
                  </div>
                )}

                {message && (
                  <div className="p-3 bg-green-500/10 border border-green-500/50 rounded-lg">
                    <p className="text-sm text-green-400 font-light">{message}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full px-6 py-3 bg-white text-fg-primary rounded-lg hover:bg-bg-elevated transition-all disabled:opacity-50 disabled:cursor-not-allowed font-light"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-line/30 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
              </form>

              {/* Back to Login */}
              <div className="mt-6 text-center">
                <Link
                  href="/login"
                  className="text-sm text-fg-muted hover:text-fg-primary transition-colors font-light"
                >
                  ← Back to Login
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-orange border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ForgotPasswordPageInner />
    </Suspense>
  )
}
