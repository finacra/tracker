'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import EmbeddedPricing from '@/components/EmbeddedPricing'

export default function HomePage() {
  const [hoveredProduct, setHoveredProduct] = useState<string | null>(null)
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set())
  const [solutionIndex, setSolutionIndex] = useState(0)
  const [trackerIndex, setTrackerIndex] = useState(0)
  const [onboardingIndex, setOnboardingIndex] = useState(0)

  const handleSwipe = (section: 'solution' | 'tracker' | 'onboarding', totalCards: number, direction: 'left' | 'right') => {
    if (direction === 'left') {
      if (section === 'solution') {
        setSolutionIndex((prev) => Math.min(prev + 1, totalCards - 1))
      } else if (section === 'tracker') {
        setTrackerIndex((prev) => Math.min(prev + 1, totalCards - 1))
      } else if (section === 'onboarding') {
        setOnboardingIndex((prev) => Math.min(prev + 1, totalCards - 1))
      }
    } else {
      if (section === 'solution') {
        setSolutionIndex((prev) => Math.max(prev - 1, 0))
      } else if (section === 'tracker') {
        setTrackerIndex((prev) => Math.max(prev - 1, 0))
      } else if (section === 'onboarding') {
        setOnboardingIndex((prev) => Math.max(prev - 1, 0))
      }
    }
  }

  const createTouchHandlers = (section: 'solution' | 'tracker' | 'onboarding', totalCards: number) => {
    let touchStartX = 0
    let touchStartY = 0
    let touchEndX = 0
    let touchEndY = 0
    let isHorizontalSwipe = false

    const onTouchStart = (e: React.TouchEvent) => {
      touchStartX = e.targetTouches[0].clientX
      touchStartY = e.targetTouches[0].clientY
      touchEndX = 0
      touchEndY = 0
      isHorizontalSwipe = false
    }

    const onTouchMove = (e: React.TouchEvent) => {
      touchEndX = e.targetTouches[0].clientX
      touchEndY = e.targetTouches[0].clientY
      
      // Determine if this is a horizontal swipe
      const deltaX = Math.abs(touchEndX - touchStartX)
      const deltaY = Math.abs(touchEndY - touchStartY)
      
      if (deltaX > deltaY && deltaX > 10) {
        isHorizontalSwipe = true
      }
    }

    const onTouchEnd = () => {
      if (!touchStartX || !touchEndX) return
      
      const distanceX = touchStartX - touchEndX
      const distanceY = Math.abs(touchStartY - touchEndY)
      const minSwipeDistance = 30 // Reduced threshold for easier swiping
      
      // Only trigger swipe if horizontal movement is greater than vertical
      if (isHorizontalSwipe && Math.abs(distanceX) > minSwipeDistance && Math.abs(distanceX) > distanceY) {
        if (distanceX > 0) {
          // Swiped left (touch moved right, content moves left)
          handleSwipe(section, totalCards, 'left')
        } else {
          // Swiped right (touch moved left, content moves right)
          handleSwipe(section, totalCards, 'right')
        }
      }
      
      touchStartX = 0
      touchStartY = 0
      touchEndX = 0
      touchEndY = 0
      isHorizontalSwipe = false
    }

    return { onTouchStart, onTouchMove, onTouchEnd }
  }

  useEffect(() => {
    console.log('🏠 [HOME PAGE] Component mounted!')
    
    // Detect mobile/tablet for optimized animation settings
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024
    
    // Intersection Observer for scroll animations
    // On mobile: trigger earlier with positive rootMargin, lower threshold
    // On desktop: keep original settings for smoother experience
    const observerOptions = isMobile
      ? {
          threshold: 0.05,
          rootMargin: '0px 0px 200px 0px' // Trigger 200px before section enters viewport
        }
      : {
          threshold: 0.15,
          rootMargin: '0px 0px -50px 0px'
        }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const sectionId = (entry.target as HTMLElement).dataset.animateSection || entry.target.id
          if (sectionId) {
            setVisibleSections((prev) => new Set(prev).add(sectionId))
          }
        }
      })
    }, observerOptions)

    let sections: NodeListOf<Element> | null = null

    // Reduced delay for faster initial load, especially on mobile
    const timeoutId = setTimeout(() => {
      // Observe all sections with data-animate-section
      sections = document.querySelectorAll('[data-animate-section]')
      sections.forEach((section) => {
        const sectionId = (section as HTMLElement).dataset.animateSection
        // Check if section is already in viewport on load
        // On mobile/tablet: be more aggressive, show sections that are close to viewport
        const rect = section.getBoundingClientRect()
        const viewportThreshold = isMobile ? window.innerHeight * 1.5 : window.innerHeight * 0.8
        const bottomThreshold = isMobile ? -100 : 0
        const isInViewport = rect.top < viewportThreshold && rect.bottom > bottomThreshold
        if (isInViewport && sectionId) {
          setVisibleSections((prev) => new Set(prev).add(sectionId))
        }
        observer.observe(section)
      })
    }, isMobile ? 50 : 150)

    return () => {
      clearTimeout(timeoutId)
      if (sections) {
        sections.forEach((section) => observer.unobserve(section))
      }
    }
  }, [])


  return (
    <div className="min-h-screen bg-primary-dark flex flex-col relative overflow-hidden">
      <style jsx global>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.98);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fade-in-up {
          animation: fadeInUp 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in {
          animation: fadeIn 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-slide-in-left {
          animation: slideInLeft 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-slide-in-right {
          animation: slideInRight 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-scale-in {
          animation: scaleIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .section-hidden {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1), transform 1.2s cubic-bezier(0.16, 1, 0.3, 1);
          will-change: opacity, transform;
        }
        @media (max-width: 1023px) {
          .section-hidden {
            transform: translateY(15px);
            transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          }
        }
        .section-visible {
          opacity: 1;
          transform: translateY(0);
        }
        .card-hidden {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 1s cubic-bezier(0.16, 1, 0.3, 1), transform 1s cubic-bezier(0.16, 1, 0.3, 1);
          will-change: opacity, transform;
        }
        @media (max-width: 1023px) {
          .card-hidden {
            transform: translateY(10px);
            transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          }
        }
        .card-visible {
          opacity: 1;
          transform: translateY(0);
        }
        * {
          transition-property: color, background-color, border-color, opacity, transform;
          transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
          transition-duration: 300ms;
        }

        /* Infinite scroll animation for clients */
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-scroll {
          animation: scroll 30s linear infinite;
          display: flex;
          width: fit-content;
        }
      `}</style>
      {/* Navigation Bar */}
      <nav className="relative z-10 w-full px-4 sm:px-6 py-4 sm:py-6 animate-fade-in">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2">
            <img
              src="https://aqziojkjtmyecfglifbc.supabase.co/storage/v1/object/public/logo/WhatsApp_Image_2026-02-09_at_18.02.02-removebg-preview.png"
              alt="Finacra Logo"
              className="h-8 w-auto sm:h-10 object-contain"
            />
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link href="#products" className="text-gray-300 hover:text-white transition-colors font-light text-sm">
              Products
            </Link>
            <Link href="#features" className="text-gray-300 hover:text-white transition-colors font-light text-sm">
              Features
            </Link>
            <Link href="#plans" className="text-gray-300 hover:text-white transition-colors font-light text-sm">
              Plans
            </Link>
            <Link href="#clients" className="text-gray-300 hover:text-white transition-colors font-light text-sm">
              Customers
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
              href="/"
              className="text-gray-300 hover:text-white transition-colors font-light text-xs sm:text-sm"
            >
              Log In
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section 
        id="hero"
        data-animate-section="hero"
        className={`relative z-10 px-4 sm:px-6 md:px-12 py-8 sm:py-12 md:py-20 ${visibleSections.has('hero') || true ? 'section-visible' : 'section-hidden'}`}
      >
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6 sm:gap-8 md:gap-16 items-center">
            {/* Left: Content */}
            <div className="max-w-2xl mx-auto md:mx-0 text-center md:text-left animate-slide-in-left" style={{ animationDelay: '0.2s', opacity: 0, animationFillMode: 'forwards' }}>
              <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-light mb-4 sm:mb-6 leading-[1.05] tracking-tight">
                <span className="text-white">
                  Introducing your
                </span>
                <br />
                <span className="bg-gradient-to-r from-cyan-400/70 via-purple-400/70 to-pink-400/70 bg-clip-text text-transparent">
                  Virtual CFO
                </span>
              </h1>
              <p className="text-sm sm:text-base md:text-lg text-gray-400 mb-6 sm:mb-10 font-light leading-relaxed animate-fade-in" style={{ animationDelay: '0.4s', opacity: 0, animationFillMode: 'forwards' }}>
                The Intelligence Layer for the Global Financial Ecosystem
              </p>
              
              {/* Mobile: Hero Graphic */}
              <div className="flex md:hidden relative w-full h-[200px] sm:h-[250px] items-center justify-center mb-6 sm:mb-10">
                <img
                  src="https://aqziojkjtmyecfglifbc.supabase.co/storage/v1/object/public/logo/FINACRA%20(3).png"
                  alt="Finacra Brand Graphic"
                  className="w-full h-full object-contain"
                />
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center md:justify-start animate-fade-in" style={{ animationDelay: '0.6s', opacity: 0, animationFillMode: 'forwards' }}>
                <Link
                  href="/subscribe"
                  className="px-5 sm:px-6 py-2.5 sm:py-3 bg-black border border-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors font-light text-xs sm:text-sm flex items-center justify-center gap-2 min-h-[44px]"
                >
                  Start Trial for free
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="hidden sm:block">
                    <path d="M1 11L11 1M11 1H1M11 1V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </Link>
                <Link
                  href="https://app.finnovateai.com/"
                  className="px-5 sm:px-6 py-2.5 sm:py-3 text-white hover:text-gray-300 transition-colors font-light text-xs sm:text-sm flex items-center justify-center gap-2 min-h-[44px]"
                >
                  Buy Compliance
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="hidden sm:block">
                    <path d="M1 11L11 1M11 1H1M11 1V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
                </Link>
              </div>
            </div>

            {/* Right: Hero Graphic */}
            <div className="hidden md:flex relative w-full h-[200px] sm:h-[250px] md:h-[300px] lg:h-[350px] items-center justify-center order-first md:order-last">
              <img
                src="https://aqziojkjtmyecfglifbc.supabase.co/storage/v1/object/public/logo/FINACRA%20(3).png"
                alt="Finacra Brand Graphic"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Positioning Section */}
      <section className="relative z-10 px-6 py-20 md:py-32 border-t border-gray-800">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm uppercase tracking-wider text-gray-400 mb-8 font-light">
            COMPLIANCE FOR THE ENTERPRISE
          </p>
          <h2 className="text-4xl md:text-6xl font-light text-white mb-6">
            Finacra also serves
          </h2>
          <p className="text-lg text-gray-400 leading-relaxed font-light max-w-2xl mx-auto mb-8 sm:mb-12">
            Finacra gives businesses visibility into compliance, documentation, and financial responsibilities without relying entirely on manual tracking or external reminders.
          </p>
          
          {/* Infinite Scrolling Client List */}
          <div className="overflow-hidden relative">
            <div className="flex items-center gap-4 sm:gap-8 md:gap-16 animate-scroll">
              {/* First set */}
              <div className="text-white text-sm sm:text-base font-light whitespace-nowrap">CA Muneer & Associates</div>
              <div className="text-white text-sm sm:text-base font-light whitespace-nowrap">RAZR Business</div>
              <div className="text-white text-sm sm:text-base font-light whitespace-nowrap">CaterKraft</div>
              <div className="text-white text-sm sm:text-base font-light whitespace-nowrap">IcePulse</div>
              <div className="text-white text-sm sm:text-base font-light whitespace-nowrap">Dine Desk</div>
              <div className="text-white text-sm sm:text-base font-light whitespace-nowrap">Ureserve</div>
              <div className="text-white text-sm sm:text-base font-light whitespace-nowrap">Radiant Sage Ventures</div>
              <div className="text-white text-sm sm:text-base font-light whitespace-nowrap">GTM</div>
              {/* Duplicate set for seamless loop */}
              <div className="text-white text-sm sm:text-base font-light whitespace-nowrap">CA Muneer & Associates</div>
              <div className="text-white text-sm sm:text-base font-light whitespace-nowrap">RAZR Business</div>
              <div className="text-white text-sm sm:text-base font-light whitespace-nowrap">CaterKraft</div>
              <div className="text-white text-sm sm:text-base font-light whitespace-nowrap">IcePulse</div>
              <div className="text-white text-sm sm:text-base font-light whitespace-nowrap">Dine Desk</div>
              <div className="text-white text-sm sm:text-base font-light whitespace-nowrap">Ureserve</div>
              <div className="text-white text-sm sm:text-base font-light whitespace-nowrap">Radiant Sage Ventures</div>
              <div className="text-white text-sm sm:text-base font-light whitespace-nowrap">GTM</div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Products Section */}
      <section 
        id="products"
        data-animate-section="products"
        className={`relative z-10 px-4 sm:px-6 pt-12 sm:pt-20 md:pt-32 pb-0 sm:pb-4 md:pb-8 border-t border-gray-800 ${visibleSections.has('products') ? 'section-visible' : 'section-hidden'}`}
      >
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light text-white mb-8 sm:mb-12 md:mb-16 text-center px-4 animate-fade-in-up" style={{ animationDelay: '0.1s', opacity: visibleSections.has('products') ? 1 : 0 }}>
            Our Products
          </h2>
          <div className="grid md:grid-cols-2 gap-8 sm:gap-12 md:gap-16 items-start">
            {/* Left: Text Content */}
            <div className="space-y-0">
              {/* Compliance Tracker */}
              <div
                className={`border-b border-gray-800 pb-12 mb-12 cursor-pointer transition-all duration-300 ${
                  hoveredProduct && hoveredProduct !== 'compliance' ? 'opacity-30' : 'opacity-100'
                }`}
                onMouseEnter={() => setHoveredProduct('compliance')}
                onMouseLeave={() => setHoveredProduct(null)}
              >
                <h3 className="text-xl sm:text-2xl font-light text-white mb-3 sm:mb-4">
                  Compliance Tracker
                </h3>
                <p className="text-sm sm:text-base text-gray-400 leading-relaxed font-light">
                  Track statutory and regulatory requirements across GST, Income Tax, RoC, payroll, and renewals with structured status management and due-date monitoring.
                </p>
              </div>

              {/* Document Vault */}
              <div
                className={`border-b border-gray-800 pb-8 sm:pb-12 mb-8 sm:mb-12 cursor-pointer transition-all duration-300 ${
                  hoveredProduct && hoveredProduct !== 'vault' ? 'opacity-30' : 'opacity-100'
                }`}
                onMouseEnter={() => setHoveredProduct('vault')}
                onMouseLeave={() => setHoveredProduct(null)}
              >
                <h3 className="text-xl sm:text-2xl font-light text-white mb-3 sm:mb-4">
                  Document Vault
                </h3>
                <p className="text-sm sm:text-base text-gray-400 leading-relaxed font-light">
                  Secure storage and structured organization of financial and legal documents with role-based access.
                </p>
              </div>

              {/* Finacra Web Services */}
              <div
                className={`border-b border-gray-800 pt-8 sm:pt-12 pb-8 sm:pb-12 mb-8 sm:mb-12 cursor-pointer transition-all duration-300 ${
                  hoveredProduct && hoveredProduct !== 'services' ? 'opacity-30' : 'opacity-100'
                }`}
                onMouseEnter={() => setHoveredProduct('services')}
                onMouseLeave={() => setHoveredProduct(null)}
              >
                <h3 className="text-xl sm:text-2xl font-light text-white mb-3 sm:mb-4">
                  Finacra Web Services <span className="text-xs sm:text-sm text-gray-500 font-light">(Coming Soon)</span>
                </h3>
                <p className="text-sm sm:text-base text-gray-400 leading-relaxed font-light">
                  Infrastructure layer that supports company onboarding, entity detection, compliance workflows, and administrative control.
                </p>
              </div>

              {/* E-Invoicing */}
              <div
                className={`border-b border-gray-800 pt-8 sm:pt-12 pb-8 sm:pb-12 mb-8 sm:mb-12 cursor-pointer transition-all duration-300 ${
                  hoveredProduct && hoveredProduct !== 'einvoicing' ? 'opacity-30' : 'opacity-100'
                }`}
                onMouseEnter={() => setHoveredProduct('einvoicing')}
                onMouseLeave={() => setHoveredProduct(null)}
              >
                <h3 className="text-xl sm:text-2xl font-light text-white mb-3 sm:mb-4">
                  E-Invoicing <span className="text-xs sm:text-sm text-gray-500 font-light">(Coming Soon)</span>
                </h3>
                <p className="text-sm sm:text-base text-gray-400 leading-relaxed font-light">
                  Automated & structured invoice workflows aligned with regulatory frameworks and documentation requirements.
                </p>
              </div>

              {/* Filing & Notices */}
              <div
                className={`border-b border-gray-800 pt-8 sm:pt-12 pb-8 sm:pb-12 mb-8 sm:mb-12 cursor-pointer transition-all duration-300 ${
                  hoveredProduct && hoveredProduct !== 'filing' ? 'opacity-30' : 'opacity-100'
                }`}
                onMouseEnter={() => setHoveredProduct('filing')}
                onMouseLeave={() => setHoveredProduct(null)}
              >
                <h3 className="text-xl sm:text-2xl font-light text-white mb-3 sm:mb-4">
                  Filing & Notices <span className="text-xs sm:text-sm text-gray-500 font-light">(Coming Soon)</span>
                </h3>
                <p className="text-sm sm:text-base text-gray-400 leading-relaxed font-light">
                  Track filings, regulatory notices, and status updates across teams and entities.
                </p>
              </div>

              {/* Finacra AI */}
              <div
                className={`pt-8 sm:pt-12 pb-0 cursor-pointer transition-all duration-300 ${
                  hoveredProduct && hoveredProduct !== 'ai' ? 'opacity-30' : 'opacity-100'
                }`}
                onMouseEnter={() => setHoveredProduct('ai')}
                onMouseLeave={() => setHoveredProduct(null)}
              >
                <h3 className="text-xl sm:text-2xl font-light text-white mb-3 sm:mb-4">
                  Finacra AI <span className="text-xs sm:text-sm text-gray-500 font-light">(Coming Soon)</span>
                </h3>
                <p className="text-sm sm:text-base text-gray-400 leading-relaxed font-light mb-0">
                  AI-powered document understanding, compliance recommendations, and intelligent search capabilities under development.
                </p>
              </div>
            </div>

            {/* Right: Architecture Graphic */}
            <div className="relative h-full min-h-[300px] sm:min-h-[400px] md:min-h-[600px] flex items-center justify-center -mt-8 sm:-mt-12 md:-mt-16">
              <svg
                className="w-full h-full"
                viewBox="0 0 1000 700"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <linearGradient id="boxGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#888888" stopOpacity="0.25" />
                  </linearGradient>
                  <linearGradient id="boxGradActive" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0.35" />
                  </linearGradient>
                </defs>

                {/* Master Architecture (default) */}
                <g 
                  opacity={!hoveredProduct ? 1 : 0} 
                  style={{ 
                    pointerEvents: !hoveredProduct ? 'auto' : 'none',
                    transition: 'opacity 0.5s ease-in-out'
                  }}
                >
                    {/* Central Hub */}
                    <rect x="350" y="250" width="300" height="120" rx="8" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.6)" strokeWidth="3.5" />
                    <text x="500" y="320" fill="white" fontSize="24" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Finacra Core</text>
                    
                    {/* Compliance Tracker */}
                    <rect x="80" y="180" width="220" height="100" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="3" />
                    <text x="190" y="240" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Compliance</text>
                    <line x1="300" y1="230" x2="350" y2="280" stroke="rgba(255,255,255,0.4)" strokeWidth="3" />
                    
                    {/* Document Vault */}
                    <rect x="80" y="440" width="220" height="100" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="3" />
                    <text x="190" y="500" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Document</text>
                    <line x1="300" y1="490" x2="350" y2="370" stroke="rgba(255,255,255,0.4)" strokeWidth="3" />
                    
                    {/* Web Services */}
                    <rect x="700" y="250" width="220" height="120" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="3" />
                    <text x="810" y="320" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Services</text>
                    <line x1="650" y1="310" x2="700" y2="310" stroke="rgba(255,255,255,0.4)" strokeWidth="3" />
                  </g>

                {/* Compliance Tracker Architecture */}
                <g 
                  opacity={hoveredProduct === 'compliance' ? 1 : 0} 
                  style={{ 
                    pointerEvents: hoveredProduct === 'compliance' ? 'auto' : 'none',
                    transition: 'opacity 0.5s ease-in-out'
                  }}
                >
                    {/* Central Compliance Engine */}
                    <rect x="350" y="280" width="300" height="110" rx="8" fill="url(#boxGradActive)" stroke="rgba(255,255,255,0.7)" strokeWidth="3.5" />
                    <text x="500" y="345" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Compliance Engine</text>
                    
                    {/* Due Date Management */}
                    <rect x="80" y="120" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="155" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Due Date</text>
                    <text x="170" y="175" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Tracking</text>
                    <line x1="260" y1="155" x2="380" y2="310" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Compliance Type */}
                    <rect x="740" y="120" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="155" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Compliance</text>
                    <text x="830" y="175" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Type</text>
                    <line x1="740" y1="155" x2="620" y2="310" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Filing Status */}
                    <rect x="80" y="240" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="275" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Filing</text>
                    <text x="170" y="295" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Status</text>
                    <line x1="260" y1="275" x2="380" y2="320" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Penalty Calculation */}
                    <rect x="740" y="240" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="275" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Penalty</text>
                    <text x="830" y="295" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Calculation</text>
                    <line x1="740" y1="275" x2="620" y2="320" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Status Management */}
                    <rect x="80" y="510" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="545" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Status</text>
                    <text x="170" y="565" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Management</text>
                    <line x1="260" y1="545" x2="380" y2="350" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Category Tracking */}
                    <rect x="740" y="510" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="545" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Category</text>
                    <text x="830" y="565" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Tracking</text>
                    <line x1="740" y1="545" x2="620" y2="350" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                </g>

                {/* Document Vault Architecture */}
                <g 
                  opacity={hoveredProduct === 'vault' ? 1 : 0} 
                  style={{ 
                    pointerEvents: hoveredProduct === 'vault' ? 'auto' : 'none',
                    transition: 'opacity 0.5s ease-in-out'
                  }}
                >
                    {/* Central Vault */}
                    <rect x="300" y="270" width="400" height="110" rx="8" fill="url(#boxGradActive)" stroke="rgba(255,255,255,0.7)" strokeWidth="3.5" />
                    <text x="500" y="330" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Document Vault</text>
                    
                    {/* Document Storage */}
                    <rect x="80" y="120" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="155" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Document</text>
                    <text x="170" y="175" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Storage</text>
                    <line x1="260" y1="155" x2="320" y2="300" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Folder Structure */}
                    <rect x="740" y="120" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="155" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Folder</text>
                    <text x="830" y="175" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Structure</text>
                    <line x1="740" y1="155" x2="680" y2="300" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Role-Based Access */}
                    <rect x="80" y="240" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="275" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Role-Based</text>
                    <text x="170" y="295" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Access</text>
                    <line x1="260" y1="275" x2="320" y2="320" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Document Templates */}
                    <rect x="740" y="240" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="275" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Document</text>
                    <text x="830" y="295" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Templates</text>
                    <line x1="740" y1="275" x2="680" y2="320" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Search & Filter */}
                    <rect x="80" y="510" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="545" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Search &</text>
                    <text x="170" y="565" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Filter</text>
                    <line x1="260" y1="545" x2="320" y2="340" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Document Categories */}
                    <rect x="740" y="510" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="545" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Document</text>
                    <text x="830" y="565" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Categories</text>
                    <line x1="740" y1="545" x2="680" y2="340" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                </g>

                {/* Finacra Web Services Architecture */}
                <g 
                  opacity={hoveredProduct === 'services' ? 1 : 0} 
                  style={{ 
                    pointerEvents: hoveredProduct === 'services' ? 'auto' : 'none',
                    transition: 'opacity 0.5s ease-in-out'
                  }}
                >
                    {/* Central Platform */}
                    <rect x="300" y="280" width="400" height="110" rx="8" fill="url(#boxGradActive)" stroke="rgba(255,255,255,0.7)" strokeWidth="3.5" />
                    <text x="500" y="340" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">FWS Platform</text>
                    
                    {/* Order Management */}
                    <rect x="80" y="120" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="155" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Order</text>
                    <text x="170" y="175" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Management</text>
                    <line x1="260" y1="155" x2="320" y2="310" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Practice Management */}
                    <rect x="740" y="120" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="155" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Practice</text>
                    <text x="830" y="175" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Management</text>
                    <line x1="740" y1="155" x2="680" y2="310" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Client Management */}
                    <rect x="80" y="240" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="275" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Client</text>
                    <text x="170" y="295" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Management</text>
                    <line x1="260" y1="275" x2="320" y2="330" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Process Automation */}
                    <rect x="740" y="240" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="275" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Process</text>
                    <text x="830" y="295" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Automation</text>
                    <line x1="740" y1="275" x2="680" y2="330" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Company Onboarding */}
                    <rect x="80" y="510" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="545" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Company</text>
                    <text x="170" y="565" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Onboarding</text>
                    <line x1="260" y1="545" x2="320" y2="350" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Workflow Engine */}
                    <rect x="740" y="510" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="545" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Workflow</text>
                    <text x="830" y="565" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Engine</text>
                    <line x1="740" y1="545" x2="680" y2="350" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                </g>

                {/* E-Invoicing Architecture */}
                <g 
                  opacity={hoveredProduct === 'einvoicing' ? 1 : 0} 
                  style={{ 
                    pointerEvents: hoveredProduct === 'einvoicing' ? 'auto' : 'none',
                    transition: 'opacity 0.5s ease-in-out'
                  }}
                >
                    {/* Central E-Invoicing Engine */}
                    <rect x="300" y="280" width="400" height="110" rx="8" fill="url(#boxGradActive)" stroke="rgba(255,255,255,0.7)" strokeWidth="3.5" />
                    <text x="500" y="340" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">E-Invoicing</text>
                    <text x="500" y="360" fill="white" fontSize="18" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Engine</text>
                    
                    {/* Invoice Generation */}
                    <rect x="80" y="120" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="155" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Invoice</text>
                    <text x="170" y="175" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Generation</text>
                    <line x1="260" y1="155" x2="320" y2="310" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Regulatory Compliance */}
                    <rect x="740" y="120" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="155" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Regulatory</text>
                    <text x="830" y="175" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Compliance</text>
                    <line x1="740" y1="155" x2="680" y2="310" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Workflow Automation */}
                    <rect x="80" y="240" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="275" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Workflow</text>
                    <text x="170" y="295" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Automation</text>
                    <line x1="260" y1="275" x2="320" y2="330" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Document Linking */}
                    <rect x="740" y="240" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="275" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Document</text>
                    <text x="830" y="295" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Linking</text>
                    <line x1="740" y1="275" x2="680" y2="330" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Validation & Verification */}
                    <rect x="80" y="510" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="545" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Validation &</text>
                    <text x="170" y="565" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Verification</text>
                    <line x1="260" y1="545" x2="320" y2="350" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Invoice Tracking */}
                    <rect x="740" y="510" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="545" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Invoice</text>
                    <text x="830" y="565" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Tracking</text>
                    <line x1="740" y1="545" x2="680" y2="350" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                </g>

                {/* Filing & Notices Architecture */}
                <g 
                  opacity={hoveredProduct === 'filing' ? 1 : 0} 
                  style={{ 
                    pointerEvents: hoveredProduct === 'filing' ? 'auto' : 'none',
                    transition: 'opacity 0.5s ease-in-out'
                  }}
                >
                    {/* Central Filing Hub */}
                    <rect x="300" y="280" width="400" height="110" rx="8" fill="url(#boxGradActive)" stroke="rgba(255,255,255,0.7)" strokeWidth="3.5" />
                    <text x="500" y="340" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Filing & Notices</text>
                    <text x="500" y="360" fill="white" fontSize="18" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Hub</text>
                    
                    {/* Filing Management */}
                    <rect x="80" y="120" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="155" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Filing</text>
                    <text x="170" y="175" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Management</text>
                    <line x1="260" y1="155" x2="320" y2="310" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Notice Tracking */}
                    <rect x="740" y="120" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="155" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Notice</text>
                    <text x="830" y="175" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Tracking</text>
                    <line x1="740" y1="155" x2="680" y2="310" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Status Updates */}
                    <rect x="80" y="240" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="275" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Status</text>
                    <text x="170" y="295" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Updates</text>
                    <line x1="260" y1="275" x2="320" y2="330" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Regulatory Notices */}
                    <rect x="740" y="240" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="275" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Regulatory</text>
                    <text x="830" y="295" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Notices</text>
                    <line x1="740" y1="275" x2="680" y2="330" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Team Collaboration */}
                    <rect x="80" y="510" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="545" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Team</text>
                    <text x="170" y="565" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Collaboration</text>
                    <line x1="260" y1="545" x2="320" y2="350" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Entity Management */}
                    <rect x="740" y="510" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="545" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Entity</text>
                    <text x="830" y="565" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Management</text>
                    <line x1="740" y1="545" x2="680" y2="350" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                </g>

                {/* Finacra AI Architecture */}
                <g 
                  opacity={hoveredProduct === 'ai' ? 1 : 0} 
                  style={{ 
                    pointerEvents: hoveredProduct === 'ai' ? 'auto' : 'none',
                    transition: 'opacity 0.5s ease-in-out'
                  }}
                >
                    {/* Central AI Engine */}
                    <rect x="300" y="280" width="400" height="110" rx="8" fill="url(#boxGradActive)" stroke="rgba(255,255,255,0.7)" strokeWidth="3.5" />
                    <text x="500" y="340" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Finacra AI</text>
                    <text x="500" y="360" fill="white" fontSize="18" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Engine</text>
                    
                    {/* Document Understanding */}
                    <rect x="80" y="120" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="155" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Document</text>
                    <text x="170" y="175" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Understanding</text>
                    <line x1="260" y1="155" x2="320" y2="310" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Compliance Recommendations */}
                    <rect x="740" y="120" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="155" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Compliance</text>
                    <text x="830" y="175" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Recommendations</text>
                    <line x1="740" y1="155" x2="680" y2="310" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Intelligent Search */}
                    <rect x="80" y="240" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="275" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Intelligent</text>
                    <text x="170" y="295" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Search</text>
                    <line x1="260" y1="275" x2="320" y2="330" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Pattern Recognition */}
                    <rect x="740" y="240" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="275" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Pattern</text>
                    <text x="830" y="295" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Recognition</text>
                    <line x1="740" y1="275" x2="680" y2="330" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Data Extraction */}
                    <rect x="80" y="510" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="170" y="545" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Data</text>
                    <text x="170" y="565" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Extraction</text>
                    <line x1="260" y1="545" x2="320" y2="350" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                    
                    {/* Predictive Analytics */}
                    <rect x="740" y="510" width="180" height="70" rx="6" fill="url(#boxGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" />
                    <text x="830" y="545" fill="white" fontSize="14" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Predictive</text>
                    <text x="830" y="565" fill="white" fontSize="13" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Analytics</text>
                    <line x1="740" y1="545" x2="680" y2="350" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                </g>
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* The Finacra Solution Section */}
      <section
        data-animate-section="solution"
        className={`relative z-10 px-4 sm:px-6 pt-0 sm:pt-8 md:pt-16 pb-8 sm:pb-20 md:pb-32 border-t border-gray-800 ${visibleSections.has('solution') ? 'section-visible' : 'section-hidden'}`}
      >
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light text-white mb-6 sm:mb-8 text-center px-4 animate-fade-in-up" style={{ animationDelay: '0.1s', opacity: visibleSections.has('solution') ? 1 : 0 }}>
            The Finacra Solution
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-gray-400 mb-4 sm:mb-12 md:mb-16 text-center font-light max-w-3xl mx-auto px-4 animate-fade-in-up" style={{ animationDelay: '0.2s', opacity: visibleSections.has('solution') ? 1 : 0 }}>
            A centralized system designed to manage:
          </p>
          
          {/* Mobile: Dot Indicators */}
          <div className="flex md:hidden justify-center gap-2 mb-4">
            {[0, 1, 2].map((index) => (
              <button
                key={index}
                onClick={() => setSolutionIndex(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  solutionIndex === index ? 'bg-white w-6' : 'bg-gray-600'
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
          
          {/* Mobile: Carousel Container */}
          <div 
            className="md:hidden overflow-hidden max-w-6xl mx-auto px-2"
            {...createTouchHandlers('solution', 3)}
          >
            <div 
              className="flex transition-transform duration-300 ease-in-out"
              style={{ transform: `translateX(-${solutionIndex * 100}%)` }}
            >
            {/* Companies Card */}
            <div className="w-full flex-shrink-0 md:w-auto">
              <div 
                className={`bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300 card-hidden ${visibleSections.has('solution') ? 'card-visible' : ''}`}
                style={{ transitionDelay: visibleSections.has('solution') ? '0.3s' : '0s' }}
              >
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Companies</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Multi-entity management</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Entity Structure</div>
                  <div className="text-white text-sm font-light">Manage multiple companies under a unified dashboard with structured hierarchies and relationships.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Company Profiles</div>
                  <div className="text-white text-sm font-light">Auto-fill company details from MCA, track directors, and maintain comprehensive entity records.</div>
                </div>
              </div>
              {/* Company Management UI Preview */}
              <div className="mt-6 bg-[#0f0f0f] rounded-lg p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Company List</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Acme Corp Pvt Ltd</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">CIN: U12345MH2020PTC123456</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Tech Solutions LLP</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">LLPIN: AAB-1234</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="text-xs text-white font-light">Global Industries Ltd</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">CIN: U67890DL2021PLC789012</div>
                  </div>
                </div>
              </div>
              </div>
            </div>

            {/* Documents Card */}
            <div className="w-full flex-shrink-0 md:w-auto">
              <div 
                className={`bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300 card-hidden ${visibleSections.has('solution') ? 'card-visible' : ''}`}
                style={{ transitionDelay: visibleSections.has('solution') ? '0.4s' : '0s' }}
              >
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Documents</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Secure storage</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Document Vault</div>
                  <div className="text-white text-sm font-light">Organize financial and legal documents with structured folders, categories, and metadata.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Access Control</div>
                  <div className="text-white text-sm font-light">Role-based permissions ensure secure access with viewer, editor, and admin level controls.</div>
                </div>
              </div>
              {/* Document Vault UI Preview */}
              <div className="mt-6 bg-[#0f0f0f] rounded-lg p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Document Vault</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-gray-600 rounded"></div>
                      <div className="flex-1">
                        <div className="text-xs text-white font-light">ITR_2024-25.pdf</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">Income Tax • 2.3 MB</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-gray-600 rounded"></div>
                      <div className="flex-1">
                        <div className="text-xs text-white font-light">GST_Returns_Q4.pdf</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">GST • 1.8 MB</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-gray-600 rounded"></div>
                      <div className="flex-1">
                        <div className="text-xs text-white font-light">AOC-4_Form.pdf</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">RoC • 956 KB</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </div>

            {/* Compliance Card */}
            <div className="w-full flex-shrink-0 md:w-auto">
              <div 
                className={`bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300 card-hidden ${visibleSections.has('solution') ? 'card-visible' : ''}`}
                style={{ transitionDelay: visibleSections.has('solution') ? '0.5s' : '0s' }}
              >
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Compliance</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Regulatory tracking</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Due Date Tracking</div>
                  <div className="text-white text-sm font-light">Monitor upcoming, pending, and overdue compliance tasks across GST, Income Tax, RoC, and more.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Status Management</div>
                  <div className="text-white text-sm font-light">Track filing status, penalty risks, and compliance health with automated alerts and reminders.</div>
                </div>
              </div>
              {/* Compliance Tracker UI Preview */}
              <div className="mt-6 bg-[#0f0f0f] rounded-lg p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Compliance Tracker</div>
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-green-500/50 rounded-full"></div>
                    <div className="w-1.5 h-1.5 bg-yellow-500/50 rounded-full"></div>
                    <div className="w-1.5 h-1.5 bg-red-500/50 rounded-full"></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">GSTR-3B</div>
                      <div className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-[10px]">✓</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Due: 20 Jan 2025</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">TDS Return</div>
                      <div className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-[10px]">⏳</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Due: 31 Jan 2025</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-red-800/30">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">AOC-4 Filing</div>
                      <div className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px]">!</div>
                    </div>
                    <div className="text-[10px] text-red-400 mt-0.5">Overdue: 15 Jan 2025</div>
                  </div>
                </div>
              </div>
              </div>
            </div>
            </div>
          </div>
          
          {/* Desktop: Grid */}
          <div className="hidden md:grid md:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto px-4 sm:px-0">
            {/* Companies Card */}
            <div 
              className={`bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300 card-hidden ${visibleSections.has('solution') ? 'card-visible' : ''}`}
              style={{ transitionDelay: visibleSections.has('solution') ? '0.3s' : '0s' }}
            >
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Companies</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Multi-entity management</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Entity Structure</div>
                  <div className="text-white text-sm font-light">Manage multiple companies under a unified dashboard with structured hierarchies and relationships.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Company Profiles</div>
                  <div className="text-white text-sm font-light">Auto-fill company details from MCA, track directors, and maintain comprehensive entity records.</div>
                </div>
              </div>
              <div className="mt-6 bg-[#0f0f0f] rounded-lg p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Company List</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Acme Corp Pvt Ltd</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">CIN: U12345MH2020PTC123456</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Tech Solutions LLP</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">LLPIN: AAB-1234</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="text-xs text-white font-light">Global Industries Ltd</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">CIN: U67890DL2021PLC789012</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Documents Card */}
            <div 
              className={`bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300 card-hidden ${visibleSections.has('solution') ? 'card-visible' : ''}`}
              style={{ transitionDelay: visibleSections.has('solution') ? '0.4s' : '0s' }}
            >
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Documents</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Secure storage</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Document Vault</div>
                  <div className="text-white text-sm font-light">Organize financial and legal documents with structured folders, categories, and metadata.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Access Control</div>
                  <div className="text-white text-sm font-light">Role-based permissions ensure secure access with viewer, editor, and admin level controls.</div>
                </div>
              </div>
              <div className="mt-6 bg-[#0f0f0f] rounded-lg p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Document Vault</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-gray-600 rounded"></div>
                      <div className="flex-1">
                        <div className="text-xs text-white font-light">ITR_2024-25.pdf</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">Income Tax • 2.3 MB</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-gray-600 rounded"></div>
                      <div className="flex-1">
                        <div className="text-xs text-white font-light">GST_Returns_Q4.pdf</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">GST • 1.8 MB</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-gray-600 rounded"></div>
                      <div className="flex-1">
                        <div className="text-xs text-white font-light">AOC-4_Form.pdf</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">RoC • 956 KB</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Compliance Card */}
            <div 
              className={`bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300 card-hidden ${visibleSections.has('solution') ? 'card-visible' : ''}`}
              style={{ transitionDelay: visibleSections.has('solution') ? '0.5s' : '0s' }}
            >
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Compliance</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Regulatory tracking</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Due Date Tracking</div>
                  <div className="text-white text-sm font-light">Monitor upcoming, pending, and overdue compliance tasks across GST, Income Tax, RoC, and more.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Status Management</div>
                  <div className="text-white text-sm font-light">Track filing status, penalty risks, and compliance health with automated alerts and reminders.</div>
                </div>
              </div>
              <div className="mt-6 bg-[#0f0f0f] rounded-lg p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Compliance Tracker</div>
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-green-500/50 rounded-full"></div>
                    <div className="w-1.5 h-1.5 bg-yellow-500/50 rounded-full"></div>
                    <div className="w-1.5 h-1.5 bg-red-500/50 rounded-full"></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">GSTR-3B</div>
                      <div className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-[10px]">✓</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Due: 20 Jan 2025</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">TDS Return</div>
                      <div className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-[10px]">⏳</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Due: 31 Jan 2025</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-red-800/30">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">AOC-4 Filing</div>
                      <div className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px]">!</div>
                    </div>
                    <div className="text-[10px] text-red-400 mt-0.5">Overdue: 15 Jan 2025</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="text-lg text-gray-400 mt-16 text-center font-light">
            From onboarding to tracking to execution all in one place.
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section 
        id="features" 
        data-animate-section="features"
        className={`relative z-10 px-4 sm:px-6 py-8 sm:py-20 md:py-32 border-t border-gray-800 ${visibleSections.has('features') ? 'section-visible' : 'section-hidden'}`}
      >
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light text-white mb-4 sm:mb-6 text-center px-4 animate-fade-in-up" style={{ animationDelay: '0.1s', opacity: visibleSections.has('features') ? 1 : 0 }}>
            Introducing our Compliance Tracker
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-gray-400 mb-4 sm:mb-12 md:mb-16 text-center font-light px-4">
            Move from scattered tracking to structured financial oversight.
          </p>

          {/* Mobile: Dot Indicators */}
          <div className="flex md:hidden justify-center gap-2 mb-4">
            {[0, 1, 2, 3, 4].map((index) => (
              <button
                key={index}
                onClick={() => setTrackerIndex(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  trackerIndex === index ? 'bg-white w-6' : 'bg-gray-600'
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>

          {/* Mobile: Carousel Container */}
          <div 
            className="md:hidden overflow-hidden max-w-6xl mx-auto px-2"
            {...createTouchHandlers('tracker', 5)}
          >
            <div 
              className="flex transition-transform duration-300 ease-in-out"
              style={{ transform: `translateX(-${trackerIndex * 100}%)` }}
            >
            {/* Business Impact Visibility */}
            <div className="w-full flex-shrink-0">
              <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-4 sm:p-6 md:p-8 min-h-[350px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300">
              <div className="mb-3 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Business Impact Visibility</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Understand compliance status across categories</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Category Coverage</div>
                  <div className="text-white text-sm font-light">Track compliance across Income Tax, GST, Payroll, RoC, and Renewals in one unified view.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Status Overview</div>
                  <div className="text-white text-sm font-light">Get real-time visibility into compliance health across all regulatory requirements.</div>
                </div>
              </div>
              {/* UI Preview */}
              <div className="mt-4 sm:mt-6 bg-[#0f0f0f] rounded-lg p-3 sm:p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Categories</div>
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-blue-500/50 rounded-full"></div>
                    <div className="w-1.5 h-1.5 bg-green-500/50 rounded-full"></div>
                    <div className="w-1.5 h-1.5 bg-yellow-500/50 rounded-full"></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Income Tax</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">12 active • 3 pending</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">GST</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">8 active • 2 overdue</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="text-xs text-white font-light">RoC</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">5 active • 1 pending</div>
                  </div>
                </div>
              </div>
              </div>
            </div>

            {/* Automated Due-Date Tracking */}
            <div className="w-full flex-shrink-0">
              <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-4 sm:p-6 md:p-8 min-h-[350px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300">
              <div className="mb-3 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Automated Due-Date Tracking</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Monitor tasks and deadlines</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Task Monitoring</div>
                  <div className="text-white text-sm font-light">Automatically track upcoming tasks, pending items, and overdue compliance requirements.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Smart Alerts</div>
                  <div className="text-white text-sm font-light">Receive timely notifications before deadlines to ensure nothing falls through the cracks.</div>
                </div>
              </div>
              {/* UI Preview */}
              <div className="mt-4 sm:mt-6 bg-[#0f0f0f] rounded-lg p-3 sm:p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Upcoming Tasks</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">TDS Payment</div>
                      <div className="text-[10px] text-gray-400">7 days</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Due: 25 Jan 2025</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">GSTR-1 Filing</div>
                      <div className="text-[10px] text-gray-400">14 days</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Due: 1 Feb 2025</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">AOC-4 Filing</div>
                      <div className="text-[10px] text-red-400">Overdue</div>
                    </div>
                    <div className="text-[10px] text-red-400 mt-0.5">Due: 15 Jan 2025</div>
                  </div>
                </div>
              </div>
              </div>
            </div>

            {/* Penalty Risk Awareness */}
            <div className="w-full flex-shrink-0">
              <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-4 sm:p-6 md:p-8 min-h-[350px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300">
              <div className="mb-3 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Penalty Risk Awareness</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Identify risks before they escalate</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Risk Detection</div>
                  <div className="text-white text-sm font-light">Identify delays and compliance gaps before they escalate into penalties or legal issues.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Penalty Calculation</div>
                  <div className="text-white text-sm font-light">Automatically calculate potential penalties based on delay periods and regulatory rules.</div>
                </div>
              </div>
              {/* UI Preview */}
              <div className="mt-4 sm:mt-6 bg-[#0f0f0f] rounded-lg p-3 sm:p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Risk Alerts</div>
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-red-500/50 rounded-full"></div>
                    <div className="w-1.5 h-1.5 bg-yellow-500/50 rounded-full"></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-red-800/30">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">AOC-4 Filing</div>
                      <div className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px]">High</div>
                    </div>
                    <div className="text-[10px] text-red-400 mt-0.5">₹15,000 penalty risk</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-yellow-800/30">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">GSTR-3B</div>
                      <div className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-[10px]">Medium</div>
                    </div>
                    <div className="text-[10px] text-yellow-400 mt-0.5">₹5,000 penalty risk</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">TDS Return</div>
                      <div className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-[10px]">Low</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">On track</div>
                  </div>
                </div>
              </div>
              </div>
            </div>

            {/* Role-Based Access */}
            <div className="w-full flex-shrink-0">
              <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-4 sm:p-6 md:p-8 min-h-[350px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300">
              <div className="mb-3 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Role-Based Access</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Structured permissions and control</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Permission Levels</div>
                  <div className="text-white text-sm font-light">Structured permissions across Viewer, Editor, Admin, and Superadmin roles.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Access Control</div>
                  <div className="text-white text-sm font-light">Granular control over who can view, edit, or manage compliance data and documents.</div>
                </div>
              </div>
              {/* UI Preview */}
              <div className="mt-4 sm:mt-6 bg-[#0f0f0f] rounded-lg p-3 sm:p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Team Roles</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">Admin</div>
                      <div className="text-[10px] text-blue-400">Full Access</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">2 members</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">Editor</div>
                      <div className="text-[10px] text-green-400">Edit Access</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">3 members</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">Viewer</div>
                      <div className="text-[10px] text-gray-400">Read Only</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">1 member</div>
                  </div>
                </div>
              </div>
              </div>
            </div>

            {/* Multi-Company Management */}
            <div className="w-full flex-shrink-0">
              <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300 md:col-span-2">
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Multi-Company Management</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Unified dashboard for all entities</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Unified Dashboard</div>
                  <div className="text-white text-sm font-light">Operate across multiple entities under one dashboard with seamless switching.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Entity Switching</div>
                  <div className="text-white text-sm font-light">Quickly switch between companies and maintain separate compliance tracking for each entity.</div>
                </div>
              </div>
              {/* UI Preview */}
              <div className="mt-4 sm:mt-6 bg-[#0f0f0f] rounded-lg p-3 sm:p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Active Companies</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Acme Corp Pvt Ltd</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">15 active compliances</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Tech Solutions LLP</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">8 active compliances</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="text-xs text-white font-light">Global Industries Ltd</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">12 active compliances</div>
                  </div>
                </div>
              </div>
              </div>
            </div>
            </div>
          </div>
          
          {/* Desktop: Grid */}
          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto px-4 sm:px-0">
            {/* Business Impact Visibility */}
            <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300">
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Business Impact Visibility</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Understand compliance status across categories</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Category Coverage</div>
                  <div className="text-white text-sm font-light">Track compliance across Income Tax, GST, Payroll, RoC, and Renewals in one unified view.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Status Overview</div>
                  <div className="text-white text-sm font-light">Get real-time visibility into compliance health across all regulatory requirements.</div>
                </div>
              </div>
              <div className="mt-6 bg-[#0f0f0f] rounded-lg p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Categories</div>
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-blue-500/50 rounded-full"></div>
                    <div className="w-1.5 h-1.5 bg-green-500/50 rounded-full"></div>
                    <div className="w-1.5 h-1.5 bg-yellow-500/50 rounded-full"></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Income Tax</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">12 active • 3 pending</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">GST</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">8 active • 2 overdue</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="text-xs text-white font-light">RoC</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">5 active • 1 pending</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Automated Due-Date Tracking */}
            <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300">
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Automated Due-Date Tracking</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Monitor tasks and deadlines</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Task Monitoring</div>
                  <div className="text-white text-sm font-light">Automatically track upcoming tasks, pending items, and overdue compliance requirements.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Smart Alerts</div>
                  <div className="text-white text-sm font-light">Receive timely notifications before deadlines to ensure nothing falls through the cracks.</div>
                </div>
              </div>
              <div className="mt-6 bg-[#0f0f0f] rounded-lg p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Upcoming Tasks</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">TDS Payment</div>
                      <div className="text-[10px] text-gray-400">7 days</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Due: 25 Jan 2025</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">GSTR-1 Filing</div>
                      <div className="text-[10px] text-gray-400">14 days</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Due: 1 Feb 2025</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">AOC-4 Filing</div>
                      <div className="text-[10px] text-red-400">Overdue</div>
                    </div>
                    <div className="text-[10px] text-red-400 mt-0.5">Due: 15 Jan 2025</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Penalty Risk Awareness */}
            <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300">
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Penalty Risk Awareness</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Identify risks before they escalate</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Risk Detection</div>
                  <div className="text-white text-sm font-light">Identify delays and compliance gaps before they escalate into penalties or legal issues.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Penalty Calculation</div>
                  <div className="text-white text-sm font-light">Automatically calculate potential penalties based on delay periods and regulatory rules.</div>
                </div>
              </div>
              <div className="mt-6 bg-[#0f0f0f] rounded-lg p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Risk Alerts</div>
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-red-500/50 rounded-full"></div>
                    <div className="w-1.5 h-1.5 bg-yellow-500/50 rounded-full"></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-red-800/30">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">AOC-4 Filing</div>
                      <div className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px]">High</div>
                    </div>
                    <div className="text-[10px] text-red-400 mt-0.5">₹15,000 penalty risk</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-yellow-800/30">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">GSTR-3B</div>
                      <div className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-[10px]">Medium</div>
                    </div>
                    <div className="text-[10px] text-yellow-400 mt-0.5">₹5,000 penalty risk</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">TDS Return</div>
                      <div className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-[10px]">Low</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">On track</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Role-Based Access */}
            <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300">
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Role-Based Access</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Structured permissions and control</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Permission Levels</div>
                  <div className="text-white text-sm font-light">Structured permissions across Viewer, Editor, Admin, and Superadmin roles.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Access Control</div>
                  <div className="text-white text-sm font-light">Granular control over who can view, edit, or manage compliance data and documents.</div>
                </div>
              </div>
              <div className="mt-6 bg-[#0f0f0f] rounded-lg p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Team Roles</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">Admin</div>
                      <div className="text-[10px] text-blue-400">Full Access</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">2 members</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">Editor</div>
                      <div className="text-[10px] text-green-400">Edit Access</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">3 members</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white font-light">Viewer</div>
                      <div className="text-[10px] text-gray-400">Read Only</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">1 member</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Multi-Company Management */}
            <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300 md:col-span-2">
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Multi-Company Management</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Unified dashboard for all entities</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Unified Dashboard</div>
                  <div className="text-white text-sm font-light">Operate across multiple entities under one dashboard with seamless switching.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Entity Switching</div>
                  <div className="text-white text-sm font-light">Quickly switch between companies and maintain separate compliance tracking for each entity.</div>
                </div>
              </div>
              <div className="mt-6 bg-[#0f0f0f] rounded-lg p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Active Companies</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Acme Corp Pvt Ltd</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">15 active compliances</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Tech Solutions LLP</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">8 active compliances</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="text-xs text-white font-light">Global Industries Ltd</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">12 active compliances</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Company Onboarding Engine Section */}
      <section
        data-animate-section="onboarding"
        className={`relative z-10 px-4 sm:px-6 py-8 sm:py-20 md:py-32 border-t border-gray-800 ${visibleSections.has('onboarding') ? 'section-visible' : 'section-hidden'}`}
      >
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light text-white mb-4 sm:mb-12 text-center px-4 animate-fade-in-up" style={{ animationDelay: '0.1s', opacity: visibleSections.has('onboarding') ? 1 : 0 }}>
            Company Onboarding Engine
          </h2>
          
          {/* Mobile: Dot Indicators */}
          <div className="flex md:hidden justify-center gap-2 mb-4">
            {[0, 1, 2, 3, 4].map((index) => (
              <button
                key={index}
                onClick={() => setOnboardingIndex(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  onboardingIndex === index ? 'bg-white w-6' : 'bg-gray-600'
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>

          {/* Mobile: Carousel Container */}
          <div 
            className="md:hidden overflow-hidden max-w-6xl mx-auto px-2"
            {...createTouchHandlers('onboarding', 5)}
          >
            <div 
              className="flex transition-transform duration-300 ease-in-out"
              style={{ transform: `translateX(-${onboardingIndex * 100}%)` }}
            >
            {/* CIN Verification Card */}
            <div className="w-full flex-shrink-0">
              <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-4 sm:p-6 md:p-8 min-h-[350px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300">
              <div className="mb-3 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">CIN Verification</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">MCA auto-fill</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Auto-Fill</div>
                  <div className="text-white text-sm font-light">Automatically fetch and populate company details from MCA database using CIN.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Verification</div>
                  <div className="text-white text-sm font-light">Verify company authenticity and retrieve comprehensive registration information.</div>
                </div>
              </div>
              {/* UI Preview */}
              <div className="mt-4 sm:mt-6 bg-[#0f0f0f] rounded-lg p-3 sm:p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Company Details</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">CIN: U12345MH2020PTC</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Status: Verified</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Company Name</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Auto-filled from MCA</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="text-xs text-white font-light">Registration Date</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">15 Jan 2020</div>
                  </div>
                </div>
              </div>
              </div>
            </div>

            {/* DIN Verification Card */}
            <div className="w-full flex-shrink-0">
              <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-4 sm:p-6 md:p-8 min-h-[350px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300">
              <div className="mb-3 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">DIN Verification</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Director identification</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Director Details</div>
                  <div className="text-white text-sm font-light">Verify director DIN and automatically fetch director information from MCA records.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Identity Check</div>
                  <div className="text-white text-sm font-light">Ensure director authenticity and validate their association with the company.</div>
                </div>
              </div>
              {/* UI Preview */}
              <div className="mt-4 sm:mt-6 bg-[#0f0f0f] rounded-lg p-3 sm:p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Directors</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">John Doe</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">DIN: 01234567</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Jane Smith</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">DIN: 01234568</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="text-xs text-white font-light">Robert Brown</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">DIN: 01234569</div>
                  </div>
                </div>
              </div>
              </div>
            </div>

            {/* Auto-Detection Card */}
            <div className="w-full flex-shrink-0">
              <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-4 sm:p-6 md:p-8 min-h-[350px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300">
              <div className="mb-3 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Auto-Detection</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Company type & industry</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Type Detection</div>
                  <div className="text-white text-sm font-light">Automatically identify company type (Pvt Ltd, LLP, Public Ltd) from registration data.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Industry Classification</div>
                  <div className="text-white text-sm font-light">Detect and classify industry category based on business activities and registration details.</div>
                </div>
              </div>
              {/* UI Preview */}
              <div className="mt-4 sm:mt-6 bg-[#0f0f0f] rounded-lg p-3 sm:p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Classification</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Type: Private Limited</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Detected from CIN</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Industry: Technology</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Software Development</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="text-xs text-white font-light">Category: IT Services</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Auto-classified</div>
                  </div>
                </div>
              </div>
              </div>
            </div>

            {/* Director Management Card */}
            <div className="w-full flex-shrink-0">
              <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-4 sm:p-6 md:p-8 min-h-[350px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300">
              <div className="mb-3 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Director Management</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Comprehensive director tracking</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Director Profiles</div>
                  <div className="text-white text-sm font-light">Maintain detailed director information including designation, appointment date, and contact details.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Role Assignment</div>
                  <div className="text-white text-sm font-light">Assign and track director roles, responsibilities, and designations within the company structure.</div>
                </div>
              </div>
              {/* UI Preview */}
              <div className="mt-4 sm:mt-6 bg-[#0f0f0f] rounded-lg p-3 sm:p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Directors</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Managing Director</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">John Doe • Active</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Director</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Jane Smith • Active</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="text-xs text-white font-light">Director</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Robert Brown • Active</div>
                  </div>
                </div>
              </div>
              </div>
            </div>

            {/* Entity Structuring Card */}
            <div className="w-full flex-shrink-0">
              <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300 md:col-span-2">
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Entity Structuring</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Organize company hierarchy</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Hierarchy Management</div>
                  <div className="text-white text-sm font-light">Create and manage complex entity structures with parent-subsidiary relationships and group hierarchies.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Relationship Mapping</div>
                  <div className="text-white text-sm font-light">Visualize and track relationships between entities, subsidiaries, and associated companies.</div>
                </div>
              </div>
              {/* UI Preview */}
              <div className="mt-4 sm:mt-6 bg-[#0f0f0f] rounded-lg p-3 sm:p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Entity Structure</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Parent Company</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Acme Holdings Pvt Ltd</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 ml-4">
                    <div className="text-xs text-white font-light">Subsidiary</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Acme Corp Pvt Ltd</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 ml-4 opacity-60">
                    <div className="text-xs text-white font-light">Subsidiary</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Tech Solutions LLP</div>
                  </div>
                </div>
              </div>
              </div>
            </div>
            </div>
          </div>
          
          {/* Desktop: Grid */}
          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto px-4 sm:px-0">
            {/* CIN Verification Card */}
            <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300">
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">CIN Verification</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">MCA auto-fill</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Auto-Fill</div>
                  <div className="text-white text-sm font-light">Automatically fetch and populate company details from MCA database using CIN.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Verification</div>
                  <div className="text-white text-sm font-light">Verify company authenticity and retrieve comprehensive registration information.</div>
                </div>
              </div>
              <div className="mt-6 bg-[#0f0f0f] rounded-lg p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Company Details</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">CIN: U12345MH2020PTC</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Status: Verified</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Company Name</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Auto-filled from MCA</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="text-xs text-white font-light">Registration Date</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">15 Jan 2020</div>
                  </div>
                </div>
              </div>
            </div>

            {/* DIN Verification Card */}
            <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300">
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">DIN Verification</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Director identification</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Director Details</div>
                  <div className="text-white text-sm font-light">Verify director DIN and automatically fetch director information from MCA records.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Identity Check</div>
                  <div className="text-white text-sm font-light">Ensure director authenticity and validate their association with the company.</div>
                </div>
              </div>
              <div className="mt-6 bg-[#0f0f0f] rounded-lg p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Directors</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">John Doe</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">DIN: 01234567</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Jane Smith</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">DIN: 01234568</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="text-xs text-white font-light">Robert Brown</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">DIN: 01234569</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Auto-Detection Card */}
            <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300">
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Auto-Detection</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Company type & industry</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Type Detection</div>
                  <div className="text-white text-sm font-light">Automatically identify company type (Pvt Ltd, LLP, Public Ltd) from registration data.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Industry Classification</div>
                  <div className="text-white text-sm font-light">Detect and classify industry category based on business activities and registration details.</div>
                </div>
              </div>
              <div className="mt-6 bg-[#0f0f0f] rounded-lg p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Classification</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Type: Private Limited</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Detected from CIN</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Industry: Technology</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Software Development</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="text-xs text-white font-light">Category: IT Services</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Auto-classified</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Director Management Card */}
            <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300">
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Director Management</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Comprehensive director tracking</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Director Profiles</div>
                  <div className="text-white text-sm font-light">Maintain detailed director information including designation, appointment date, and contact details.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Role Assignment</div>
                  <div className="text-white text-sm font-light">Assign and track director roles, responsibilities, and designations within the company structure.</div>
                </div>
              </div>
              <div className="mt-6 bg-[#0f0f0f] rounded-lg p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Directors</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Managing Director</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">John Doe • Active</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Director</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Jane Smith • Active</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 opacity-60">
                    <div className="text-xs text-white font-light">Director</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Robert Brown • Active</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Entity Structuring Card */}
            <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300 md:col-span-2">
              <div className="mb-4 sm:mb-6">
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">Entity Structuring</div>
                <p className="text-gray-400 font-light text-xs sm:text-sm">Organize company hierarchy</p>
              </div>
              <div className="flex-1 space-y-3 sm:space-y-4">
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Hierarchy Management</div>
                  <div className="text-white text-sm font-light">Create and manage complex entity structures with parent-subsidiary relationships and group hierarchies.</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 border border-gray-800/50">
                  <div className="text-xs text-gray-500 uppercase mb-2 font-light">Relationship Mapping</div>
                  <div className="text-white text-sm font-light">Visualize and track relationships between entities, subsidiaries, and associated companies.</div>
                </div>
              </div>
              <div className="mt-6 bg-[#0f0f0f] rounded-lg p-4 border border-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-light">Entity Structure</div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50">
                    <div className="text-xs text-white font-light">Parent Company</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Acme Holdings Pvt Ltd</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 ml-4">
                    <div className="text-xs text-white font-light">Subsidiary</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Acme Corp Pvt Ltd</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded px-3 py-2 border border-gray-800/50 ml-4 opacity-60">
                    <div className="text-xs text-white font-light">Subsidiary</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Tech Solutions LLP</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* IAM Section */}
      <section 
        data-animate-section="iam"
        className={`relative z-10 px-4 sm:px-6 py-12 sm:py-20 md:py-32 border-t border-gray-800 ${visibleSections.has('iam') ? 'section-visible' : 'section-hidden'}`}
      >
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light text-white mb-0 text-center px-4 animate-fade-in-up" style={{ animationDelay: '0.1s', opacity: visibleSections.has('iam') ? 1 : 0 }}>
            IAM (Identity Access Management)
          </h2>
          <div className="max-w-7xl mx-auto -mt-2 sm:-mt-4 overflow-x-auto">
            {/* Flowchart Mindmap */}
            <div className="relative w-full" style={{ minHeight: '400px', minWidth: '800px' }}>
              <svg viewBox="0 0 1200 550" className="w-full h-auto -mt-2">
                <defs>
                  <marker id="arrowhead" markerWidth="12" markerHeight="12" refX="11" refY="4" orient="auto">
                    <polygon points="0 0, 12 4, 0 8" fill="rgba(255,255,255,0.5)" />
                  </marker>
                  <linearGradient id="nodeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#2a2a2a" />
                    <stop offset="100%" stopColor="#1a1a1a" />
                  </linearGradient>
                  <linearGradient id="subNodeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#2f2f2f" />
                    <stop offset="100%" stopColor="#252525" />
                  </linearGradient>
                </defs>

                {/* Step 1: Invite team members */}
                <rect x="50" y="200" width="180" height="100" rx="8" fill="url(#nodeGrad)" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" />
                <text x="140" y="240" fill="white" fontSize="18" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Invite</text>
                <text x="140" y="265" fill="white" fontSize="18" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Team Members</text>

                {/* Curved Arrow 1: Invite → Assign */}
                <path d="M 230 250 Q 350 220, 470 250" stroke="rgba(255,255,255,0.5)" strokeWidth="3" fill="none" markerEnd="url(#arrowhead)" />

                {/* Step 2: Assign roles */}
                <rect x="470" y="200" width="180" height="100" rx="8" fill="url(#nodeGrad)" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" />
                <text x="560" y="240" fill="white" fontSize="18" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Assign</text>
                <text x="560" y="265" fill="white" fontSize="18" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Roles</text>

                {/* Sub-nodes: Admin, Editor, Viewer */}
                {/* Admin */}
                <rect x="420" y="340" width="120" height="70" rx="6" fill="url(#subNodeGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
                <text x="480" y="375" fill="white" fontSize="15" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Admin</text>
                <path d="M 560 300 Q 560 320, 480 340" stroke="rgba(255,255,255,0.4)" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />

                {/* Editor */}
                <rect x="550" y="340" width="120" height="70" rx="6" fill="url(#subNodeGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
                <text x="610" y="375" fill="white" fontSize="15" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Editor</text>
                <path d="M 560 300 Q 560 320, 610 340" stroke="rgba(255,255,255,0.4)" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />

                {/* Viewer */}
                <rect x="680" y="340" width="120" height="70" rx="6" fill="url(#subNodeGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
                <text x="740" y="375" fill="white" fontSize="15" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Viewer</text>
                <path d="M 650 300 Q 650 320, 740 340" stroke="rgba(255,255,255,0.4)" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />

                {/* Curved Arrow 2: Assign → Track */}
                <path d="M 650 250 Q 800 220, 950 250" stroke="rgba(255,255,255,0.5)" strokeWidth="3" fill="none" markerEnd="url(#arrowhead)" />

                {/* Step 3: Track responsibility */}
                <rect x="950" y="200" width="180" height="100" rx="8" fill="url(#nodeGrad)" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" />
                <text x="1040" y="240" fill="white" fontSize="18" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Track</text>
                <text x="1040" y="265" fill="white" fontSize="18" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Responsibility</text>

                {/* Curved Arrow 3: Track → Revoke (downward curve) */}
                <path d="M 1040 300 Q 1040 350, 1040 400" stroke="rgba(255,255,255,0.5)" strokeWidth="3" fill="none" markerEnd="url(#arrowhead)" />

                {/* Step 4: Revoke access */}
                <rect x="950" y="400" width="180" height="100" rx="8" fill="url(#nodeGrad)" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" />
                <text x="1040" y="440" fill="white" fontSize="18" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Revoke</text>
                <text x="1040" y="465" fill="white" fontSize="18" fontFamily="sans-serif" fontWeight="300" textAnchor="middle">Access</text>

                {/* Curved Arrow 4: Revoke → Assign (feedback loop - curved path) */}
                <path d="M 950 450 Q 700 450, 470 450 Q 470 350, 470 300" stroke="rgba(255,255,255,0.5)" strokeWidth="3" fill="none" markerEnd="url(#arrowhead)" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* Plans Section */}
      <section
        id="plans"
        data-animate-section="plans"
        className={`relative z-10 px-4 sm:px-6 py-12 sm:py-20 md:py-32 border-t border-gray-800 ${visibleSections.has('plans') ? 'section-visible' : 'section-hidden'}`}
      >
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light text-white mb-8 sm:mb-12 md:mb-16 text-center px-4 animate-fade-in-up" style={{ animationDelay: '0.1s', opacity: visibleSections.has('plans') ? 1 : 0 }}>
            Plans
          </h2>
          <EmbeddedPricing />
        </div>
      </section>

      {/* What's Next Section */}
      <section 
        data-animate-section="whats-next"
        className={`relative z-10 px-4 sm:px-6 py-12 sm:py-20 md:py-32 border-t border-gray-800 ${visibleSections.has('whats-next') ? 'section-visible' : 'section-hidden'}`}
      >
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light text-white mb-4 sm:mb-6 text-center px-4 animate-fade-in-up" style={{ animationDelay: '0.1s', opacity: visibleSections.has('whats-next') ? 1 : 0 }}>
            What's Next??
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-gray-400 mb-8 sm:mb-12 md:mb-16 text-center font-light px-4 animate-fade-in-up" style={{ animationDelay: '0.2s', opacity: visibleSections.has('whats-next') ? 1 : 0 }}>
            Finacra is evolving into an intelligent compliance system.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto px-4 sm:px-0">
            {[
              { title: 'AI document analysis', desc: 'Extract key information automatically.' },
              { title: 'Semantic document search', desc: 'Search by meaning, not just file names.' },
              { title: 'Automated alerts', desc: 'Email reminders and compliance notifications.' },
              { title: 'Reporting & analytics', desc: 'Compliance health dashboards and trends.' },
              { title: 'Calendar sync', desc: 'Due dates integrated into workflows.' },
              { title: 'Integrations', desc: 'GST, MCA, accounting tools, and financial systems.' }
            ].map((item, index) => (
              <div 
                key={index}
                className={`bg-[#1a1a1a] border border-gray-800 rounded-xl p-5 sm:p-6 md:p-8 card-hidden hover:border-gray-700 transition-all duration-300 ${visibleSections.has('whats-next') ? 'card-visible' : ''}`}
                style={{ transitionDelay: visibleSections.has('whats-next') ? `${0.3 + index * 0.08}s` : '0s' }}
              >
                <h3 className="text-lg sm:text-xl font-light text-white mb-2 sm:mb-3">{item.title}</h3>
                <p className="text-gray-400 text-xs sm:text-sm font-light">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section
        id="contact"
        data-animate-section="cta"
        className={`relative z-10 px-4 sm:px-6 py-12 sm:py-20 md:py-32 border-t border-gray-800 ${visibleSections.has('cta') ? 'section-visible' : 'section-hidden'}`}
      >
        <div className="max-w-4xl mx-auto text-center px-4">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light text-white mb-8 sm:mb-12 animate-fade-in-up" style={{ animationDelay: '0.1s', opacity: visibleSections.has('cta') ? 1 : 0 }}>
            Automate compliance. Structure your financial operations. Reduce dependency on manual tracking.
          </h2>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center animate-fade-in-up" style={{ animationDelay: '0.3s', opacity: visibleSections.has('cta') ? 1 : 0 }}>
            <Link
              href="/subscribe"
              className="px-6 sm:px-8 py-3 sm:py-4 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-all duration-300 font-light text-sm sm:text-base min-h-[44px] flex items-center justify-center"
            >
              Start Trial for free
            </Link>
            <Link
              href="/contact"
              className="px-6 sm:px-8 py-3 sm:py-4 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-all duration-300 font-light text-sm sm:text-base min-h-[44px] flex items-center justify-center"
            >
              Talk to Us
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer 
        data-animate-section="footer"
        className={`relative z-10 border-t border-gray-800 px-4 sm:px-6 py-12 sm:py-16 ${visibleSections.has('footer') ? 'section-visible' : 'section-hidden'}`}
      >
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-6 sm:gap-8 md:gap-12 mb-6 sm:mb-8 md:mb-12">
            <div>
              <h3 className="text-white text-base sm:text-lg font-light mb-3 sm:mb-4">Finnogenius Consulting Private Limited</h3>
              <p className="text-gray-400 text-xs sm:text-sm font-light mb-3">Hyderabad, India</p>
              <div className="flex gap-4 mt-4">
                <a 
                  href="https://www.instagram.com/finacra.ai/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                  aria-label="Instagram"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>
                <a 
                  href="https://www.linkedin.com/company/finacra/posts/?feedView=all" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                  aria-label="LinkedIn"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </a>
              </div>
            </div>
            <div>
              <h4 className="text-white text-sm sm:text-base font-light mb-3 sm:mb-4">Contact</h4>
              <p className="text-gray-400 text-xs sm:text-sm font-light mb-2">
                <a href="mailto:info@finacra.com" className="hover:text-white transition-colors">
                  info@finacra.com
                </a>
              </p>
              <p className="text-gray-400 text-xs sm:text-sm font-light">
                <a href="tel:+919652974428" className="hover:text-white transition-colors">
                  +91 96529 74428
                </a>
              </p>
            </div>
            <div>
              <h4 className="text-white text-sm sm:text-base font-light mb-3 sm:mb-4">Quick Links</h4>
              <div className="flex flex-col gap-2">
                <Link href="/home#plans" className="text-gray-400 text-xs sm:text-sm font-light hover:text-white transition-colors">
                  Pricing
                </Link>
                <Link href="/contact" className="text-gray-400 text-xs sm:text-sm font-light hover:text-white transition-colors">
                  Contact Us
                </Link>
                <Link href="/home#products" className="text-gray-400 text-xs sm:text-sm font-light hover:text-white transition-colors">
                  Products
                </Link>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 sm:pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-3 sm:gap-4">
              <span className="text-gray-400 text-xs sm:text-sm font-light text-center md:text-left">
                © 2024 FinacraAI. All rights reserved.
              </span>
              <div className="flex gap-6 sm:gap-8 text-xs sm:text-sm">
                <Link href="/privacy-policy" className="text-gray-400 hover:text-white transition-colors font-light">
                  Privacy Policy
                </Link>
                <Link href="/terms-of-service" className="text-gray-400 hover:text-white transition-colors font-light">
                  Terms of Service
                </Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
