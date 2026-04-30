'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function ResetPasswordPageInner() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Verify token on mount
    const token = searchParams.get('token')
    if (!token) {
      setError('Invalid reset link. Please request a new password reset.')
      setIsVerifying(false)
      return
    }

    async function verifyToken() {
      if (!token) {
        setError('No reset token provided')
        setIsVerifying(false)
        return
      }
      
      try {
        const response = await fetch(`/api/auth/passport/reset-password?token=${encodeURIComponent(token)}`)
        const data = await response.json()

        if (!data.success) {
          setError(data.error || 'Invalid or expired reset link. Please request a new password reset.')
        }
      } catch (error) {
        console.error('Error verifying token:', error)
        setError('Failed to verify reset link. Please try again.')
      } finally {
        setIsVerifying(false)
      }
    }

    verifyToken()
  }, [searchParams])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)

    const token = searchParams.get('token')
    if (!token) {
      setError('Invalid reset link')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/passport/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      const data = await response.json()

      if (data.success) {
        setMessage('Password updated successfully! Redirecting to login...')
        setTimeout(() => {
          router.push('/login')
        }, 2000)
      } else {
        setError(data.error || 'Failed to reset password')
      }
    } catch (error) {
      console.error('Error resetting password:', error)
      setError('Failed to reset password. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-primary-dark flex flex-col relative overflow-hidden">
      {/* Top Navigation Bar */}
      <nav className="relative z-10 w-full px-6 py-6 border-b border-line/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="https://aqziojkjtmyecfglifbc.supabase.co/storage/v1/object/public/logo/WhatsApp_Image_2026-02-09_at_18.02.02-removebg-preview.png"
              alt="Finacra Logo"
              className="h-8 w-auto sm:h-10 object-contain"
            />
          </div>
          <div className="flex items-center gap-8">
            <Link 
              href="/home"
              className="text-sm font-light transition-colors text-fg-muted hover:text-fg-primary"
            >
              Home
            </Link>
            <Link 
              href="/login"
              className="text-sm font-light transition-colors text-fg-muted hover:text-fg-primary"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-center px-4 py-20">
          <div className="relative z-10 w-full max-w-md">
            {/* Title */}
            <h1 className="text-4xl md:text-5xl font-light text-fg-primary mb-3 text-center tracking-tight">
              Reset Password
            </h1>
            <p className="text-fg-muted mb-12 text-center font-light">
              Enter your new password
            </p>

            {/* Reset Password Form */}
            <div className="bg-bg-card border border-line/10 rounded-xl p-10 w-full">
              {isVerifying ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-line/30 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-sm text-fg-muted font-light">Verifying reset link...</p>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-light text-fg-secondary mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full px-4 py-3 pr-12 bg-bg-card border border-line/15 rounded-lg text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-line/30 transition-colors font-light"
                      placeholder="Enter new password (min. 6 characters)"
                      disabled={isLoading || isVerifying}
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-primary transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
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
                  <label htmlFor="confirmPassword" className="block text-sm font-light text-fg-secondary mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="w-full px-4 py-3 pr-12 bg-bg-card border border-line/15 rounded-lg text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-line/30 transition-colors font-light"
                      placeholder="Confirm new password"
                      disabled={isLoading || isVerifying}
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-primary transition-colors"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
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
                  disabled={isLoading || isVerifying}
                  className="w-full px-6 py-3 bg-white text-fg-primary rounded-lg hover:bg-bg-elevated transition-all disabled:opacity-50 disabled:cursor-not-allowed font-light"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-line/30 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  ) : (
                    'Reset Password'
                  )}
                </button>
              </form>
              )}

              <div className="mt-6 text-center">
                <Link
                  href="/login"
                  className="text-sm text-fg-muted hover:text-fg-primary transition-colors font-light"
                >
                  ← Back to Sign In
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-line/30 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ResetPasswordPageInner />
    </Suspense>
  )
}
