'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { resolvePostAuthRedirect } from '@/application/use-cases/navigation/resolvePostAuthRedirect'
import { getPostAuthDestination, getOAuthLoginUrl } from './actions'
import { useRotatingLoadingMessage } from '@/hooks/useRotatingLoadingMessage'
import { SIGN_IN_LOADING_MESSAGES } from '@/lib/ui/loading-messages'

function LoginPageInner() {
  const [isLoading, setIsLoading] = useState(false)
  const signInStatusMessage = useRotatingLoadingMessage({
    active: isLoading,
    messages: SIGN_IN_LOADING_MESSAGES,
    initialDelayMs: 600,
    intervalMs: 1800,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [isEmailMode, setIsEmailMode] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [requiresLinking, setRequiresLinking] = useState(false)
  const [linkingUserId, setLinkingUserId] = useState<string | null>(null)
  const [isSendingVerification, setIsSendingVerification] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Get returnTo from URL params for deep linking (e.g., invite acceptance)
  const returnTo = searchParams.get('returnTo')

  // Check if user is already logged in using Passport session API
  useEffect(() => {
    let isMounted = true
    
    const checkSession = async () => {
      if (!isMounted) return
      
      try {
        const res = await fetch('/api/auth/passport/session')
        const data = await res.json()
        const session = data?.session

        if (!isMounted) return

        // Redirect authenticated users to their destination
        // But first check if email is verified (for email/password users)
        if (session) {
          try {
            // Check email verification status
            const verifyRes = await fetch(`/api/auth/check-verification?userId=${session.appUserId}`)
            const verifyData = await verifyRes.json()

            // If email/password user and not verified, redirect to verify-email
            if (verifyData.requiresVerification && !verifyData.emailVerified) {
              window.location.href = '/verify-email'
              return
            }
          } catch (err) {
            console.error('Error checking email verification:', err)
            // Continue with normal redirect if check fails
          }

          const result = await getPostAuthDestination(session.appUserId)
          const baseDestination = result.success ? result.destination ?? '/subscribe' : '/subscribe'
          const destination = resolvePostAuthRedirect({
            baseDestination,
            overridePath: returnTo,
            allowOverrideForDataRoomUsers: true,
          })
          window.location.href = destination
        }
      } catch (err) {
        console.error('Error checking passport session:', err)
      }
    }
    
    checkSession()
    
    return () => {
      isMounted = false
    }
  }, [router, returnTo])

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Use AuthGateway interface to get OAuth URL
      const redirectTo = returnTo || undefined
      const result = await getOAuthLoginUrl('google', redirectTo)
      
      if (!result.success || !result.url) {
        setError(result.error || 'Failed to get OAuth login URL')
        setIsLoading(false)
        return
      }
      
      // Redirect to OAuth URL
      window.location.href = result.url
    } catch (error) {
      console.error('Error signing in:', error)
      const message = error instanceof Error ? error.message : 'An error occurred';
      if (message.includes('UnrecognizedActionError') || message.includes('404')) {
        window.location.reload();
        return;
      }
      setError(message)
      setIsLoading(false)
    }
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setMessage(null)

    try {
      const endpoint = isSignUp ? '/api/auth/passport/register' : '/api/auth/passport/login'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Authentication failed')
        setIsLoading(false)
        return
      }

      // Check if account linking is required
      if (result.requiresLinking && result.userId) {
        setRequiresLinking(true)
        setLinkingUserId(result.userId)
        setMessage(result.message || 'This email is already registered with Google.')
        setIsLoading(false)
        return
      }

      // Success! User is now logged in via Passport session cookie
      // If email not verified, redirect to verification page
      if (result.requiresVerification && !result.user.emailVerified) {
        window.location.href = '/verify-email'
        return
      }

      try {
        const destResult = await getPostAuthDestination(result.user.id)
        const baseDestination = destResult.success ? destResult.destination ?? '/subscribe' : '/subscribe';
        const redirectTo = resolvePostAuthRedirect({
          baseDestination,
          overridePath: returnTo,
          allowOverrideForDataRoomUsers: true,
        })
        window.location.href = redirectTo
      } catch (destErr) {
        console.error('Error resolving destination:', destErr)
        window.location.href = '/subscribe'
      }
    } catch (error) {
      console.error('Error with email auth:', error)
      setError(error instanceof Error ? error.message : 'An error occurred')
      setIsLoading(false)
    }
  }

  const handlePasswordReset = async () => {
    router.push('/forgot-password')
  }

  const handleSendLinkingVerification = async () => {
    if (!linkingUserId) return

    setIsSendingVerification(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: linkingUserId }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        setError(result.error || 'Failed to send verification email')
        setIsSendingVerification(false)
        return
      }

      setMessage('Verification email sent! Please check your inbox and click the link to verify your email, then you can set a password.')
      setIsSendingVerification(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to send verification email')
      setIsSendingVerification(false)
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
          <div className="hidden md:flex items-center gap-8">
            <Link 
              href="/home"
              className="text-sm font-light transition-colors text-gray-300 hover:text-white"
          >
            Home
            </Link>
            <Link 
              href="/privacy-policy"
              className="text-sm font-light transition-colors text-gray-300 hover:text-white"
          >
            Privacy
            </Link>
            <Link 
              href="/terms-of-service"
              className="text-sm font-light transition-colors text-gray-300 hover:text-white"
          >
            Terms
            </Link>
          </div>
          <div className="md:hidden">
            <Link 
              href="/home"
              className="text-sm font-light transition-colors text-gray-300 hover:text-white"
            >
              Home
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
              Welcome to Finacra
        </h1>
            <p className="text-gray-400 mb-12 text-center font-light">
          Sign in to manage your financial compliance
        </p>

        {/* Sign-in Card */}
            <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-10 w-full">
          {!isEmailMode ? (
            <>
              {/* Cinematic status banner — only visible during sign-in */}
              {isLoading && (
                <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-3 flex items-center gap-3">
                  <div className="relative flex h-2.5 w-2.5 flex-shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </div>
                  <span
                    key={signInStatusMessage}
                    className="text-xs text-emerald-200/90 font-light truncate"
                  >
                    {signInStatusMessage}
                  </span>
                </div>
              )}

              {/* Google Sign-in Button */}
              <button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 border border-gray-700 rounded-lg hover:border-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-white hover:bg-gray-50 group"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    {/* Google Logo */}
                    <svg width="20" height="20" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    <span className="text-gray-700 font-light text-base group-hover:text-gray-900">
                      Continue with Google
                    </span>
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-700"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-[#1a1a1a] text-gray-400 font-light">Or</span>
                </div>
              </div>

              {/* Email Sign-in Button */}
              <button
                onClick={() => setIsEmailMode(true)}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 border border-gray-700 rounded-lg hover:border-gray-600 hover:bg-gray-900/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-white font-light"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Continue with Email
              </button>

              {/* Info Text */}
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-400 mb-1 font-light">
                  Secure sign-in with your Google account
                </p>
                <p className="text-sm text-gray-400 font-light">No password required!</p>
              </div>
            </>
          ) : requiresLinking ? (
            <>
              {/* Account Linking UI */}
              <div className="space-y-4">
                <div className="p-4 bg-blue-500/10 border border-blue-500/50 rounded-lg">
                  <p className="text-sm text-blue-400 font-light mb-3">
                    This email is already registered with Google. To add a password to your account, we need to verify you own this email address.
                  </p>
                  <p className="text-sm text-gray-400 font-light">
                    We'll send a verification email to <strong className="text-white">{email}</strong>. After you verify your email, you can set a password.
                  </p>
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
                  onClick={handleSendLinkingVerification}
                  disabled={isSendingVerification}
                  className="w-full px-6 py-3 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-light"
                >
                  {isSendingVerification ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
                  ) : (
                    'Send Verification Email'
                  )}
                </button>

                <button
                  onClick={() => {
                    setRequiresLinking(false)
                    setLinkingUserId(null)
                    setError(null)
                    setMessage(null)
                    setPassword('')
                  }}
                  className="w-full px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-all font-light"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Email/Password Form */}
              <form onSubmit={handleEmailAuth} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-light text-gray-300 mb-2">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors font-light"
                    placeholder="your.email@example.com"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-light text-gray-300 mb-2">
                    Password
                  </label>
                  <div className="relative">
                  <input
                    id="password"
                      type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                      className="w-full px-4 py-3 pr-12 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors font-light"
                    placeholder="Enter your password"
                    disabled={isLoading}
                    minLength={6}
                  />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
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
                    isSignUp ? 'Sign Up' : 'Sign In'
                  )}
                </button>
              </form>

              {/* Toggle Sign Up/Sign In */}
              <div className="mt-4 text-center">
                <button
                  onClick={() => {
                    setIsSignUp(!isSignUp)
                    setError(null)
                    setMessage(null)
                  }}
                  className="text-sm text-gray-400 hover:text-white transition-colors font-light"
                >
                  {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                </button>
              </div>

              {/* Password Reset */}
              {!isSignUp && (
                <div className="mt-4 text-center">
                  <button
                    onClick={handlePasswordReset}
                    disabled={isLoading}
                    className="text-sm text-gray-400 hover:text-white transition-colors font-light disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Back to Google Sign-in */}
              <div className="mt-6 pt-6 border-t border-gray-800">
                <button
                  onClick={() => {
                    setIsEmailMode(false)
                    setError(null)
                    setMessage(null)
                    setEmail('')
                    setPassword('')
                    setIsSignUp(false)
                  }}
                  className="w-full text-sm text-gray-400 hover:text-white transition-colors font-light"
                >
                  ← Back to other sign-in options
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 space-y-4">
              <p className="text-sm text-gray-500 text-center font-light">
          By signing in, you agree to our{' '}
                <Link
                  href="/terms-of-service"
                  className="text-gray-400 hover:text-white transition-colors underline"
          >
            Terms of Service
                </Link>{' '}
          and{' '}
                <Link
                  href="/privacy-policy"
                  className="text-gray-400 hover:text-white transition-colors underline"
          >
            Privacy Policy
                </Link>
          </p>
          <div className="flex items-center justify-center gap-4 text-sm">
                <Link
                  href="/home"
                  className="text-gray-400 hover:text-white transition-colors font-light"
            >
              Learn More
                </Link>
            <span className="text-gray-600">•</span>
                <Link
                  href="/privacy-policy"
                  className="text-gray-400 hover:text-white transition-colors font-light"
            >
              Privacy
                </Link>
            <span className="text-gray-600">•</span>
                <Link
                  href="/terms-of-service"
                  className="text-gray-400 hover:text-white transition-colors font-light"
            >
              Terms
                </Link>
              </div>
            </div>
            </div>
          </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-orange border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginPageInner />
    </Suspense>
  )
}
