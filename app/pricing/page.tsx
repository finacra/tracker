'use client'

import { Suspense } from 'react'
import PricingTiers from '@/components/features/PricingTiers'
import SubtleCircuitBackground from '@/components/ui/SubtleCircuitBackground'
import PublicHeader from '@/components/layout/PublicHeader'

function PricingContent() {
  return (
    <div className="min-h-screen bg-bg-base relative overflow-hidden">
      <SubtleCircuitBackground />
      
      <div className="relative z-10">
        <PublicHeader />
        <PricingTiers />
      </div>
    </div>
  )
}

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bg-base relative overflow-hidden">
        <SubtleCircuitBackground />
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-fg-primary">Loading...</div>
        </div>
      </div>
    }>
      <PricingContent />
    </Suspense>
  )
}
