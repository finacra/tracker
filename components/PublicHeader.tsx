'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

export default function PublicHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [showProductsDropdown, setShowProductsDropdown] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const dropdownRef = useRef<HTMLDivElement>(null)
  const dropdownMenuRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  
  // Handle smooth scroll for anchor links on home page
  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => {
    if (pathname === '/home') {
      e.preventDefault()
      const element = document.getElementById(hash.replace('#', ''))
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }

  // Set mounted state for portal (required for SSR)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Calculate dropdown position when it opens
  useEffect(() => {
    if (showProductsDropdown && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 4, // mt-1 = 4px
        left: rect.left
      })
    }
  }, [showProductsDropdown])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showProductsDropdown) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const isInMenu = dropdownMenuRef.current?.contains(target) || false
      const isInTrigger = dropdownRef.current?.contains(target) || false
      
      if (!isInMenu && !isInTrigger) {
        setShowProductsDropdown(false)
      }
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [showProductsDropdown])

  return (
    <nav className="relative z-10 w-full px-4 sm:px-6 py-4 sm:py-6" style={{ overflow: 'visible', position: 'relative' }}>
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/home" className="flex items-center gap-2">
          <img
            src="https://aqziojkjtmyecfglifbc.supabase.co/storage/v1/object/public/logo/WhatsApp_Image_2026-02-09_at_18.02.02-removebg-preview.png"
            alt="Finacra Logo"
            className="h-8 w-auto sm:h-10 object-contain"
          />
        </Link>
        <div className="hidden md:flex items-center gap-8">
          {/* Products with Dropdown */}
          <div 
            className="relative" 
            ref={dropdownRef}
            style={{ zIndex: 9999 }}
          >
            <div className="flex items-center gap-1">
              <Link 
                href="/home#products" 
                className="text-gray-300 hover:text-white transition-colors font-light text-sm py-2"
                onClick={(e) => {
                  // Prevent dropdown from opening when clicking Products link
                  e.stopPropagation()
                }}
              >
                Products
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowProductsDropdown(!showProductsDropdown)
                }}
                className="text-gray-300 hover:text-white transition-colors font-light py-2 cursor-pointer"
                aria-label="Toggle products menu"
                aria-expanded={showProductsDropdown}
              >
                <svg 
                  className={`w-4 h-4 transition-transform duration-200 ${showProductsDropdown ? 'rotate-180' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            {showProductsDropdown && mounted && dropdownRef.current && createPortal(
              <div
                ref={dropdownMenuRef}
                className="fixed w-48"
                style={{
                  top: `${dropdownPosition.top}px`,
                  left: `${dropdownPosition.left}px`,
                  pointerEvents: 'auto',
                  zIndex: 99999
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg shadow-xl">
                  <a
                    href="/compliance-tracker"
                    data-menu-item="compliance-tracker"
                    className="block w-full px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-900/50 transition-colors font-light text-sm cursor-pointer text-left no-underline"
                    onClick={(e) => {
                      e.preventDefault()
                      setShowProductsDropdown(false)
                      router.push('/compliance-tracker')
                    }}
                  >
                    Compliance Tracker
                  </a>
                  <div className="h-px bg-gray-800 w-full" style={{ pointerEvents: 'none' }} />
                  <a
                    href="/company-onboarding"
                    data-menu-item="company-onboarding"
                    id="company-onboarding-link"
                    className="block w-full px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-900/50 transition-colors font-light text-sm cursor-pointer text-left no-underline"
                    onClick={(e) => {
                      e.preventDefault()
                      setShowProductsDropdown(false)
                      router.push('/company-onboarding')
                    }}
                  >
                    Company Onboarding
                  </a>
                </div>
              </div>,
              document.body
            )}
          </div>
          
          <Link 
            href="/home#solution" 
            className="text-gray-300 hover:text-white transition-colors font-light text-sm"
            onClick={(e) => handleAnchorClick(e, '#solution')}
          >
            Features
          </Link>
          <Link 
            href="/home#plans" 
            className="text-gray-300 hover:text-white transition-colors font-light text-sm"
            onClick={(e) => handleAnchorClick(e, '#plans')}
          >
            Plans
          </Link>
          <Link href="/customers" className="text-gray-300 hover:text-white transition-colors font-light text-sm">
            Customers
          </Link>
          <Link href="/contact" className="text-gray-300 hover:text-white transition-colors font-light text-sm">
            Contact Us
          </Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/subscribe"
            className="px-3 sm:px-4 py-2 bg-black border border-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors font-light text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2"
          >
            <span className="hidden sm:inline">Start Trial for free</span>
            <span className="sm:hidden">Trial</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="hidden sm:block">
              <path d="M1 11L11 1M11 1H1M11 1V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <Link
            href="/login"
            className="text-gray-300 hover:text-white transition-colors font-light text-xs sm:text-sm"
          >
            Log In
          </Link>
        </div>
      </div>
    </nav>
  )
}
