'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'

function ResetPasswordPageInner() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    // Check if we have the necessary hash in the URL (Supabase adds this)
    const hash = window.location.hash
    if (!hash || !hash.includes('access_token')) {
      setError('Invalid or expired reset link. Please request a new password reset.')
    }
  }, [])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)

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
      const { error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) {
        setError(error.message)
        setIsLoading(false)
      } else {
        setMessage('Password updated successfully! Redirecting to login...')
        setTimeout(() => {
          router.push('/login')
        }, 2000)
      }
    } catch (error: any) {
      console.error('Error resetting password:', error)
      setError(error.message || 'An error occurred')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-primary-dark flex flex-col relative overflow-hidden">
      {/* Top Navigation Bar */}
      <nav className="relative z-10 w-full px-6 py-6 border-b border-gray-800">
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
              className="text-sm font-light transition-colors text-gray-400 hover:text-white"
            >
              Home
            </Link>
            <Link 
              href="/login"
              className="text-sm font-light transition-colors text-gray-400 hover:text-white"
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
            <h1 className="text-4xl md:text-5xl font-light text-white mb-3 text-center tracking-tight">
              Reset Password
            </h1>
            <p className="text-gray-400 mb-12 text-center font-light">
              Enter your new password
            </p>

            {/* Reset Password Form */}
            <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-10 w-full">
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-light text-gray-300 mb-2">
                    New Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors font-light"
                    placeholder="Enter new password (min. 6 characters)"
                    disabled={isLoading}
                    minLength={6}
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-light text-gray-300 mb-2">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors font-light"
                    placeholder="Confirm new password"
                    disabled={isLoading}
                    minLength={6}
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
                  className="w-full px-6 py-3 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-light"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  ) : (
                    'Reset Password'
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  href="/login"
                  className="text-sm text-gray-400 hover:text-white transition-colors font-light"
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
        <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ResetPasswordPageInner />
    </Suspense>
  )
}
