'use client'

import { Suspense } from 'react'
import PricingTiers from '@/components/PricingTiers'
import SubtleCircuitBackground from '@/components/SubtleCircuitBackground'

function PricingContent() {
  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      <SubtleCircuitBackground />
      
      <div className="relative z-10">
        <PricingTiers />
      </div>
    </div>
  )
}

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-primary-dark relative overflow-hidden">
        <SubtleCircuitBackground />
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-white">Loading...</div>
        </div>
      </div>
    }>
      <PricingContent />
    </Suspense>
  )
}
