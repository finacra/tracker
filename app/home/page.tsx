'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import EmbeddedPricing from '@/components/EmbeddedPricing'
import PublicHeader from '@/components/PublicHeader'
import { trackProductInteraction, trackButtonClick, trackLinkClick } from '@/lib/analytics'

export default function HomePage() {
  const [hoveredProduct, setHoveredProduct] = useState<string | null>(null)
  const [clickedProduct, setClickedProduct] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const graphicRefs = {
    compliance: useRef<HTMLDivElement>(null),
    vault: useRef<HTMLDivElement>(null),
    services: useRef<HTMLDivElement>(null),
    einvoicing: useRef<HTMLDivElement>(null),
    filing: useRef<HTMLDivElement>(null),
    ai: useRef<HTMLDivElement>(null),
  }
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set())
  
  // Handle product click - set clicked product and scroll to graphic
  const handleProductClick = (productId: string) => {
    setClickedProduct(productId)
    setHoveredProduct(productId)
    
    // Track product click
    const productNames: { [key: string]: string } = {
      compliance: 'Compliance Tracker',
      vault: 'Document Vault',
      services: 'Finacra Web Services',
      einvoicing: 'E-Invoicing',
      filing: 'Filing & Notices',
      ai: 'Finacra AI',
    }
    trackProductInteraction(productNames[productId] || productId, 'click', '/home')
    
    // Scroll to graphic on mobile/tablet
    if (isMobile && graphicRefs[productId as keyof typeof graphicRefs]?.current) {
      setTimeout(() => {
        graphicRefs[productId as keyof typeof graphicRefs].current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      }, 100)
    }
  }

  // Render product graphic for mobile view - shows full SVG but only the relevant graphic
  const renderProductGraphic = (productId: string) => {
    const activeProduct = clickedProduct || hoveredProduct
    const isActive = activeProduct === productId
    
    if (!isActive) return null
    
    return (
      <div className="relative h-[450px] sm:h-[550px] md:h-[600px] flex items-center justify-center">
        <svg
          className="w-full h-full"
          viewBox="0 0 1400 1000"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id={`boxGrad-mobile-${productId}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#888888" stopOpacity="0.25" />
            </linearGradient>
            <linearGradient id={`boxGradActive-mobile-${productId}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          {renderGraphicContent(productId, true, `mobile-${productId}`)}
        </svg>
      </div>
    )
  }

  // Render graphic content for a specific product
  const renderGraphicContent = (productId: string, isActive: boolean, suffix: string) => {
    if (!isActive) return null

    const boxGrad = `url(#boxGrad-${suffix})`
    const boxGradActive = `url(#boxGradActive-${suffix})`

    switch (productId) {
      case 'compliance':
        return (
          <g>
            <rect x="490" y="400" width="420" height="160" rx="12" fill={boxGradActive} stroke="rgba(255,255,255,0.7)" strokeWidth="5" />
            <text x="700" y="485" fill="white" fontSize="32" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Compliance Engine</text>
            <rect x="110" y="170" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="215" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Due Date</text>
            <text x="235" y="245" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Tracking</text>
            <line x1="360" y1="220" x2="530" y2="440" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="170" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="215" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Compliance</text>
            <text x="1165" y="245" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Type</text>
            <line x1="1040" y1="220" x2="870" y2="440" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="110" y="340" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="385" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Filing</text>
            <text x="235" y="415" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Status</text>
            <line x1="360" y1="390" x2="530" y2="460" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="340" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="385" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Penalty</text>
            <text x="1165" y="415" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Calculation</text>
            <line x1="1040" y1="390" x2="870" y2="460" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="110" y="730" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="775" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Status</text>
            <text x="235" y="805" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Management</text>
            <line x1="360" y1="780" x2="530" y2="500" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="730" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="775" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Category</text>
            <text x="1165" y="805" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Tracking</text>
            <line x1="1040" y1="780" x2="870" y2="500" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
          </g>
        )
      case 'vault':
        return (
          <g>
            <rect x="420" y="385" width="560" height="160" rx="12" fill={boxGradActive} stroke="rgba(255,255,255,0.7)" strokeWidth="5" />
            <text x="700" y="470" fill="white" fontSize="32" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Document Vault</text>
            <rect x="110" y="170" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="215" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Document</text>
            <text x="235" y="245" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Storage</text>
            <line x1="360" y1="220" x2="450" y2="430" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="170" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="215" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Folder</text>
            <text x="1165" y="245" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Structure</text>
            <line x1="1040" y1="220" x2="950" y2="430" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="110" y="340" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="385" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Role-Based</text>
            <text x="235" y="415" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Access</text>
            <line x1="360" y1="390" x2="450" y2="460" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="340" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="385" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Document</text>
            <text x="1165" y="415" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Templates</text>
            <line x1="1040" y1="390" x2="950" y2="460" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="110" y="730" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="775" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Search &</text>
            <text x="235" y="805" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Filter</text>
            <line x1="360" y1="780" x2="450" y2="490" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="730" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="775" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Document</text>
            <text x="1165" y="805" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Categories</text>
            <line x1="1040" y1="780" x2="950" y2="490" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
          </g>
        )
      case 'services':
        return (
          <g>
            <rect x="420" y="400" width="560" height="160" rx="12" fill={boxGradActive} stroke="rgba(255,255,255,0.7)" strokeWidth="5" />
            <text x="700" y="485" fill="white" fontSize="32" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">FWS Platform</text>
            <rect x="110" y="170" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="215" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Order</text>
            <text x="235" y="245" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Management</text>
            <line x1="360" y1="220" x2="450" y2="440" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="170" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="215" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Practice</text>
            <text x="1165" y="245" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Management</text>
            <line x1="1040" y1="220" x2="950" y2="440" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="110" y="340" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="385" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Client</text>
            <text x="235" y="415" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Management</text>
            <line x1="360" y1="390" x2="450" y2="470" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="340" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="385" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Process</text>
            <text x="1165" y="415" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Automation</text>
            <line x1="1040" y1="390" x2="950" y2="470" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="110" y="730" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="775" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Company</text>
            <text x="235" y="805" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Onboarding</text>
            <line x1="360" y1="780" x2="450" y2="500" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="730" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="775" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Workflow</text>
            <text x="1165" y="805" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Engine</text>
            <line x1="1040" y1="780" x2="950" y2="500" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
          </g>
        )
      case 'einvoicing':
        return (
          <g>
            <rect x="420" y="400" width="560" height="160" rx="12" fill={boxGradActive} stroke="rgba(255,255,255,0.7)" strokeWidth="5" />
            <text x="700" y="470" fill="white" fontSize="32" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">E-Invoicing</text>
            <text x="700" y="510" fill="white" fontSize="26" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Engine</text>
            <rect x="110" y="170" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="215" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Invoice</text>
            <text x="235" y="245" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Generation</text>
            <line x1="360" y1="220" x2="450" y2="440" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="170" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="215" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Regulatory</text>
            <text x="1165" y="245" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Compliance</text>
            <line x1="1040" y1="220" x2="950" y2="440" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="110" y="340" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="385" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Workflow</text>
            <text x="235" y="415" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Automation</text>
            <line x1="360" y1="390" x2="450" y2="470" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="340" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="385" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Document</text>
            <text x="1165" y="415" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Linking</text>
            <line x1="1040" y1="390" x2="950" y2="470" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="110" y="730" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="775" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Validation &</text>
            <text x="235" y="805" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Verification</text>
            <line x1="360" y1="780" x2="450" y2="500" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="730" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="775" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Invoice</text>
            <text x="1165" y="805" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Tracking</text>
            <line x1="1040" y1="780" x2="950" y2="500" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
          </g>
        )
      case 'filing':
        return (
          <g>
            <rect x="420" y="400" width="560" height="160" rx="12" fill={boxGradActive} stroke="rgba(255,255,255,0.7)" strokeWidth="5" />
            <text x="700" y="470" fill="white" fontSize="32" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Filing & Notices</text>
            <text x="700" y="510" fill="white" fontSize="26" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Hub</text>
            <rect x="110" y="170" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="215" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Filing</text>
            <text x="235" y="245" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Management</text>
            <line x1="360" y1="220" x2="450" y2="440" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="170" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="215" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Notice</text>
            <text x="1165" y="245" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Tracking</text>
            <line x1="1040" y1="220" x2="950" y2="440" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="110" y="340" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="385" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Status</text>
            <text x="235" y="415" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Updates</text>
            <line x1="360" y1="390" x2="450" y2="470" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="340" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="385" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Regulatory</text>
            <text x="1165" y="415" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Notices</text>
            <line x1="1040" y1="390" x2="950" y2="470" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="110" y="730" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="775" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Team</text>
            <text x="235" y="805" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Collaboration</text>
            <line x1="360" y1="780" x2="450" y2="500" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="730" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="775" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Entity</text>
            <text x="1165" y="805" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Management</text>
            <line x1="1040" y1="780" x2="950" y2="500" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
          </g>
        )
      case 'ai':
        return (
          <g>
            <rect x="420" y="400" width="560" height="160" rx="12" fill={boxGradActive} stroke="rgba(255,255,255,0.7)" strokeWidth="5" />
            <text x="700" y="470" fill="white" fontSize="32" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Finacra AI</text>
            <text x="700" y="510" fill="white" fontSize="26" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Engine</text>
            <rect x="110" y="170" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="215" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Document</text>
            <text x="235" y="245" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Understanding</text>
            <line x1="360" y1="220" x2="450" y2="440" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="170" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="215" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Compliance</text>
            <text x="1165" y="245" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Recommendations</text>
            <line x1="1040" y1="220" x2="950" y2="440" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="110" y="340" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="385" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Intelligent</text>
            <text x="235" y="415" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Search</text>
            <line x1="360" y1="390" x2="450" y2="470" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="340" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="385" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Pattern</text>
            <text x="1165" y="415" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Recognition</text>
            <line x1="1040" y1="390" x2="950" y2="470" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="110" y="730" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="235" y="775" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Data</text>
            <text x="235" y="805" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Extraction</text>
            <line x1="360" y1="780" x2="450" y2="500" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
            <rect x="1040" y="730" width="250" height="100" rx="8" fill={boxGrad} stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" />
            <text x="1165" y="775" fill="white" fontSize="22" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Predictive</text>
            <text x="1165" y="805" fill="white" fontSize="20" fontFamily="sans-serif" fontWeight="400" textAnchor="middle">Analytics</text>
            <line x1="1040" y1="780" x2="950" y2="500" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" />
          </g>
        )
      default:
        return null
    }
  }

  const [solutionIndex, setSolutionIndex] = useState(0)

  const handleSwipe = (section: 'solution', totalCards: number, direction: 'left' | 'right') => {
    if (direction === 'left') {
      if (section === 'solution') {
        setSolutionIndex((prev) => Math.min(prev + 1, totalCards - 1))
      }
    } else {
      if (section === 'solution') {
        setSolutionIndex((prev) => Math.max(prev - 1, 0))
      }
    }
  }

  const createTouchHandlers = (section: 'solution', totalCards: number) => {
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
    const checkMobile = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth < 1024)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
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
      window.removeEventListener('resize', checkMobile)
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
      <div className="animate-fade-in">
        <PublicHeader />
      </div>

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
                <span className="bg-gradient-to-r from-cyan-400/70 via-purple-400/70 to-pink-400/70 bg-clip-text text-transparent block mt-2 sm:mt-3 md:mt-4">
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
        className={`relative z-10 px-4 sm:px-6 pt-8 sm:pt-12 md:pt-16 pb-0 sm:pb-2 md:pb-4 border-t border-gray-800 ${visibleSections.has('products') ? 'section-visible' : 'section-hidden'}`}
      >
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light text-white mb-6 sm:mb-8 md:mb-10 text-center px-4 animate-fade-in-up" style={{ animationDelay: '0.1s', opacity: visibleSections.has('products') ? 1 : 0 }}>
            Our Products
          </h2>
          <div className="space-y-0">
              {/* Compliance Tracker */}
              <div
                className={`border-b border-gray-800 pb-4 sm:pb-5 md:pb-6 mb-4 sm:mb-5 md:mb-6 cursor-pointer transition-all duration-300 ${
                  hoveredProduct && hoveredProduct !== 'compliance' ? 'opacity-30' : 'opacity-100'
                }`}
                onMouseEnter={() => {
                  setClickedProduct(null) // Clear clicked product to prevent overlap
                  setHoveredProduct('compliance')
                  trackProductInteraction('Compliance Tracker', 'hover', '/home')
                }}
                onMouseLeave={() => setHoveredProduct(null)}
                onClick={() => handleProductClick('compliance')}
              >
                <div className={`grid ${(clickedProduct === 'compliance' || hoveredProduct === 'compliance') ? 'md:grid-cols-2' : ''} gap-4 md:gap-6 lg:gap-8 items-start`}>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-light text-white mb-2 sm:mb-3">
                      Compliance Tracker
                    </h3>
                    <p className="text-sm sm:text-base text-gray-400 leading-relaxed font-light mb-3">
                      Track statutory and regulatory requirements across GST, Income Tax, RoC, payroll, and renewals with structured status management and due-date monitoring.
                    </p>
                    {/* Mobile Graphic - Inline - Only show when active */}
                    {(clickedProduct === 'compliance' || hoveredProduct === 'compliance') && (
                      <div ref={graphicRefs.compliance} className="md:hidden mb-4">
                        {renderProductGraphic('compliance')}
                      </div>
                    )}
                    <Link href="/compliance-tracker">
                      <button 
                        onClick={() => trackButtonClick('Learn More - Compliance Tracker', '/home')}
                        className="px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-all duration-300 font-light text-sm"
                      >
                        Learn More
                      </button>
                    </Link>
                  </div>
                  {/* Desktop Graphic - Beside description */}
                  {(clickedProduct === 'compliance' || hoveredProduct === 'compliance') && (
                    <div className="hidden md:flex relative h-[400px] sm:h-[450px] lg:h-[500px] items-center justify-center">
                      <div className="w-full h-full">
                        <div className="relative h-[400px] sm:h-[450px] lg:h-[500px] flex items-center justify-center">
                          <svg
                            className="w-full h-full"
                            viewBox="0 0 1400 1000"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <defs>
                              <linearGradient id={`boxGrad-desktop-compliance`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
                                <stop offset="100%" stopColor="#888888" stopOpacity="0.25" />
                              </linearGradient>
                              <linearGradient id={`boxGradActive-desktop-compliance`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.35" />
                              </linearGradient>
                            </defs>
                            {renderGraphicContent('compliance', true, 'desktop-compliance')}
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Document Vault */}
              <div
                className={`border-b border-gray-800 pb-4 sm:pb-5 md:pb-6 mb-4 sm:mb-5 md:mb-6 cursor-pointer transition-all duration-300 ${
                  hoveredProduct && hoveredProduct !== 'vault' ? 'opacity-30' : 'opacity-100'
                }`}
                onMouseEnter={() => {
                  setClickedProduct(null) // Clear clicked product to prevent overlap
                  setHoveredProduct('vault')
                }}
                onMouseLeave={() => setHoveredProduct(null)}
                onClick={() => handleProductClick('vault')}
              >
                <div className={`grid ${(clickedProduct === 'vault' || hoveredProduct === 'vault') ? 'md:grid-cols-2' : ''} gap-4 md:gap-6 lg:gap-8 items-start`}>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-light text-white mb-2 sm:mb-3">
                      Document Vault
                    </h3>
                    <p className="text-sm sm:text-base text-gray-400 leading-relaxed font-light mb-3">
                      Secure storage and structured organization of financial and legal documents with role-based access.
                    </p>
                    {/* Mobile Graphic - Inline - Only show when active */}
                    {(clickedProduct === 'vault' || hoveredProduct === 'vault') && (
                      <div ref={graphicRefs.vault} className="md:hidden mb-4">
                        {renderProductGraphic('vault')}
                      </div>
                    )}
                  </div>
                  {/* Desktop Graphic - Beside description */}
                  {(clickedProduct === 'vault' || hoveredProduct === 'vault') && (
                    <div className="hidden md:flex relative h-[400px] sm:h-[450px] lg:h-[500px] items-center justify-center">
                      <div className="w-full h-full">
                        <div className="relative h-[400px] sm:h-[450px] lg:h-[500px] flex items-center justify-center">
                          <svg
                            className="w-full h-full"
                            viewBox="0 0 1400 1000"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <defs>
                              <linearGradient id={`boxGrad-desktop-vault`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
                                <stop offset="100%" stopColor="#888888" stopOpacity="0.25" />
                              </linearGradient>
                              <linearGradient id={`boxGradActive-desktop-vault`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.35" />
                              </linearGradient>
                            </defs>
                            {renderGraphicContent('vault', true, 'desktop-vault')}
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Finacra Web Services */}
              <div
                className={`border-b border-gray-800 pt-2 sm:pt-3 md:pt-4 pb-4 sm:pb-5 md:pb-6 mb-4 sm:mb-5 md:mb-6 cursor-pointer transition-all duration-300 ${
                  hoveredProduct && hoveredProduct !== 'services' ? 'opacity-30' : 'opacity-100'
                }`}
                onMouseEnter={() => {
                  setClickedProduct(null) // Clear clicked product to prevent overlap
                  setHoveredProduct('services')
                }}
                onMouseLeave={() => setHoveredProduct(null)}
                onClick={() => handleProductClick('services')}
              >
                <div className={`grid ${(clickedProduct === 'services' || hoveredProduct === 'services') ? 'md:grid-cols-2' : ''} gap-4 md:gap-6 lg:gap-8 items-start`}>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-light text-white mb-2 sm:mb-3">
                      Finacra Web Services <span className="text-xs sm:text-sm text-gray-500 font-light">(Coming Soon)</span>
                    </h3>
                    <p className="text-sm sm:text-base text-gray-400 leading-relaxed font-light mb-3">
                      Infrastructure layer that supports company onboarding, entity detection, compliance workflows, and administrative control.
                    </p>
                    {/* Mobile Graphic - Inline - Only show when active */}
                    {(clickedProduct === 'services' || hoveredProduct === 'services') && (
                      <div ref={graphicRefs.services} className="md:hidden mb-4">
                        {renderProductGraphic('services')}
                      </div>
                    )}
                    <Link href="/company-onboarding">
                      <button className="px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-all duration-300 font-light text-sm">
                        Learn More
                      </button>
                    </Link>
                  </div>
                  {/* Desktop Graphic - Beside description */}
                  {(clickedProduct === 'services' || hoveredProduct === 'services') && (
                    <div className="hidden md:flex relative h-[400px] sm:h-[450px] lg:h-[500px] items-center justify-center">
                      <div className="w-full h-full">
                        <div className="relative h-[400px] sm:h-[450px] lg:h-[500px] flex items-center justify-center">
                          <svg
                            className="w-full h-full"
                            viewBox="0 0 1400 1000"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <defs>
                              <linearGradient id={`boxGrad-desktop-services`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
                                <stop offset="100%" stopColor="#888888" stopOpacity="0.25" />
                              </linearGradient>
                              <linearGradient id={`boxGradActive-desktop-services`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.35" />
                              </linearGradient>
                            </defs>
                            {renderGraphicContent('services', true, 'desktop-services')}
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* E-Invoicing */}
              <div
                className={`border-b border-gray-800 pt-2 sm:pt-3 md:pt-4 pb-4 sm:pb-5 md:pb-6 mb-4 sm:mb-5 md:mb-6 cursor-pointer transition-all duration-300 ${
                  hoveredProduct && hoveredProduct !== 'einvoicing' ? 'opacity-30' : 'opacity-100'
                }`}
                onMouseEnter={() => {
                  setClickedProduct(null) // Clear clicked product to prevent overlap
                  setHoveredProduct('einvoicing')
                }}
                onMouseLeave={() => setHoveredProduct(null)}
                onClick={() => handleProductClick('einvoicing')}
              >
                <div className={`grid ${(clickedProduct === 'einvoicing' || hoveredProduct === 'einvoicing') ? 'md:grid-cols-2' : ''} gap-4 md:gap-6 lg:gap-8 items-start`}>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-light text-white mb-2 sm:mb-3">
                      E-Invoicing <span className="text-xs sm:text-sm text-gray-500 font-light">(Coming Soon)</span>
                    </h3>
                    <p className="text-sm sm:text-base text-gray-400 leading-relaxed font-light mb-3">
                      Automated & structured invoice workflows aligned with regulatory frameworks and documentation requirements.
                    </p>
                    {/* Mobile Graphic - Inline - Only show when active */}
                    {(clickedProduct === 'einvoicing' || hoveredProduct === 'einvoicing') && (
                      <div ref={graphicRefs.einvoicing} className="md:hidden mb-4">
                        {renderProductGraphic('einvoicing')}
                      </div>
                    )}
                  </div>
                  {/* Desktop Graphic - Beside description */}
                  {(clickedProduct === 'einvoicing' || hoveredProduct === 'einvoicing') && (
                    <div className="hidden md:flex relative h-[400px] sm:h-[450px] lg:h-[500px] items-center justify-center">
                      <div className="w-full h-full">
                        <div className="relative h-[400px] sm:h-[450px] lg:h-[500px] flex items-center justify-center">
                          <svg
                            className="w-full h-full"
                            viewBox="0 0 1400 1000"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <defs>
                              <linearGradient id={`boxGrad-desktop-einvoicing`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
                                <stop offset="100%" stopColor="#888888" stopOpacity="0.25" />
                              </linearGradient>
                              <linearGradient id={`boxGradActive-desktop-einvoicing`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.35" />
                              </linearGradient>
                            </defs>
                            {renderGraphicContent('einvoicing', true, 'desktop-einvoicing')}
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Filing & Notices */}
              <div
                className={`border-b border-gray-800 pt-2 sm:pt-3 md:pt-4 pb-4 sm:pb-5 md:pb-6 mb-4 sm:mb-5 md:mb-6 cursor-pointer transition-all duration-300 ${
                  hoveredProduct && hoveredProduct !== 'filing' ? 'opacity-30' : 'opacity-100'
                }`}
                onMouseEnter={() => {
                  setClickedProduct(null) // Clear clicked product to prevent overlap
                  setHoveredProduct('filing')
                }}
                onMouseLeave={() => setHoveredProduct(null)}
                onClick={() => handleProductClick('filing')}
              >
                <div className={`grid ${(clickedProduct === 'filing' || hoveredProduct === 'filing') ? 'md:grid-cols-2' : ''} gap-4 md:gap-6 lg:gap-8 items-start`}>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-light text-white mb-2 sm:mb-3">
                      Filing & Notices <span className="text-xs sm:text-sm text-gray-500 font-light">(Coming Soon)</span>
                    </h3>
                    <p className="text-sm sm:text-base text-gray-400 leading-relaxed font-light mb-3">
                      Track filings, regulatory notices, and status updates across teams and entities.
                    </p>
                    {/* Mobile Graphic - Inline - Only show when active */}
                    {(clickedProduct === 'filing' || hoveredProduct === 'filing') && (
                      <div ref={graphicRefs.filing} className="md:hidden mb-4">
                        {renderProductGraphic('filing')}
                      </div>
                    )}
                  </div>
                  {/* Desktop Graphic - Beside description */}
                  {(clickedProduct === 'filing' || hoveredProduct === 'filing') && (
                    <div className="hidden md:flex relative h-[400px] sm:h-[450px] lg:h-[500px] items-center justify-center">
                      <div className="w-full h-full">
                        <div className="relative h-[400px] sm:h-[450px] lg:h-[500px] flex items-center justify-center">
                          <svg
                            className="w-full h-full"
                            viewBox="0 0 1400 1000"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <defs>
                              <linearGradient id={`boxGrad-desktop-filing`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
                                <stop offset="100%" stopColor="#888888" stopOpacity="0.25" />
                              </linearGradient>
                              <linearGradient id={`boxGradActive-desktop-filing`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.35" />
                              </linearGradient>
                            </defs>
                            {renderGraphicContent('filing', true, 'desktop-filing')}
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Finacra AI */}
              <div
                className={`pt-2 sm:pt-3 md:pt-4 pb-0 cursor-pointer transition-all duration-300 ${
                  hoveredProduct && hoveredProduct !== 'ai' ? 'opacity-30' : 'opacity-100'
                }`}
                onMouseEnter={() => {
                  setClickedProduct(null) // Clear clicked product to prevent overlap
                  setHoveredProduct('ai')
                }}
                onMouseLeave={() => setHoveredProduct(null)}
                onClick={() => handleProductClick('ai')}
              >
                <div className={`grid ${(clickedProduct === 'ai' || hoveredProduct === 'ai') ? 'md:grid-cols-2' : ''} gap-4 md:gap-6 lg:gap-8 items-start`}>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-light text-white mb-2 sm:mb-3">
                      Finacra AI <span className="text-xs sm:text-sm text-gray-500 font-light">(Coming Soon)</span>
                    </h3>
                    <p className="text-sm sm:text-base text-gray-400 leading-relaxed font-light mb-3">
                      AI-powered document understanding, compliance recommendations, and intelligent search capabilities under development.
                    </p>
                    {/* Mobile Graphic - Inline - Only show when active */}
                    {(clickedProduct === 'ai' || hoveredProduct === 'ai') && (
                      <div ref={graphicRefs.ai} className="md:hidden mb-4">
                        {renderProductGraphic('ai')}
                      </div>
                    )}
                  </div>
                  {/* Desktop Graphic - Beside description */}
                  {(clickedProduct === 'ai' || hoveredProduct === 'ai') && (
                    <div className="hidden md:flex relative h-[400px] sm:h-[450px] lg:h-[500px] items-center justify-center">
                      <div className="w-full h-full">
                        <div className="relative h-[400px] sm:h-[450px] lg:h-[500px] flex items-center justify-center">
                          <svg
                            className="w-full h-full"
                            viewBox="0 0 1400 1000"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <defs>
                              <linearGradient id={`boxGrad-desktop-ai`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
                                <stop offset="100%" stopColor="#888888" stopOpacity="0.25" />
                              </linearGradient>
                              <linearGradient id={`boxGradActive-desktop-ai`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.35" />
                              </linearGradient>
                            </defs>
                            {renderGraphicContent('ai', true, 'desktop-ai')}
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
        </div>
      </section>

      {/* The Finacra Solution Section */}
      <section
        id="solution"
        data-animate-section="solution"
        className={`relative z-10 px-4 sm:px-6 pt-8 sm:pt-12 md:pt-24 pb-8 sm:pb-20 md:pb-32 border-t border-gray-800 ${visibleSections.has('solution') ? 'section-visible' : 'section-hidden'}`}
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
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">
                  Companies
                </div>
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
              <div className="mt-4">
                <Link href="/company-onboarding">
                  <button className="px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-all duration-300 font-light text-sm">
                    Learn More
                  </button>
                </Link>
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
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">
                  Compliance
                </div>
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
              <div className="mt-4">
                <Link href="/compliance-tracker">
                  <button className="px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-all duration-300 font-light text-sm">
                    Learn More
                  </button>
                </Link>
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
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">
                  Companies
                </div>
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
              <div className="mt-4">
                <Link href="/company-onboarding">
                  <button className="px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-all duration-300 font-light text-sm">
                    Learn More
                  </button>
                </Link>
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
                <div className="text-2xl sm:text-3xl md:text-4xl font-light text-white mb-2">
                  Compliance
                </div>
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
              <div className="mt-4">
                <Link href="/compliance-tracker">
                  <button className="px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-all duration-300 font-light text-sm">
                    Learn More
                  </button>
                </Link>
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
              <h3 className="text-white text-base sm:text-lg font-light mb-3 sm:mb-4">India</h3>
              <p className="text-gray-300 text-xs sm:text-sm font-light mb-2">Finnogenius Consulting Private Limited</p>
              <p className="text-gray-400 text-xs sm:text-sm font-light mb-4">
                4th Floor, Downtown Mall,<br />
                Lakdikapul, Khairatabad,<br />
                Hyderabad, Telangana, 500004
              </p>
              <h3 className="text-white text-base sm:text-lg font-light mb-3 sm:mb-4 mt-6">USA</h3>
              <p className="text-gray-300 text-xs sm:text-sm font-light mb-2">Finacra LLC</p>
              <p className="text-gray-400 text-xs sm:text-sm font-light mb-3">
                2302 Stillbrooke Lane,<br />
                Princeton, New Jersey, 08540
              </p>
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
                <a 
                  href="https://www.facebook.com/share/178PDtw15R/?mibextid=wwXIfr" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                  aria-label="Facebook"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>
                <a 
                  href="https://x.com/Finacraco" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                  aria-label="X (Twitter)"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
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
              <p className="text-gray-400 text-xs sm:text-sm font-light mb-2">
                <a href="tel:+16693097426" className="hover:text-white transition-colors">
                  +1 (669) 309-7426
                </a>
                <span className="text-gray-500 ml-1">- Global</span>
              </p>
              <p className="text-gray-400 text-xs sm:text-sm font-light">
                <span>+91</span>
                <span className="text-gray-500 ml-1">- India</span>
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
                © 2026 FinacraAI. All rights reserved.
              </span>
              <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs sm:text-sm">
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
