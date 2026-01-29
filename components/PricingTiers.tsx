'use client'

import { useState } from 'react'
import { PRICING_TIERS, getTierPricing, formatPrice, type BillingCycle, type PricingTier } from '@/lib/pricing/tiers'
import PaymentButton from './PaymentButton'

export default function PricingTiers() {
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<BillingCycle>('annual')
  const [hoveredTier, setHoveredTier] = useState<string | null>(null)

  const billingCycles: { value: BillingCycle; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'half-yearly', label: 'Half-Yearly' },
    { value: 'annual', label: 'Annual' },
  ]

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
          Choose Your Plan
        </h2>
        <p className="text-gray-400 text-lg mb-8">
          Select the perfect plan for your business needs
        </p>

        {/* Billing Cycle Selector */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {billingCycles.map((cycle) => (
            <button
              key={cycle.value}
              onClick={() => setSelectedBillingCycle(cycle.value)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                selectedBillingCycle === cycle.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {cycle.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
        {PRICING_TIERS.map((tier) => {
          const tierPricing = getTierPricing(tier)
          const selectedPricing = tierPricing.options.find(
            (opt) => opt.billingCycle === selectedBillingCycle
          )!

          return (
            <div
              key={tier.id}
              className={`relative rounded-2xl border-2 p-8 transition-all ${
                tier.popular
                  ? 'border-orange-500 bg-gradient-to-b from-gray-900 to-gray-800 scale-105 shadow-2xl shadow-orange-500/20'
                  : 'border-gray-700 bg-gray-900 hover:border-gray-600'
              } ${hoveredTier === tier.id ? 'transform scale-105' : ''}`}
              onMouseEnter={() => setHoveredTier(tier.id)}
              onMouseLeave={() => setHoveredTier(null)}
            >
              {/* Popular Badge */}
              {tier.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-orange-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                    Most Popular
                  </span>
                </div>
              )}

              {/* Tier Header */}
              <div className="mb-6">
                <h3 className="text-2xl font-bold mb-2">{tier.name}</h3>
                <p className="text-gray-400 text-sm mb-4">{tier.description}</p>

                {/* Price */}
                <div className="mb-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold">
                      {formatPrice(selectedPricing.price)}
                    </span>
                    {selectedBillingCycle !== 'monthly' && (
                      <span className="text-gray-500 text-sm">
                        /{selectedBillingCycle === 'quarterly' ? 'quarter' : selectedBillingCycle === 'half-yearly' ? '6 months' : 'year'}
                      </span>
                    )}
                  </div>
                  {selectedBillingCycle !== 'monthly' && (
                    <div className="mt-2">
                      <span className="text-gray-400 text-sm">
                        {formatPrice(selectedPricing.effectiveMonthly)}/month
                      </span>
                      {selectedPricing.savings && (
                        <span className="ml-2 text-green-400 text-sm font-medium">
                          Save {formatPrice(selectedPricing.savings)}
                        </span>
                      )}
                    </div>
                  )}
                  {selectedPricing.discount > 0 && (
                    <div className="mt-1">
                      <span className="text-orange-400 text-sm font-medium">
                        {selectedPricing.discount}% discount
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* CTA Button */}
              <PaymentButton
                tier={tier.id}
                billingCycle={selectedBillingCycle}
                price={selectedPricing.price}
                className={`w-full py-3 px-6 rounded-lg font-semibold transition-all mb-6 ${
                  tier.popular
                    ? 'bg-orange-500 hover:bg-orange-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700'
                }`}
              />

              {/* Features */}
              <div className="space-y-3">
                <div className="text-sm font-semibold text-gray-300 mb-3">Features:</div>
                {tier.features.map((feature, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <svg
                      className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-gray-300 text-sm">{feature}</span>
                  </div>
                ))}
              </div>

              {/* Limits Info */}
              <div className="mt-6 pt-6 border-t border-gray-700">
                <div className="text-xs text-gray-500 space-y-1">
                  <div>Companies: {tier.limits.companies === 'unlimited' ? 'Unlimited' : tier.limits.companies}</div>
                  <div>Storage: {tier.limits.storage}</div>
                  <div>Users: {tier.limits.users === 'unlimited' ? 'Unlimited' : tier.limits.users}</div>
                  <div>Support: {tier.limits.support}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Feature Comparison Table */}
      <div className="mt-16">
        <h3 className="text-2xl font-bold text-center mb-8">Feature Comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left p-4 text-gray-400 font-semibold">Feature</th>
                {PRICING_TIERS.map((tier) => (
                  <th key={tier.id} className="text-center p-4 font-semibold">
                    {tier.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-800">
                <td className="p-4 text-gray-300">Companies</td>
                {PRICING_TIERS.map((tier) => (
                  <td key={tier.id} className="p-4 text-center text-gray-400">
                    {tier.limits.companies === 'unlimited' ? 'Unlimited' : tier.limits.companies}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-800">
                <td className="p-4 text-gray-300">Storage</td>
                {PRICING_TIERS.map((tier) => (
                  <td key={tier.id} className="p-4 text-center text-gray-400">
                    {tier.limits.storage}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-800">
                <td className="p-4 text-gray-300">Team Members</td>
                {PRICING_TIERS.map((tier) => (
                  <td key={tier.id} className="p-4 text-center text-gray-400">
                    {tier.limits.users === 'unlimited' ? 'Unlimited' : tier.limits.users}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-800">
                <td className="p-4 text-gray-300">API Access</td>
                {PRICING_TIERS.map((tier) => (
                  <td key={tier.id} className="p-4 text-center">
                    {tier.limits.apiAccess ? (
                      <svg
                        className="w-5 h-5 text-green-400 mx-auto"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5 text-gray-600 mx-auto"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    )}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-800">
                <td className="p-4 text-gray-300">Support</td>
                {PRICING_TIERS.map((tier) => (
                  <td key={tier.id} className="p-4 text-center text-gray-400 capitalize">
                    {tier.limits.support}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-800">
                <td className="p-4 text-gray-300">CIN/DIN Verification</td>
                {PRICING_TIERS.map((tier) => (
                  <td key={tier.id} className="p-4 text-center text-gray-400">
                    {tier.id === 'starter' ? 'Basic' : tier.id === 'professional' ? 'Advanced' : 'Premium'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-4 text-gray-300">Compliance Tracking</td>
                {PRICING_TIERS.map((tier) => (
                  <td key={tier.id} className="p-4 text-center text-gray-400">
                    {tier.id === 'starter' ? 'Standard' : tier.id === 'professional' ? 'Advanced' : 'Advanced + Automation'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="mt-16">
        <h3 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h3>
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h4 className="font-semibold mb-2 text-orange-400">Can I change my plan later?</h4>
            <p className="text-gray-400 text-sm">
              Yes, you can upgrade or downgrade your plan at any time. Changes will be prorated.
            </p>
          </div>
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h4 className="font-semibold mb-2 text-orange-400">What payment methods do you accept?</h4>
            <p className="text-gray-400 text-sm">
              We accept all major credit cards, debit cards, UPI, and bank transfers through our secure payment gateway.
            </p>
          </div>
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h4 className="font-semibold mb-2 text-orange-400">Is there a free trial?</h4>
            <p className="text-gray-400 text-sm">
              We offer a 14-day free trial for all plans. No credit card required.
            </p>
          </div>
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h4 className="font-semibold mb-2 text-orange-400">What happens if I exceed my plan limits?</h4>
            <p className="text-gray-400 text-sm">
              We'll notify you when you're approaching your limits. You can upgrade your plan or purchase additional capacity.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
