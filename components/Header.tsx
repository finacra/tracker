'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { getNotifications, markNotificationsRead, markAllNotificationsRead, type Notification } from '@/app/data-room/actions'

export default function Header() {
  const [showNotifications, setShowNotifications] = useState(false)
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false)
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null)
  const [showAllNotifications, setShowAllNotifications] = useState(false)
  const { user, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user) return
    
    setIsLoadingNotifications(true)
    try {
      const result = await getNotifications({ limit: 20 })
      if (result.success) {
        setNotifications(result.notifications || [])
        setUnreadCount(result.unreadCount || 0)
      }
    } catch (err) {
      console.error('[Header] Error fetching notifications:', err)
    } finally {
      setIsLoadingNotifications(false)
    }
  }, [user])

  // Fetch notifications on mount and periodically
  useEffect(() => {
    if (user) {
      fetchNotifications()
      // Poll every 30 seconds
      const interval = setInterval(fetchNotifications, 30000)
      return () => clearInterval(interval)
    }
  }, [user, fetchNotifications])

  // Mark notification as read
  const handleMarkRead = async (notificationId: string) => {
    const result = await markNotificationsRead(notificationId)
    if (result.success) {
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    }
  }

  // Mark all as read
  const handleMarkAllRead = async () => {
    const result = await markAllNotificationsRead()
    if (result.success) {
      setNotifications(prev => 
        prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      )
      setUnreadCount(0)
    }
  }

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
    <header className="bg-primary-dark border-b border-gray-800/50 sticky top-0 z-50" style={{ overflow: 'visible' }}>
      <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4" style={{ overflow: 'visible' }}>
        <div className="flex items-center justify-between" style={{ overflow: 'visible' }}>
          {/* Logo */}
          <Link href="/data-room" className="flex items-center">
              <img
                src="https://aqziojkjtmyecfglifbc.supabase.co/storage/v1/object/public/logo/WhatsApp_Image_2026-02-09_at_18.02.02-removebg-preview.png"
                alt="Finacra Logo"
                className="h-8 w-auto sm:h-10 object-contain"
              />
          </Link>

          {/* Navigation (Desktop) */}
          <nav className="hidden md:flex items-center gap-6">
            <a 
              href="/data-room" 
              className={`font-light pb-1 transition-colors ${
                pathname === '/data-room' 
                  ? 'text-white border-b-2 border-gray-600' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Data Room
            </a>
            {isSuperadmin && (
              <a 
                href="/admin" 
                className={`font-light transition-colors ${
                  pathname?.startsWith('/admin') 
                    ? 'text-white border-b-2 border-gray-600 pb-1' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Admin
              </a>
            )}
            <a 
              href="/team" 
              className={`font-light transition-colors ${
                pathname === '/team' 
                  ? 'text-white border-b-2 border-gray-600 pb-1' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Team
            </a>
          </nav>

          {/* Right Side - Notifications, Hamburger Menu, and Profile */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Notifications (Desktop Only) */}
            <div className="relative hidden md:block">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-1.5 sm:p-2 text-gray-400 hover:text-white transition-colors"
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
                {/* Unread Badge */}
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-gray-600 text-white text-[10px] font-light rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
            </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <>
                  {/* Backdrop */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowNotifications(false)} 
                  />
                  {/* Dropdown */}
                  <div className="absolute right-0 top-full mt-2 w-80 max-h-96 bg-[#1a1a1a] border border-gray-800 rounded-xl shadow-2xl z-50 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                      <h3 className="text-white font-light">Notifications</h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="text-xs text-gray-400 hover:text-white transition-colors font-light"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>

                    {/* Notification List */}
                    <div className="max-h-72 overflow-y-auto">
                      {isLoadingNotifications ? (
                        <div className="p-4 text-center text-gray-400">
                          <div className="animate-spin w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full mx-auto"></div>
                        </div>
                      ) : notifications.length === 0 ? (
                        <div className="p-6 text-center text-gray-400">
                          <svg className="w-12 h-12 mx-auto mb-2 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                          </svg>
                          <p className="text-sm font-light">No notifications yet</p>
                        </div>
                      ) : (
                        notifications.map((notification) => (
                          <div
                            key={notification.id}
                            onClick={() => {
                              if (!notification.is_read) handleMarkRead(notification.id)
                              setSelectedNotification(notification)
                              setShowNotifications(false)
                            }}
                            className={`px-4 py-3 border-b border-gray-800 cursor-pointer transition-colors ${
                              notification.is_read 
                                ? 'bg-transparent hover:bg-gray-900/50' 
                                : 'bg-gray-900/30 hover:bg-gray-900/50'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {/* Icon based on type */}
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                notification.type === 'missing_docs' 
                                  ? 'bg-yellow-500/20 text-yellow-400'
                                  : notification.type === 'status_change'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : notification.type === 'overdue'
                                  ? 'bg-red-500/20 text-red-400'
                                  : 'bg-gray-700 text-gray-400'
                              }`}>
                                {notification.type === 'missing_docs' ? (
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <path d="M12 9v4" />
                                    <path d="M12 17h.01" />
                                  </svg>
                                ) : notification.type === 'status_change' ? (
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="9 11 12 14 22 4" />
                                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                  </svg>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-light ${notification.is_read ? 'text-gray-300' : 'text-white'}`}>
                                  {notification.title}
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 font-light">
                                  {notification.message}
                                </p>
                                <p className="text-[10px] text-gray-500 mt-1 font-light">
                                  {new Date(notification.created_at).toLocaleString('en-GB', {
                                    day: 'numeric',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                              </div>
                              {/* Unread indicator */}
                              {!notification.is_read && (
                                <div className="w-2 h-2 bg-gray-400 rounded-full flex-shrink-0 mt-1.5"></div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Footer */}
                    {notifications.length > 0 && (
                      <div className="px-4 py-2 border-t border-gray-800">
                        <button
                          onClick={async () => {
                            setShowNotifications(false)
                            // Fetch all notifications (no limit)
                            const result = await getNotifications({ limit: 1000 })
                            if (result.success) {
                              setNotifications(result.notifications || [])
                              setShowAllNotifications(true)
                            }
                          }}
                          className="w-full text-center text-sm text-gray-400 hover:text-white transition-colors font-light"
                        >
                          View all in Data Room
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

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

            {/* User Profile with Dropdown */}
            <div className="relative" style={{ zIndex: 100 }}>
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  console.log('[Header] User menu clicked, current state:', showUserMenu)
                  const newState = !showUserMenu
                  setShowUserMenu(newState)
                  console.log('[Header] User menu state after toggle:', newState)
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  console.log('[Header] User menu mousedown')
                }}
                className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity cursor-pointer relative z-50"
                type="button"
                aria-expanded={showUserMenu}
                aria-haspopup="true"
                style={{ 
                  pointerEvents: 'auto',
                  zIndex: 100,
                  position: 'relative'
                }}
              >
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-800 border border-gray-700 rounded-full flex items-center justify-center text-white font-light text-xs sm:text-sm pointer-events-none">
                {userInitials}
              </div>
                <div className="hidden lg:block pointer-events-none">
                <div className="text-white text-sm font-light">{userName}</div>
                <div className="text-gray-400 text-xs font-light">{userEmail}</div>
              </div>
                <svg 
                  className={`w-4 h-4 text-gray-500 transition-transform pointer-events-none ${showUserMenu ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* User Menu Dropdown */}
              {showUserMenu && (
                <>
                  {/* Backdrop */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowUserMenu(false)
                    }} 
                  />
                  {/* Dropdown */}
                  <div 
                    className="absolute right-0 top-full mt-2 w-56 bg-[#1a1a1a] border border-gray-800 rounded-xl shadow-2xl z-[100] overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                    style={{ position: 'absolute' }}
                  >
                    <div className="p-2">
                      {/* Email Preferences */}
              <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowUserMenu(false)
                          router.push('/settings/email-preferences')
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-900/50 rounded-lg transition-colors text-left font-light"
                        type="button"
              >
                        <svg 
                          className="w-5 h-5" 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                        <span className="text-sm">Email Preferences</span>
                      </button>
                      
                      {/* Divider */}
                      <div className="my-1 border-t border-gray-800"></div>
                      
                      {/* Sign Out */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          setShowUserMenu(false)
                          await handleSignOut()
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-900/50 rounded-lg transition-colors text-left font-light"
                        type="button"
                      >
                        <svg 
                          className="w-5 h-5" 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        <span className="text-sm">Sign Out</span>
              </button>
                    </div>
                  </div>
                </>
              )}
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
          <div className="fixed top-0 left-0 h-full w-64 bg-[#1a1a1a] border-r border-gray-800 z-50 md:hidden shadow-2xl">
            <div className="flex flex-col h-full">
              {/* Mobile Menu Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center">
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
                  <div className="text-white font-light text-sm">
                    Finacra
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
                  className="flex items-center gap-3 px-4 py-3 text-white font-light bg-gray-900/50 border border-gray-800 rounded-lg"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Data Room
                </a>
                {isSuperadmin && (
                  <a
                    href="/admin"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white hover:bg-gray-900/50 rounded-lg transition-colors font-light"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    Admin
                  </a>
                )}
                <a
                  href="/team"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white hover:bg-gray-900/50 rounded-lg transition-colors font-light"
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
                  href="/settings/email-preferences"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white hover:bg-gray-900/50 rounded-lg transition-colors font-light"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Email Preferences
                </a>
              </nav>

              {/* Mobile Menu Footer - User Info */}
              <div className="border-t border-gray-800 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-gray-800 border border-gray-700 rounded-full flex items-center justify-center text-white font-light text-sm">
                    {userInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-light truncate">{userName}</div>
                    <div className="text-gray-400 text-xs truncate font-light">{userEmail}</div>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setIsMobileMenuOpen(false)
                    await handleSignOut()
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-900/50 rounded-lg transition-colors font-light"
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

      {/* Notification Detail Modal */}
      {selectedNotification && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-light text-white">Notification Details</h3>
                <button
                  onClick={() => {
                    setSelectedNotification(null)
                    if (selectedNotification.requirement_id) {
                      router.push('/data-room')
                    }
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Icon and Type */}
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                  selectedNotification.type === 'missing_docs' 
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : selectedNotification.type === 'status_change'
                    ? 'bg-blue-500/20 text-blue-400'
                    : selectedNotification.type === 'overdue'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-gray-700 text-gray-400'
                }`}>
                  {selectedNotification.type === 'missing_docs' ? (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                    </svg>
                  ) : selectedNotification.type === 'status_change' ? (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 11 12 14 22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    </svg>
                  )}
                </div>
                <div>
                  <div className="text-white font-light">{selectedNotification.title}</div>
                  <div className="text-gray-400 text-sm capitalize font-light">{selectedNotification.type.replace('_', ' ')}</div>
                </div>
              </div>

              {/* Full Message */}
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider font-light mb-2">Message</label>
                <div className="text-white bg-gray-900/50 border border-gray-800 rounded-lg p-4 whitespace-pre-wrap font-light">
                  {selectedNotification.message}
                </div>
              </div>

              {/* Metadata */}
              {(() => {
                let metadataObj: Record<string, unknown> | null = null
                
                if (selectedNotification.metadata) {
                  // Handle if metadata is a string (parse it)
                  if (typeof selectedNotification.metadata === 'string') {
                    try {
                      metadataObj = JSON.parse(selectedNotification.metadata)
                    } catch {
                      // If parsing fails, treat as plain text
                      return (
                        <div>
                          <label className="block text-sm font-medium text-gray-400 mb-2">Details</label>
                          <div className="bg-gray-900 rounded-lg p-4">
                            <p className="text-white text-sm">{selectedNotification.metadata}</p>
                          </div>
                        </div>
                      )
                    }
                  } else if (typeof selectedNotification.metadata === 'object' && selectedNotification.metadata !== null) {
                    metadataObj = selectedNotification.metadata as Record<string, unknown>
                  }
                }
                
                if (!metadataObj || Object.keys(metadataObj).length === 0) {
                  return null
                }
                
                return (
                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-wider font-light mb-2">Details</label>
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 space-y-2">
                      {Object.entries(metadataObj).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-start gap-4">
                          <span className="text-gray-400 text-sm capitalize flex-shrink-0 font-light">{key.replace(/_/g, ' ')}:</span>
                          <span className="text-white text-sm text-right break-words font-light">
                            {value === null || value === undefined 
                              ? 'N/A'
                              : typeof value === 'object' 
                                ? JSON.stringify(value, null, 2)
                                : String(value)
                            }
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Timestamp */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <div>
                  <div className="text-gray-400 text-xs font-light">Created</div>
                  <div className="text-white text-sm font-light">
                    {new Date(selectedNotification.created_at).toLocaleString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
                {selectedNotification.read_at && (
                  <div>
                    <div className="text-gray-400 text-xs font-light">Read</div>
                    <div className="text-white text-sm font-light">
                      {new Date(selectedNotification.read_at).toLocaleString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                <button
                  onClick={() => {
                    setSelectedNotification(null)
                  }}
                  className="px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors font-light"
                >
                  Close
                </button>
                {selectedNotification.requirement_id && (
                  <button
                    onClick={() => {
                      router.push('/data-room')
                      setSelectedNotification(null)
                    }}
                    className="px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors font-light"
                  >
                    View in Data Room
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View All Notifications Modal */}
      {showAllNotifications && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-xl font-light text-white">All Notifications</h3>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-sm text-gray-400 hover:text-white transition-colors font-light"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowAllNotifications(false)
                    fetchNotifications() // Refresh to get limited list back
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingNotifications ? (
                <div className="p-8 text-center text-gray-400">
                  <div className="animate-spin w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full mx-auto"></div>
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <p className="text-lg font-light">No notifications</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      onClick={() => {
                        if (!notification.is_read) handleMarkRead(notification.id)
                        setSelectedNotification(notification)
                        setShowAllNotifications(false)
                      }}
                      className={`px-4 py-4 border border-gray-800 rounded-lg cursor-pointer transition-colors ${
                        notification.is_read 
                          ? 'bg-gray-900/50 hover:bg-gray-900' 
                          : 'bg-gray-900/30 hover:bg-gray-900/50 border-gray-700'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          notification.type === 'missing_docs' 
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : notification.type === 'status_change'
                            ? 'bg-blue-500/20 text-blue-400'
                            : notification.type === 'overdue'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-gray-700 text-gray-400'
                        }`}>
                          {notification.type === 'missing_docs' ? (
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <path d="M12 9v4" />
                              <path d="M12 17h.01" />
                            </svg>
                          ) : notification.type === 'status_change' ? (
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="9 11 12 14 22 4" />
                              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`text-base font-light ${notification.is_read ? 'text-gray-300' : 'text-white'}`}>
                              {notification.title}
                            </p>
                            {!notification.is_read && (
                              <div className="w-2 h-2 bg-gray-400 rounded-full flex-shrink-0"></div>
                            )}
                          </div>
                          <p className="text-sm text-gray-400 mt-1 line-clamp-3 font-light">
                            {notification.message}
                          </p>
                          <p className="text-xs text-gray-500 mt-2 font-light">
                            {new Date(notification.created_at).toLocaleString('en-GB', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
