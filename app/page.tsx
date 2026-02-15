'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'

function LoginPageInner() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  
  // Get returnTo from URL params for deep linking (e.g., invite acceptance)
  const returnTo = searchParams.get('returnTo')

  // Check if user is already logged in - ONLY on the root login page
  useEffect(() => {
    // ONLY run auth check on the root path
    if (typeof window === 'undefined' || window.location.pathname !== '/') {
      return
    }
    
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
    try {
      // Use returnTo if provided (deep linking), otherwise default to /onboarding
      const nextPath = returnTo || '/onboarding'
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      })
      
      if (error) {
        console.error('Error signing in:', error)
        setIsLoading(false)
      }
      // The redirect will happen automatically
    } catch (error) {
      console.error('Error signing in:', error)
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

          {/* Info Text */}
          <div className="mt-6 text-center">
                <p className="text-sm text-gray-400 mb-1 font-light">
              Secure sign-in with your Google account
            </p>
                <p className="text-sm text-gray-400 font-light">No password required!</p>
          </div>
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
