'use client'

import { useState, useEffect, useRef } from 'react'
import Header from '@/components/Header'
import SubtleCircuitBackground from '@/components/SubtleCircuitBackground'

export default function ComplianceTrackerPage() {
  const [trackerIndex, setTrackerIndex] = useState(0)
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set(['features']))

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

    if (carouselType === 'tracker') {
      if (isLeftSwipe && trackerIndex < totalSlides - 1) {
        setTrackerIndex(trackerIndex + 1)
      }
      if (isRightSwipe && trackerIndex > 0) {
        setTrackerIndex(trackerIndex - 1)
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
      <Header />
      
      <div className="relative z-10 px-4 sm:px-6 py-8 sm:py-20 md:py-32">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light text-white mb-4 sm:mb-6 text-center px-4">
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
          <div className="hidden md:grid md:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto px-4 sm:px-0">
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
          </div>

          {/* Second Row - Centered Two Cards */}
          <div className="hidden md:flex md:justify-center md:items-stretch md:gap-4 md:gap-6 w-full mt-4 sm:mt-6">
            {/* Role-Based Access */}
            <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300 w-full max-w-[400px]">
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
            <div className="bg-[#1a1a1a] border border-gray-700/30 rounded-xl p-5 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[500px] flex flex-col hover:border-gray-700/50 transition-all duration-300 w-full max-w-[400px]">
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
      </div>
    </div>
  )
}
