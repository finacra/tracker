'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

export default function Header() {
  const [showNotifications, setShowNotifications] = useState(false)
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const { user, signOut } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  // Check if user is superadmin with retry logic and comprehensive logging
  useEffect(() => {
    let isMounted = true
    let retryCount = 0
    const maxRetries = 3
    const retryDelay = 1000 // 1 second

    async function checkSuperadmin() {
      if (!user) {
        console.log('[Header] No user, setting superadmin to false')
        if (isMounted) setIsSuperadmin(false)
        return
      }

      const attemptCheck = async (attempt: number): Promise<void> => {
        try {
          console.log(`[Header] Checking superadmin status (attempt ${attempt + 1}/${maxRetries + 1}) for user:`, user.id)
          
          // Use RPC function if available, otherwise fallback to direct query
          // First try using the helper function via RPC
          const { data: rpcData, error: rpcError } = await supabase.rpc('is_superadmin', {
            p_user_id: user.id
          })

          if (!rpcError && rpcData !== null) {
            console.log('[Header] RPC result:', rpcData)
            if (isMounted) setIsSuperadmin(!!rpcData)
            return
          }

          // Fallback: Query user_roles directly (should work with "Users can view their own roles" policy)
          console.log('[Header] RPC failed, falling back to direct query. Error:', rpcError)
          const { data, error } = await supabase
            .from('user_roles')
            .select('role, company_id')
            .eq('user_id', user.id)
            .eq('role', 'superadmin')

          if (error) {
            console.error(`[Header] Query error (attempt ${attempt + 1}):`, error)
            throw error
          }

          console.log('[Header] Query result:', data)
          const isPlatformSuperadmin = data && data.some(role => role.company_id === null)
          console.log('[Header] Is platform superadmin:', isPlatformSuperadmin)
          
          if (isMounted) setIsSuperadmin(!!isPlatformSuperadmin)
        } catch (error: any) {
          console.error(`[Header] Error checking superadmin (attempt ${attempt + 1}):`, error)
          
          if (attempt < maxRetries && isMounted) {
            console.log(`[Header] Retrying in ${retryDelay}ms...`)
            await new Promise(resolve => setTimeout(resolve, retryDelay))
            return attemptCheck(attempt + 1)
          } else {
            console.error('[Header] Max retries reached, setting superadmin to false')
            if (isMounted) setIsSuperadmin(false)
          }
        }
      }

      await attemptCheck(0)
    }

    checkSuperadmin()

    return () => {
      isMounted = false
    }
  }, [user, supabase])

  const handleSignOut = async () => {
    await signOut()
    router.push('/')
  }

  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0].toUpperCase() || 'U'

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const userEmail = user?.email || ''

  return (
    <header className="bg-primary-dark-card border-b border-gray-800 sticky top-0 z-50">
      <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary-orange rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-primary-orange/30 flex-shrink-0">
              <svg
                width="16"
                height="16"
                className="sm:w-5 sm:h-5"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
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
            <div>
              <div className="text-white font-medium text-sm sm:text-base md:text-lg">
                Finnovate <span className="bg-primary-orange text-white px-1 py-0.5 rounded text-[10px] sm:text-xs md:text-sm">AI</span>
              </div>
              <div className="text-gray-400 text-[10px] sm:text-xs">Smart Compliance</div>
            </div>
          </div>

          {/* Navigation (Desktop) */}
          <nav className="hidden md:flex items-center gap-6">
            <a href="/data-room" className="text-white font-medium border-b-2 border-primary-orange pb-1">
              Data Room
            </a>
            <a href="/dashboard" className="text-gray-400 hover:text-white transition-colors">
              Dashboard
            </a>
            {isSuperadmin && (
              <a href="/admin" className="text-gray-400 hover:text-white transition-colors">
                Admin
              </a>
            )}
            <a href="#" className="text-gray-400 hover:text-white transition-colors">
              Reports
            </a>
            <a href="#" className="text-gray-400 hover:text-white transition-colors">
              Analytics
            </a>
            <a href="/team" className="text-gray-400 hover:text-white transition-colors">
              Team
            </a>
            <a href="#" className="text-gray-400 hover:text-white transition-colors">
              Help
            </a>
          </nav>

          {/* Right Side - Notifications, Hamburger Menu, and Profile */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Notifications (Desktop Only) */}
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="hidden md:block relative p-1.5 sm:p-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg
                width="18"
                height="18"
                className="sm:w-5 sm:h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>

            {/* Hamburger Menu Button (Mobile Only) */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-gray-400 hover:text-white transition-colors"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>

            {/* User Profile */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary-orange rounded-full flex items-center justify-center text-white font-medium text-xs sm:text-sm">
                {userInitials}
              </div>
              <div className="hidden lg:block">
                <div className="text-white text-sm font-medium">{userName}</div>
                <div className="text-gray-400 text-xs">{userEmail}</div>
              </div>
              <button
                onClick={handleSignOut}
                className="hidden sm:block ml-2 px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                title="Sign out"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          {/* Mobile Menu */}
          <div className="fixed top-0 left-0 h-full w-64 bg-primary-dark-card border-r border-gray-800 z-50 md:hidden shadow-2xl">
            <div className="flex flex-col h-full">
              {/* Mobile Menu Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary-orange rounded-lg flex items-center justify-center shadow-lg shadow-primary-orange/30">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
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
                    </svg>
                  </div>
                  <div className="text-white font-medium text-sm">
                    Finnovate <span className="bg-primary-orange text-white px-1 py-0.5 rounded text-xs">AI</span>
                  </div>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Close menu"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Mobile Navigation Links */}
              <nav className="flex-1 overflow-y-auto p-4 space-y-2">
                <a
                  href="/data-room"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-white font-medium bg-primary-orange/20 border border-primary-orange/30 rounded-lg"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Data Room
                </a>
                <a
                  href="/dashboard"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                  Dashboard
                </a>
                {isSuperadmin && (
                  <a
                    href="/admin"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    Admin
                  </a>
                )}
                <a
                  href="#"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  Reports
                </a>
                <a
                  href="#"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                  Analytics
                </a>
                <a
                  href="/team"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Team
                </a>
                <a
                  href="#"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Help
                </a>
              </nav>

              {/* Mobile Menu Footer - User Info */}
              <div className="border-t border-gray-800 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-primary-orange rounded-full flex items-center justify-center text-white font-medium text-sm">
                    {userInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium truncate">{userName}</div>
                    <div className="text-gray-400 text-xs truncate">{userEmail}</div>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setIsMobileMenuOpen(false)
                    await handleSignOut()
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  )
}
