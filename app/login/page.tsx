'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'

function LoginPageInner() {
  const [isLoading, setIsLoading] = useState(false)
  const [isEmailMode, setIsEmailMode] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  
  // Get returnTo from URL params for deep linking (e.g., invite acceptance)
  const returnTo = searchParams.get('returnTo')

  // Check if user is already logged in
  useEffect(() => {
    let isMounted = true
    
    const checkSession = async () => {
      if (!isMounted) return
      
      console.log('🔍 [AUTH CHECK] Checking session on login page...')
      
      const { data: { session } } = await supabase.auth.getSession()
      console.log('🔍 [AUTH CHECK] Session exists:', !!session)
      
      if (!isMounted) return
      
      if (session) {
        // Check if user has companies (owned or via user_roles)
        const { data: ownedCompanies } = await supabase
          .from('companies')
          .select('id')
          .eq('user_id', session.user.id)
          .limit(1)
        
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('company_id')
          .eq('user_id', session.user.id)
          .not('company_id', 'is', null)
          .limit(1)
        
        const hasCompanies = (ownedCompanies && ownedCompanies.length > 0) || (userRoles && userRoles.length > 0)
        
        console.log('🔍 [AUTH CHECK] Has companies:', hasCompanies)
        
        if (!isMounted) return
        
        // If there's a returnTo parameter, redirect there (deep linking for invites, etc.)
        if (returnTo) {
          console.log('🔄 [AUTH CHECK] Redirecting to returnTo:', returnTo)
          router.push(returnTo)
        } else if (hasCompanies) {
          console.log('🔄 [AUTH CHECK] Redirecting to /data-room')
          router.push('/data-room')
        } else {
          console.log('🔄 [AUTH CHECK] Redirecting to /onboarding')
          router.push('/onboarding')
        }
      } else {
        console.log('✅ [AUTH CHECK] No session, staying on login page')
      }
    }
    
    checkSession()
    
    return () => {
      isMounted = false
    }
  }, [router, supabase, returnTo])

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Don't set a default next path - let the callback determine the appropriate redirect
      // based on whether user has companies or not
      const redirectTo = returnTo 
        ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}`
        : `${window.location.origin}/auth/callback`
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      })
      
      if (error) {
        console.error('Error signing in:', error)
        setError(error.message)
        setIsLoading(false)
      }
      // The redirect will happen automatically
    } catch (error: any) {
      console.error('Error signing in:', error)
      setError(error.message || 'An error occurred')
      setIsLoading(false)
    }
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (isSignUp) {
        // Sign up
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: returnTo 
              ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}`
              : `${window.location.origin}/auth/callback`,
          },
        })

        if (error) {
          setError(error.message)
          setIsLoading(false)
        } else {
          setMessage('Check your email to confirm your account!')
          setIsLoading(false)
        }
      } else {
        // Sign in
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          setError(error.message)
          setIsLoading(false)
        } else {
          // Redirect will be handled by the useEffect that checks session
          const redirectTo = returnTo || '/data-room'
          router.push(redirectTo)
        }
      }
    } catch (error: any) {
      console.error('Error with email auth:', error)
      setError(error.message || 'An error occurred')
      setIsLoading(false)
    }
  }

  const handlePasswordReset = async () => {
    if (!email) {
      setError('Please enter your email address first')
      return
    }

    setIsLoading(true)
    setError(null)
    setMessage(null)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (error) {
        setError(error.message)
        setIsLoading(false)
      } else {
        setMessage('Password reset email sent! Check your inbox.')
        setIsLoading(false)
      }
    } catch (error: any) {
      console.error('Error sending password reset:', error)
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
              href="/privacy-policy"
              className="text-sm font-light transition-colors text-gray-400 hover:text-white"
          >
            Privacy
            </Link>
            <Link 
              href="/terms-of-service"
              className="text-sm font-light transition-colors text-gray-400 hover:text-white"
          >
            Terms
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
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors font-light"
                    placeholder="Enter your password"
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
