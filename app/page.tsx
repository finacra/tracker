'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'

function LoginPageInner() {
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'login' | 'home' | 'privacy' | 'terms'>('login')
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  
  // Get returnTo from URL params for deep linking (e.g., invite acceptance)
  const returnTo = searchParams.get('returnTo')

  // Force navigation using window.location with absolute URL
  const navigateTo = (path: string, e?: React.MouseEvent) => {
    console.log('🔵 [NAVIGATION] ====== NAVIGATION STARTED ======')
    console.log('🔵 [NAVIGATION] Path:', path)
    console.log('🔵 [NAVIGATION] Event:', e)
    
    if (e) {
      e.preventDefault()
      e.stopPropagation()
      e.nativeEvent.stopImmediatePropagation()
    }
    
    const absoluteUrl = window.location.origin + path
    console.log('🔵 [NAVIGATION] Absolute URL:', absoluteUrl)
    console.log('🔵 [NAVIGATION] About to navigate...')
    
    // Force immediate navigation without any delays
    window.location.href = absoluteUrl
    console.log('✅ [NAVIGATION] window.location.href set')
    
    // Backup: force reload if href doesn't work
    setTimeout(() => {
      if (window.location.pathname !== path) {
        console.log('⚠️ [NAVIGATION] Path not changed, forcing reload')
        window.location.reload()
      }
    }, 100)
  }

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
      <nav className="w-full px-6 py-4 flex items-center justify-between border-b border-gray-800/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Outer circle */}
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="#1E3A5F"
                strokeWidth="2"
                fill="none"
              />
              {/* Inner overlapping circle */}
              <circle
                cx="12"
                cy="12"
                r="7"
                stroke="#1E3A5F"
                strokeWidth="1.5"
                fill="none"
                opacity="0.8"
              />
            </svg>
          </div>
          <span className="text-white text-lg font-light">Finacra</span>
        </div>
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setActiveTab('login')}
            className={`text-sm font-medium transition-colors pb-2 ${activeTab === 'login' ? 'text-white border-b-2 border-white/30' : 'text-gray-400 hover:text-white'}`}
          >
            Login
          </button>
          <button 
            onClick={() => setActiveTab('home')}
            className={`text-sm font-medium transition-colors pb-2 ${activeTab === 'home' ? 'text-primary-orange border-b-2 border-primary-orange' : 'text-gray-400 hover:text-white'}`}
          >
            Home
          </button>
          <button 
            onClick={() => setActiveTab('privacy')}
            className={`text-sm font-medium transition-colors pb-2 ${activeTab === 'privacy' ? 'text-primary-orange border-b-2 border-primary-orange' : 'text-gray-400 hover:text-white'}`}
          >
            Privacy
          </button>
          <button 
            onClick={() => setActiveTab('terms')}
            className={`text-sm font-medium transition-colors pb-2 ${activeTab === 'terms' ? 'text-primary-orange border-b-2 border-primary-orange' : 'text-gray-400 hover:text-white'}`}
          >
            Terms
          </button>
        </div>
      </nav>

      {/* Content - Tabbed Interface */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'login' && (
          <div className="flex items-center justify-center px-4 py-8">
      <div className="relative z-10 w-full max-w-md">
        {/* Logo Icon */}
        <div className="mb-8 flex justify-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Outer circle */}
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="#1E3A5F"
                strokeWidth="2"
                fill="none"
              />
              {/* Inner overlapping circle (slightly offset) */}
              <circle
                cx="12"
                cy="12"
                r="7"
                stroke="#1E3A5F"
                strokeWidth="1.5"
                fill="none"
                opacity="0.8"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-5xl font-thin text-white mb-2 text-center tracking-tight">
          Welcome to{' '}
          <span className="text-white inline-flex items-baseline gap-1">
            <span className="font-light">Finacra</span>
          </span>
        </h1>
        <p className="text-gray-400 mb-12 text-center">
          Sign in to manage your financial compliance
        </p>

        {/* Sign-in Card */}
        <div className="bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-8 w-full backdrop-blur-sm">
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
        <div className="mt-8 space-y-4">
          <p className="text-sm text-gray-500 text-center">
          By signing in, you agree to our{' '}
            <button
              onClick={(e) => {
                console.log('🖱️ [BUTTON] Terms footer link clicked!')
                navigateTo('/terms-of-service', e)
              }}
              className="text-primary-orange hover:text-primary-orange/80 underline transition-colors cursor-pointer"
              type="button"
          >
            Terms of Service
            </button>{' '}
          and{' '}
            <button
              onClick={(e) => {
                console.log('🖱️ [BUTTON] Privacy footer link clicked!')
                navigateTo('/privacy-policy', e)
              }}
              className="text-primary-orange hover:text-primary-orange/80 underline transition-colors cursor-pointer"
              type="button"
          >
            Privacy Policy
            </button>
          </p>
          <div className="flex items-center justify-center gap-4 text-sm">
            <button
              onClick={(e) => {
                console.log('🖱️ [BUTTON] Learn More clicked!')
                navigateTo('/home', e)
              }}
              className="text-gray-400 hover:text-primary-orange transition-colors cursor-pointer"
              type="button"
            >
              Learn More
            </button>
            <span className="text-gray-600">•</span>
            <button
              onClick={(e) => {
                console.log('🖱️ [BUTTON] Privacy footer clicked!')
                navigateTo('/privacy-policy', e)
              }}
              className="text-gray-400 hover:text-primary-orange transition-colors cursor-pointer"
              type="button"
            >
              Privacy
            </button>
            <span className="text-gray-600">•</span>
            <button
              onClick={(e) => {
                console.log('🖱️ [BUTTON] Terms footer clicked!')
                navigateTo('/terms-of-service', e)
              }}
              className="text-gray-400 hover:text-primary-orange transition-colors cursor-pointer"
              type="button"
            >
              Terms
            </button>
          </div>
        </div>
      </div>
      </div>
        )}

        {activeTab === 'home' && (
          <div className="max-w-6xl mx-auto px-6 py-12">
            <div className="mb-8 flex justify-center">
              <div className="w-24 h-24 bg-gradient-to-br from-primary-orange to-orange-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-primary-orange/40">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
                  <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="white" strokeWidth="1.5" fill="white" fillOpacity="0.1"/>
                  <path d="M14 2V8H20" stroke="white" strokeWidth="1.5"/>
                </svg>
              </div>
            </div>
            <h1 className="text-6xl md:text-8xl font-thin text-white mb-6 tracking-tight text-center">
              Welcome to{' '}
              <span className="text-white inline-flex items-baseline gap-2">
                <span className="font-light">Finacra</span>
                <span className="bg-gradient-to-r from-primary-orange to-orange-600 text-white px-4 py-2 rounded-xl font-light shadow-lg">AI</span>
              </span>
            </h1>
            <p className="text-2xl md:text-4xl text-gray-300 mb-4 font-light text-center">Intelligent Financial Compliance Management</p>
            <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-3xl mx-auto text-center leading-relaxed">
              Streamline your regulatory compliance, track deadlines, manage documents, and stay ahead of financial obligations with AI-powered insights.
            </p>
            <div className="grid md:grid-cols-3 gap-8 mt-20">
              <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-2xl p-8">
                <div className="w-14 h-14 bg-gradient-to-br from-primary-orange/30 to-orange-600/30 rounded-xl flex items-center justify-center mb-6">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-primary-orange">
                    <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold text-white mb-4">Compliance Tracking</h3>
                <p className="text-gray-400 leading-relaxed">Never miss a deadline. Track all your regulatory requirements, from Income Tax to GST to ROC filings, all in one centralized dashboard.</p>
              </div>
              <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-2xl p-8">
                <div className="w-14 h-14 bg-gradient-to-br from-primary-orange/30 to-orange-600/30 rounded-xl flex items-center justify-center mb-6">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-primary-orange">
                    <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold text-white mb-4">Smart Reports</h3>
                <p className="text-gray-400 leading-relaxed">Generate comprehensive compliance reports with AI-powered insights, penalty calculations, and business impact analysis.</p>
              </div>
              <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-2xl p-8">
                <div className="w-14 h-14 bg-gradient-to-br from-primary-orange/30 to-orange-600/30 rounded-xl flex items-center justify-center mb-6">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-primary-orange">
                    <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.976 17.0657 20.1235 17.2863 20.2241 17.5291C20.3248 17.7719 20.3766 18.0322 20.3766 18.295C20.3766 18.5578 20.3248 18.8181 20.2241 19.0609C20.1235 19.3037 19.976 19.5243 19.79 19.71C19.6043 19.896 19.3837 20.0435 19.1409 20.1441C18.8981 20.2448 18.6378 20.2966 18.375 20.2966C18.1122 20.2966 17.8519 20.2448 17.6091 20.1441C17.3663 20.0435 17.1457 19.896 16.96 19.71L16.9 19.65C16.6643 19.4195 16.365 19.2648 16.0406 19.206C15.7162 19.1472 15.3816 19.1869 15.08 19.32C14.7842 19.4468 14.532 19.6572 14.3543 19.9255C14.1766 20.1938 14.0813 20.5082 14.08 20.83V21C14.08 21.5304 13.8693 22.0391 13.4942 22.4142C13.1191 22.7893 12.6104 23 12.08 23C11.5496 23 11.0409 22.7893 10.6658 22.4142C10.2907 22.0391 10.08 21.5304 10.08 21V20.91C10.0723 20.579 9.96512 20.258 9.77251 19.9887C9.5799 19.7194 9.31074 19.5143 9 19.4C8.69838 19.2669 8.36381 19.2272 8.03941 19.286C7.71502 19.3448 7.41568 19.4995 7.18 19.73L7.12 19.79C6.93425 19.976 6.71368 20.1235 6.47088 20.2241C6.22808 20.3248 5.96783 20.2966 5.705 20.2966C5.44217 20.2966 5.18192 20.2448 4.93912 20.1441C4.69632 20.0435 4.47575 19.896 4.29 19.71C4.10405 19.5243 3.95653 19.3037 3.85588 19.0609C3.75523 18.8181 3.70343 18.5578 3.70343 18.295C3.70343 18.0322 3.75523 17.7719 3.85588 17.5291C3.95653 17.2863 4.10405 17.0657 4.29 16.88L4.35 16.82C4.58054 16.5843 4.73519 16.285 4.794 15.9606C4.85282 15.6362 4.81312 15.3016 4.68 15C4.55324 14.7042 4.34276 14.452 4.07447 14.2743C3.80618 14.0966 3.49179 14.0013 3.17 14H3C2.46957 14 1.96086 13.7893 1.58579 13.4142C1.21071 13.0391 1 12.5304 1 12C1 11.4696 1.21071 10.9609 1.58579 10.5858C1.96086 10.2107 2.46957 10 3 10H3.09C3.42099 9.99231 3.742 9.88512 4.01131 9.69251C4.28062 9.4999 4.48574 9.23074 4.6 8.92C4.73312 8.61838 4.77282 8.28381 4.714 7.95941C4.65519 7.63502 4.50054 7.33568 4.27 7.1L4.21 7.04C4.02405 6.85425 3.87653 6.63368 3.77588 6.39088C3.67523 6.14808 3.62343 5.88783 3.62343 5.625C3.62343 5.36217 3.67523 5.10192 3.77588 4.85912C3.87653 4.61632 4.02405 4.39575 4.21 4.21C4.39575 4.02405 4.61632 3.87653 4.85912 3.77588C5.10192 3.67523 5.36217 3.62343 5.625 3.62343C5.88783 3.62343 6.14808 3.67523 6.39088 3.77588C6.63368 3.87653 6.85425 4.02405 7.04 4.21L7.1 4.27C7.33568 4.50054 7.63502 4.65519 7.95941 4.714C8.28381 4.77282 8.61838 4.73312 8.92 4.6H9C9.29577 4.47324 9.54802 4.26276 9.72569 3.99447C9.90337 3.72618 9.99872 3.41179 10 3.09V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.09C14.0013 3.41179 14.0966 3.72618 14.2743 3.99447C14.452 4.26276 14.7042 4.47324 15 4.6C15.3016 4.73312 15.6362 4.77282 15.9606 4.714C16.285 4.65519 16.5843 4.50054 16.82 4.27L16.88 4.21C17.0657 4.02405 17.2863 3.87653 17.5291 3.77588C17.7719 3.67523 18.0322 3.62343 18.295 3.62343C18.5578 3.62343 18.8181 3.67523 19.0609 3.77588C19.3037 3.87653 19.5243 4.02405 19.71 4.21C19.896 4.39575 20.0435 4.61632 20.1441 4.85912C20.2448 5.10192 20.2966 5.36217 20.2966 5.625C20.2966 5.88783 20.2448 6.14808 20.1441 6.39088C20.0435 6.63368 19.896 6.85425 19.71 7.04L19.65 7.1C19.4195 7.33568 19.2648 7.63502 19.206 7.95941C19.1472 8.28381 19.1869 8.61838 19.32 8.92V9C19.4468 9.29577 19.6572 9.54802 19.9255 9.72569C20.1938 9.90337 20.5082 9.99872 20.83 10H21C21.5304 10 22.0391 10.2107 22.4142 10.5858C22.7893 10.9609 23 11.4696 23 12C23 12.5304 22.7893 13.0391 22.4142 13.4142C22.0391 13.7893 21.5304 14 21 14H20.91C20.5882 14.0013 20.2738 14.0966 20.0055 14.2743C19.7372 14.452 19.5268 14.7042 19.4 15Z" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold text-white mb-4">Document Vault</h3>
                <p className="text-gray-400 leading-relaxed">Securely store and organize all your compliance documents in one centralized, searchable vault with advanced encryption.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="max-w-4xl mx-auto px-6 py-12">
            <h1 className="text-5xl font-light text-white mb-8">Privacy Policy</h1>
            <p className="text-gray-400 text-lg mb-8">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            <div className="space-y-8 bg-gradient-to-br from-white/10 to-white/5 p-8 md:p-12 rounded-2xl border border-white/20">
              <section>
                <h2 className="text-3xl font-semibold text-white mb-4">1. Introduction</h2>
                <p className="text-gray-300 leading-relaxed text-lg">
                  Welcome to <span className="text-primary-navy font-medium">Finacra</span> ("we," "our," or "us"). We respect your privacy and are committed to protecting your personal data.
                </p>
              </section>
              <section className="pt-8 border-t border-gray-800">
                <h2 className="text-3xl font-semibold text-white mb-4">2. The Data We Collect</h2>
                <p className="text-gray-300 leading-relaxed text-lg mb-4">We may collect, use, store and transfer different kinds of personal data about you:</p>
                <div className="space-y-4">
                  <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-800">
                    <h3 className="text-xl font-semibold text-white mb-2">Identity Data</h3>
                    <p className="text-gray-400">Includes first name, last name, username, company name, and director information.</p>
                  </div>
                  <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-800">
                    <h3 className="text-xl font-semibold text-white mb-2">Contact Data</h3>
                    <p className="text-gray-400">Includes email address, telephone numbers, and postal addresses.</p>
                  </div>
                </div>
              </section>
              <section className="pt-8 border-t border-gray-800">
                <h2 className="text-3xl font-semibold text-white mb-4">3. How We Use Your Data</h2>
                <p className="text-gray-300 leading-relaxed text-lg">We will only use your personal data when the law allows us to.</p>
              </section>
              <section className="pt-8 border-t border-gray-800">
                <h2 className="text-3xl font-semibold text-white mb-4">4. Contact Us</h2>
                <p className="text-gray-300 leading-relaxed text-lg">If you have any questions, please contact us at:</p>
                <div className="bg-gradient-to-r from-primary-orange/10 to-orange-600/10 border border-primary-orange/30 p-6 rounded-xl mt-4">
                  <a href="mailto:support@finacra.com" className="text-primary-navy hover:text-primary-navy/80 text-lg">support@finacra.com</a>
                </div>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'terms' && (
          <div className="max-w-4xl mx-auto px-6 py-12">
            <h1 className="text-5xl font-light text-white mb-8">Terms of Service</h1>
            <p className="text-gray-400 text-lg mb-8">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            <div className="space-y-8 bg-gradient-to-br from-white/10 to-white/5 p-8 md:p-12 rounded-2xl border border-white/20">
              <section>
                <h2 className="text-3xl font-semibold text-white mb-4">1. Agreement to Terms</h2>
                <p className="text-gray-300 leading-relaxed text-lg">
                  By accessing our website and using our services, you agree to be bound by these Terms of Service and to comply with all applicable laws and regulations.
                </p>
              </section>
              <section className="pt-8 border-t border-gray-800">
                <h2 className="text-3xl font-semibold text-white mb-4">2. Use License</h2>
                <p className="text-gray-300 leading-relaxed text-lg">Permission is granted to temporarily download one copy of the materials on Finacra's website for personal, non-commercial transitory viewing only.</p>
              </section>
              <section className="pt-8 border-t border-gray-800">
                <h2 className="text-3xl font-semibold text-white mb-4">3. Disclaimer</h2>
                <p className="text-gray-300 leading-relaxed text-lg">The materials on Finacra's website are provided on an 'as is' basis.</p>
              </section>
              <section className="pt-8 border-t border-gray-800">
                <h2 className="text-3xl font-semibold text-white mb-4">4. Contact Us</h2>
                <p className="text-gray-300 leading-relaxed text-lg">If you have any questions, please contact us at:</p>
                <div className="bg-gradient-to-r from-primary-orange/10 to-orange-600/10 border border-primary-orange/30 p-6 rounded-xl mt-4">
                  <a href="mailto:support@finacra.com" className="text-primary-navy hover:text-primary-navy/80 text-lg">support@finacra.com</a>
                </div>
              </section>
            </div>
          </div>
        )}
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
