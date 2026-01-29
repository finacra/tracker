'use client'

import PricingTiers from '@/components/PricingTiers'
import SubtleCircuitBackground from '@/components/SubtleCircuitBackground'

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      <SubtleCircuitBackground />
      
      <div className="relative z-10">
        <PricingTiers />
      </div>
    </div>
  )
}
