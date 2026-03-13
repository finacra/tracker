'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const [isResending, setIsResending] = useState(false)
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const hasVerifiedRef = useRef(false)

  const success = searchParams.get('success') === 'true'
  const email = searchParams.get('email')
  const token = searchParams.get('token')

  useEffect(() => {
    // If token is provided and we haven't verified yet, verify it
    if (token && !success && !hasVerifiedRef.current && !isVerifying) {
      hasVerifiedRef.current = true
      setIsVerifying(true)
      verifyToken(token)
    }
  }, [token, success, isVerifying])

  const verifyToken = async (verificationToken: string) => {
    try {
      const response = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}`, {
        headers: {
          'Accept': 'application/json',
        },
      })
      
      if (response.ok) {
        const data = await response.json()
        // Update URL to show success
        const url = new URL(window.location.href)
        url.searchParams.set('success', 'true')
        if (data.email) {
          url.searchParams.set('email', data.email)
        }
        url.searchParams.delete('token')
        router.replace(url.pathname + url.search)
      } else {
        const data = await response.json()
        setResendMessage(data.error || 'Verification failed')
        setIsVerifying(false)
        hasVerifiedRef.current = false // Allow retry
      }
    } catch (error) {
      console.error('Error verifying email:', error)
      setResendMessage('Failed to verify email. Please try again.')
      setIsVerifying(false)
      hasVerifiedRef.current = false // Allow retry
    }
  }

  const handleResend = async () => {
    if (!user?.id) {
      setResendMessage('Please log in to resend verification email')
      return
    }

    setIsResending(true)
    setResendMessage(null)

    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })

      const data = await response.json()

      if (data.success) {
        setResendMessage('Verification email sent! Please check your inbox.')
      } else {
        setResendMessage(data.error || 'Failed to resend verification email')
      }
    } catch (error) {
      console.error('Error resending verification email:', error)
      setResendMessage('Failed to resend verification email. Please try again.')
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="min-h-screen bg-primary-dark flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-8">
          {success ? (
            <>
              <div className="flex items-center justify-center mb-6">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-green-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-bold text-white text-center mb-4">
                Email Verified!
              </h1>
              <p className="text-gray-400 text-center mb-6">
                {email
                  ? `Your email ${email} has been successfully verified.`
                  : 'Your email has been successfully verified.'}
              </p>
              <div className="space-y-3">
                <Link
                  href="/subscribe"
                  className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-center py-3 px-4 rounded-lg font-medium transition-colors"
                >
                  Continue to Subscription
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center mb-6">
                <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-yellow-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-bold text-white text-center mb-4">
                {isVerifying ? 'Verifying Email...' : 'Verify Your Email'}
              </h1>
              <p className="text-gray-400 text-center mb-6">
                {isVerifying
                  ? 'Please wait while we verify your email address...'
                  : "We've sent a verification link to your email address. Please check your inbox and click the link to verify your account."}
              </p>

              {resendMessage && (
                <div
                  className={`mb-4 p-3 rounded-lg text-sm ${
                    resendMessage.includes('sent')
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {resendMessage}
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={handleResend}
                  disabled={isResending}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-medium transition-colors"
                >
                  {isResending ? 'Sending...' : 'Resend Verification Email'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-primary-dark flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-8">
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-yellow-400 animate-spin"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white text-center mb-4">
              Loading...
            </h1>
          </div>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}
