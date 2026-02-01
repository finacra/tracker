'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/utils/supabase/client'
import { PRICING_TIERS, getTierPricing, formatPrice, type BillingCycle } from '@/lib/pricing/tiers'
import { createTrialSubscription } from '@/lib/subscriptions/subscription'
import PaymentButton from '@/components/PaymentButton'
import SubtleCircuitBackground from '@/components/SubtleCircuitBackground'

function SubscribePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  
  const companyId = searchParams.get('company_id')
  
  const [companyName, setCompanyName] = useState<string>('')
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<BillingCycle>('annual')
  const [isStartingTrial, setIsStartingTrial] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch company name
  useEffect(() => {
    async function fetchCompany() {
      if (!companyId) return
      
      const { data } = await supabase
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .single()
      
      if (data) {
        setCompanyName(data.name)
      }
    }
    
    fetchCompany()
  }, [companyId, supabase])

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
    }
  }, [user, authLoading, router])

  const handleStartTrial = async () => {
    if (!user || !companyId) {
      setError('Missing user or company information')
      return
    }

    setIsStartingTrial(true)
    setError(null)

    try {
      const result = await createTrialSubscription(user.id, companyId, 15)
      
      if (result.success) {
        router.push('/data-room')
      } else {
        setError(result.error || 'Failed to start trial')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start trial')
    } finally {
      setIsStartingTrial(false)
    }
  }

  const billingCycles: { value: BillingCycle; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'half-yearly', label: 'Half-Yearly' },
    { value: 'annual', label: 'Annual' },
  ]

  if (authLoading) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-orange border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!companyId) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center px-4">
        <div className="bg-primary-dark-card border border-gray-800 rounded-2xl p-8 max-w-md text-center">
          <h1 className="text-2xl font-light text-white mb-4">No Company Selected</h1>
          <p className="text-gray-400 mb-6">Please create a company first to subscribe.</p>
          <button
            onClick={() => router.push('/onboarding')}
            className="bg-primary-orange text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-orange/90 transition-colors"
          >
            Create Company
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      <SubtleCircuitBackground />
      
      <div className="relative z-10 container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
            Choose Your Plan
          </h1>
          {companyName && (
            <p className="text-gray-400 text-lg mb-2">
              Subscribe for <span className="text-white font-medium">{companyName}</span>
            </p>
          )}
          <p className="text-gray-500 text-sm">
            Select a plan to unlock all features, or start with a free 15-day trial
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="max-w-md mx-auto mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-center">
            {error}
          </div>
        )}

        {/* Pay Later / Trial Option */}
        <div className="max-w-2xl mx-auto mb-12">
          <div className="bg-gradient-to-r from-primary-orange/10 to-orange-600/10 border border-primary-orange/30 rounded-2xl p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <svg className="w-6 h-6 text-primary-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xl font-semibold text-white">Not ready to commit?</span>
            </div>
            <p className="text-gray-400 mb-4">
              Start with a <span className="text-primary-orange font-semibold">15-day free trial</span> — no credit card required. 
              You can upgrade anytime.
            </p>
            <button
              onClick={handleStartTrial}
              disabled={isStartingTrial}
              className="bg-primary-orange text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-orange/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isStartingTrial ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Starting Trial...
                </span>
              ) : (
                'Start 15-Day Free Trial'
              )}
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 max-w-4xl mx-auto mb-12">
          <div className="flex-1 h-px bg-gray-800"></div>
          <span className="text-gray-500 text-sm font-medium">OR SUBSCRIBE NOW</span>
          <div className="flex-1 h-px bg-gray-800"></div>
        </div>

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

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
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
                }`}
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
                  <h3 className="text-2xl font-bold mb-2 text-white">{tier.name}</h3>
                  <p className="text-gray-400 text-sm mb-4">{tier.description}</p>

                  {/* Price */}
                  <div className="mb-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold text-white">
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
                  companyId={companyId}
                  className={`w-full py-3 px-6 rounded-lg font-semibold transition-all mb-6 ${
                    tier.popular
                      ? 'bg-orange-500 hover:bg-orange-600 text-white'
                      : 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700'
                  }`}
                />

                {/* Features */}
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-gray-300 mb-3">Features:</div>
                  {tier.features.slice(0, 5).map((feature, index) => (
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
                  {tier.features.length > 5 && (
                    <div className="text-gray-500 text-sm">
                      +{tier.features.length - 5} more features
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Skip for now link */}
        <div className="text-center mt-12">
          <button
            onClick={handleStartTrial}
            disabled={isStartingTrial}
            className="text-gray-500 hover:text-gray-400 text-sm underline transition-colors"
          >
            Skip for now and start free trial
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SubscribePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-orange border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SubscribePageInner />
    </Suspense>
  )
}
