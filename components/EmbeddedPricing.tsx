'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PRICING_TIERS, getTierPricing, formatPrice, type BillingCycle } from '@/lib/pricing/tiers'

export default function EmbeddedPricing() {
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<BillingCycle>('annual')
  
  // Filter to only show Starter and Enterprise (remove Professional)
  const displayTiers = PRICING_TIERS.filter(tier => tier.id === 'starter' || tier.id === 'enterprise')

  const billingCycles: { value: BillingCycle; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'half-yearly', label: 'Half-Yearly' },
    { value: 'annual', label: 'Annual' },
  ]

  return (
    <div className="w-full">
      {/* Billing Cycle Selector */}
      <div className="flex items-center justify-center gap-2 mb-12">
        {billingCycles.map((cycle) => (
          <button
            key={cycle.value}
            onClick={() => setSelectedBillingCycle(cycle.value)}
            className={`px-4 py-2 rounded-lg font-light text-sm transition-all ${
              selectedBillingCycle === cycle.value
                ? 'bg-gray-800 text-white border border-gray-700'
                : 'bg-transparent text-gray-400 border border-gray-800 hover:border-gray-700 hover:text-gray-300'
            }`}
          >
            {cycle.label}
          </button>
        ))}
      </div>

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
        {displayTiers.map((tier) => {
          const tierPricing = getTierPricing(tier)
          const selectedPricing = tierPricing.options.find(
            (opt) => opt.billingCycle === selectedBillingCycle
          )!

          return (
            <div
              key={tier.id}
              className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-10"
            >
              {/* Tier Header */}
              <div className="mb-6">
                <h3 className="text-3xl font-light text-white mb-4">{tier.name}</h3>
                <p className="text-gray-400 mb-6 font-light text-lg">{tier.description}</p>
                
                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-4xl font-light text-white">
                      {formatPrice(selectedPricing.price)}
                    </span>
                    {selectedBillingCycle !== 'monthly' && (
                      <span className="text-gray-500 text-sm font-light">
                        /{selectedBillingCycle === 'quarterly' ? 'quarter' : selectedBillingCycle === 'half-yearly' ? '6 months' : 'year'}
                      </span>
                    )}
                  </div>
                  {selectedBillingCycle !== 'monthly' && (
                    <div className="mt-2">
                      <span className="text-gray-400 text-sm font-light">
                        {formatPrice(selectedPricing.effectiveMonthly)}/month
                      </span>
                      {selectedPricing.savings && (
                        <span className="ml-2 text-gray-500 text-sm font-light">
                          Save {formatPrice(selectedPricing.savings)}
                        </span>
                      )}
                    </div>
                  )}
                  {selectedPricing.discount > 0 && (
                    <div className="mt-1">
                      <span className="text-gray-500 text-sm font-light">
                        {selectedPricing.discount}% discount
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-4 text-gray-300 mb-8 font-light">
                {tier.id === 'starter' ? (
                  <>
                    <li className="flex items-start">
                      <span className="text-gray-500 mr-3">•</span>
                      <span>Limited reports</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-gray-500 mr-3">•</span>
                      <span>Up to 3 team members</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-gray-500 mr-3">•</span>
                      <span>Compliance tracking access</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-gray-500 mr-3">•</span>
                      <span>Basic CIN/DIN verification</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-gray-500 mr-3">•</span>
                      <span>Document storage (10GB)</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-gray-500 mr-3">•</span>
                      <span>Email support</span>
                    </li>
                  </>
                ) : (
                  <>
                    <li className="flex items-start">
                      <span className="text-gray-500 mr-3">•</span>
                      <span>Custom pricing</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-gray-500 mr-3">•</span>
                      <span>Multiple company access (up to 100)</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-gray-500 mr-3">•</span>
                      <span>Advanced reporting (coming soon)</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-gray-500 mr-3">•</span>
                      <span>Large teams & structured permissions</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-gray-500 mr-3">•</span>
                      <span>24/7 priority support</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-gray-500 mr-3">•</span>
                      <span>Dedicated account manager</span>
                    </li>
                  </>
                )}
              </ul>

              {/* CTA Button */}
              <Link
                href={`/pricing?plan=${tier.id}&billing=${selectedBillingCycle}`}
                className="block w-full px-6 py-3 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors text-center font-light"
              >
                {tier.id === 'enterprise' ? 'Contact Sales' : 'Get Started'}
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
