'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import PublicHeader from '@/components/PublicHeader'
import SubtleCircuitBackground from '@/components/SubtleCircuitBackground'

export default function CompanyOnboardingPage() {
  const [onboardingIndex, setOnboardingIndex] = useState(0)

  // Touch handlers for mobile carousel
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)

  const minSwipeDistance = 50

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null
    touchStartX.current = e.targetTouches[0].clientX
  }

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX
  }

  const onTouchEnd = (carouselType: string, totalSlides: number) => {
    if (!touchStartX.current || !touchEndX.current) return
    const distance = touchStartX.current - touchEndX.current
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (carouselType === 'onboarding') {
      if (isLeftSwipe && onboardingIndex < totalSlides - 1) {
        setOnboardingIndex(onboardingIndex + 1)
      }
      if (isRightSwipe && onboardingIndex > 0) {
        setOnboardingIndex(onboardingIndex - 1)
      }
    }
  }

  const createTouchHandlers = (carouselType: string, totalSlides: number) => ({
    onTouchStart,
    onTouchMove,
    onTouchEnd: () => onTouchEnd(carouselType, totalSlides),
  })

  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      <SubtleCircuitBackground />
      <PublicHeader />
      
      {/* Back Button */}
      <div className="relative z-10 px-4 sm:px-6 pt-4">
        <Link
          href="/home"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors font-light text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </Link>
      </div>
      
      <div className="relative z-10 px-4 sm:px-6 py-8 sm:py-20 md:py-32">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light text-white mb-4 sm:mb-12 text-center px-4">
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
              <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-4 sm:p-6 md:p-8 min-h-[350px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300">
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
          <div className="hidden md:grid md:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto px-4 sm:px-0">
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

          </div>

          {/* Second Row - Centered Two Cards */}
          <div className="hidden md:flex md:justify-center md:items-stretch md:gap-4 md:gap-6 w-full mt-4 sm:mt-6">
            {/* Director Management Card */}
            <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300 w-full max-w-[400px]">
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
            <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300 w-full max-w-[400px]">
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
      </div>
    </div>
  )
}
