'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import CircuitBackground from '@/components/CircuitBackground'
import { createClient } from '@/utils/supabase/client'

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Check if user is already logged in
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
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
        
        if (hasCompanies) {
          router.push('/data-room')
        } else {
          router.push('/onboarding')
        }
      }
    }
    checkSession()
  }, [router, supabase])

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
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
    <div className="min-h-screen bg-primary-dark flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Circuit Board Background */}
      <CircuitBackground />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo Icon */}
        <div className="mb-8 flex justify-center">
          <div className="w-16 h-16 bg-primary-orange rounded-xl flex items-center justify-center shadow-lg shadow-primary-orange/30">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-white"
            >
              <path
                d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="white"
                fillOpacity="0.1"
              />
              <path
                d="M14 2V8H20"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line
                x1="8"
                y1="11"
                x2="16"
                y2="11"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <line
                x1="8"
                y1="14"
                x2="16"
                y2="14"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <line
                x1="8"
                y1="17"
                x2="16"
                y2="17"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-5xl font-thin text-white mb-2 text-center tracking-tight">
          Welcome to{' '}
          <span className="text-white inline-flex items-baseline gap-1">
            <span className="font-light">Finnovate</span>
            <span className="bg-primary-orange text-white px-2 py-0.5 rounded font-light">
              AI
            </span>
          </span>
        </h1>
        <p className="text-gray-400 mb-12 text-center">
          Sign in to manage your financial compliance
        </p>

        {/* Sign-in Card */}
        <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-8 w-full backdrop-blur-sm">
          {/* Google Sign-in Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 border-2 border-gray-700 rounded-xl hover:border-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-white hover:bg-gray-50 group"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-primary-orange border-t-transparent rounded-full animate-spin"></div>
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
                <span className="text-gray-700 font-medium text-base group-hover:text-gray-900">
                  Continue with Google
                </span>
              </>
            )}
          </button>

          {/* Info Text */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-400 mb-1">
              Secure sign-in with your Google account
            </p>
            <p className="text-sm text-gray-400">No password required!</p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-sm text-gray-500 text-center">
          By signing in, you agree to our{' '}
          <a
            href="#"
            className="text-primary-orange hover:text-primary-orange/80 underline"
          >
            Terms of Service
          </a>{' '}
          and{' '}
          <a
            href="#"
            className="text-primary-orange hover:text-primary-orange/80 underline"
          >
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  )
}
