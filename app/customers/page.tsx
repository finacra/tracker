'use client'

import Link from 'next/link'
import PublicHeader from '@/components/layout/PublicHeader'
import SubtleCircuitBackground from '@/components/ui/SubtleCircuitBackground'

const clients = [
  'CA Muneer & Associates',
  'RAZR Business',
  'CaterKraft',
  'IcePulse',
  'Dine Desk',
  'Ureserve',
  'Radiant Sage Ventures',
  'GTM'
]

export default function CustomersPage() {
  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      <SubtleCircuitBackground />
      <PublicHeader />
      
      {/* Back Button */}
      <div className="relative z-10 px-4 sm:px-6 pt-4">
        <Link
          href="/home"
          className="inline-flex items-center gap-2 text-fg-muted hover:text-white transition-colors font-light text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </Link>
      </div>
      
      <div className="relative z-10 container mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-light text-white mb-4 sm:mb-6 text-center">
            Our Customers
          </h1>
          <p className="text-base sm:text-lg text-fg-muted mb-12 sm:mb-16 text-center font-light max-w-3xl mx-auto">
            Trusted by businesses across industries to streamline their compliance and financial operations.
          </p>

          {/* Customer Cards Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {clients.map((client, index) => (
              <div 
                key={index}
                className="bg-bg-card border border-line/10 rounded-xl p-6 sm:p-8 hover:border-line/15 transition-all duration-300"
              >
                <div className="flex items-center justify-center h-full min-h-[120px]">
                  <h3 className="text-lg sm:text-xl font-light text-white text-center">
                    {client}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
