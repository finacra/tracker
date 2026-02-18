'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useUserSubscription } from '@/hooks/useCompanyAccess'
import { createClient } from '@/utils/supabase/client'
import { PRICING_TIERS, getTierPricing, formatPrice, type BillingCycle } from '@/lib/pricing/tiers'
import PaymentButton from '@/components/PaymentButton'
import SubtleCircuitBackground from '@/components/SubtleCircuitBackground'

function SubscribePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const { hasSubscription, isTrial, trialDaysRemaining, companyLimit, currentCompanyCount, isLoading: subLoading } = useUserSubscription()
  const supabase = createClient()
  
  // Optional company_id for context (showing company name)
  const companyId = searchParams.get('company_id')
  const showUpgrade = searchParams.get('upgrade') === '1'
  
  const [companyName, setCompanyName] = useState<string>('')
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<BillingCycle>('annual')
  const [isStartingTrial, setIsStartingTrial] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userCompanies, setUserCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [selectedCompanyForSubscription, setSelectedCompanyForSubscription] = useState<string | null>(companyId)
  const [companyHasActiveSubscription, setCompanyHasActiveSubscription] = useState<boolean>(false)
  const [isCheckingCompanySubscription, setIsCheckingCompanySubscription] = useState(false)

  // Check if selected company has active subscription/trial
  useEffect(() => {
    async function checkCompanySubscription() {
      const targetCompanyId = selectedCompanyForSubscription || companyId
      if (!targetCompanyId || !user) {
        setCompanyHasActiveSubscription(false)
        return
      }

      setIsCheckingCompanySubscription(true)
      try {
        const { data, error: rpcError } = await supabase
          .rpc('check_company_subscription', { p_company_id: targetCompanyId })
          .single()

        if (!rpcError && data) {
          const subscriptionData = data as {
            has_subscription: boolean
            tier: string
            is_trial: boolean
            trial_days_remaining: number
            user_limit: number
          }
          setCompanyHasActiveSubscription(subscriptionData.has_subscription)
          
          // If company has active subscription and user is not explicitly upgrading, redirect to data-room
          if (subscriptionData.has_subscription && !showUpgrade) {
            router.replace(`/data-room?company_id=${targetCompanyId}`)
          }
        } else {
          setCompanyHasActiveSubscription(false)
        }
      } catch (err) {
        console.error('Error checking company subscription:', err)
        setCompanyHasActiveSubscription(false)
      } finally {
        setIsCheckingCompanySubscription(false)
      }
    }

    checkCompanySubscription()
  }, [selectedCompanyForSubscription, companyId, user, supabase, showUpgrade, router])

  // Fetch company name if provided, and fetch all user companies for selection
  useEffect(() => {
    async function fetchCompanies() {
      if (!user) return
      
      // Fetch company name if companyId provided
      if (companyId) {
        const { data } = await supabase
          .from('companies')
          .select('name')
          .eq('id', companyId)
          .single()
        
        if (data) {
          setCompanyName(data.name)
        }
      }
      
      // Fetch all companies user owns (for company selection in Starter/Professional)
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      
      if (companies) {
        setUserCompanies(companies)
        // If companyId not provided but user has companies, select first one
        if (!companyId && companies.length > 0) {
          setSelectedCompanyForSubscription(companies[0].id)
        }
      }
    }
    
    fetchCompanies()
  }, [companyId, user, supabase])

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  // If user already has subscription, redirect to data-room or onboarding
  useEffect(() => {
    if (subLoading) return
    if (!user) return

    // If user has active access (trial or paid), don't force them to stay on /subscribe
    // Unless they explicitly asked to upgrade via ?upgrade=1
    if (hasSubscription && (isTrial ? trialDaysRemaining > 0 : true) && !showUpgrade) {
      const target = companyId ? `/data-room?company_id=${companyId}` : '/data-room'
      router.replace(target)
    }
  }, [hasSubscription, isTrial, trialDaysRemaining, subLoading, companyId, router, user, showUpgrade])

  const handleStartTrial = async (tier: 'starter' | 'professional' | 'enterprise' = 'starter') => {
    if (!user) {
      setError('Please sign in first')
      return
    }

    setIsStartingTrial(true)
    setError(null)

    try {
      // Enterprise: user-first trial
      if (tier === 'enterprise') {
        const { data, error: rpcError } = await supabase
          .rpc('create_user_trial', { target_user_id: user.id })

        if (rpcError) {
          throw new Error(rpcError.message || 'Failed to create trial')
        }

        // Success - redirect
        if (companyId) {
          router.push(`/data-room?company_id=${companyId}`)
        } else if (currentCompanyCount > 0) {
          router.push('/data-room')
        } else {
          router.push('/onboarding')
        }
        return
      }

      // Starter/Professional: company-first trial
      // If user has no companies, create a user-level trial first (allows creating first company)
      if (currentCompanyCount === 0) {
        // Create user-level trial for Starter/Professional (similar to Enterprise)
        // This allows them to create their first company
        const { data, error: rpcError } = await supabase
          .rpc('create_user_trial', { target_user_id: user.id })

        if (rpcError) {
          throw new Error(rpcError.message || 'Failed to create trial')
        }

        // Success - redirect to onboarding to create first company
        router.push('/onboarding')
        return
      }
      
      // Require company selection if user has companies
      const targetCompanyId = selectedCompanyForSubscription || companyId
      if (!targetCompanyId && currentCompanyCount > 0) {
        setError('Please select a company for the trial')
        setIsStartingTrial(false)
        return
      }
      
      // If still no company selected but user has companies, select the first one
      if (!targetCompanyId && userCompanies.length > 0) {
        setSelectedCompanyForSubscription(userCompanies[0].id)
        // Retry with first company
        setTimeout(() => {
          handleStartTrial(tier)
        }, 100)
        return
      }

      const { data, error: rpcError } = await supabase
        .rpc('create_company_trial', {
          p_user_id: user.id,
          p_company_id: targetCompanyId
        })

      if (rpcError) {
        throw new Error(rpcError.message || 'Failed to create trial')
      }

      // Success - redirect to the company
      router.push(`/data-room?company_id=${targetCompanyId}`)
    } catch (err: any) {
      console.error('Trial creation error:', err)
      setError(err.message || 'Failed to start trial')
    } finally {
      setIsStartingTrial(false)
    }
  }

  const billingCycles: { value: BillingCycle; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'half-yearly', label: 'Bi-Yearly' },
    { value: 'annual', label: 'Annual' },
  ]

  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Show trial upgrade prompt ONLY if user explicitly wants to upgrade during trial
  if (isTrial && trialDaysRemaining > 0 && showUpgrade) {
    return (
      <div className="min-h-screen bg-primary-dark relative overflow-hidden">
        <SubtleCircuitBackground />
        
        <div className="relative z-10 container mx-auto px-4 py-12">
          {/* Trial Banner */}
          <div className="max-w-2xl mx-auto mb-8">
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xl font-light text-white">Trial Active</span>
              </div>
              <p className="text-gray-300 mb-2 font-light">
                You have <span className="text-gray-300 font-light">{trialDaysRemaining} days</span> remaining in your trial.
              </p>
              <p className="text-gray-400 text-sm font-light">
                Your trial is active. You can upgrade anytime to continue uninterrupted after it ends.
              </p>
            </div>
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-light mb-4 text-white">
              Upgrade Your Plan
            </h1>
            <p className="text-gray-400 font-light">
              Choose a plan to unlock unlimited access
            </p>
          </div>

          {/* Rest of pricing content */}
          {renderPricingContent()}
        </div>
      </div>
    )
  }

  function renderPricingContent() {
    return (
      <>
        {/* Error Message */}
        {error && (
          <div className="max-w-md mx-auto mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-center">
            {error}
          </div>
        )}

        {/* Billing Cycle Selector */}
        <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
          {billingCycles.map((cycle) => (
            <button
              key={cycle.value}
              onClick={() => setSelectedBillingCycle(cycle.value)}
              className={`px-4 py-2 rounded-lg font-light transition-all ${
                selectedBillingCycle === cycle.value
                  ? 'bg-gray-700 text-white'
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
                className={`relative rounded-xl border p-8 transition-all bg-[#1a1a1a] ${
                  tier.popular
                    ? 'border-gray-600 md:scale-105'
                    : 'border-gray-800 hover:border-gray-700'
                }`}
              >
                {/* Popular Badge */}
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-gray-700 text-white px-4 py-1 rounded-full text-sm font-light">
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Tier Header */}
                <div className="mb-6">
                  <h3 className="text-2xl font-light mb-2 text-white">{tier.name}</h3>
                  <p className="text-gray-400 text-sm mb-4 font-light">{tier.description}</p>

                  {/* Price */}
                  <div className="mb-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-light text-white">
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
                        <span className="text-gray-400 text-sm font-light">
                          {selectedPricing.discount}% discount
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Company/User Limits */}
                  <div className="text-xs text-gray-500 space-y-1 mb-4 border-t border-gray-800 pt-3">
                    <div>📁 {tier.limits.companies === 'unlimited' ? 'Unlimited' : `Up to ${tier.limits.companies}`} companies</div>
                    <div>👥 {tier.limits.users === 'unlimited' ? 'Unlimited' : `Up to ${tier.limits.users}`} team members</div>
                  </div>
                </div>

                {/* CTA Button */}
                <PaymentButton
                  tier={tier.id}
                  billingCycle={selectedBillingCycle}
                  price={selectedPricing.price}
                  companyId={
                    tier.id === 'enterprise' 
                      ? undefined // Enterprise: user-first, no company_id
                      : (selectedCompanyForSubscription || companyId || undefined) // Starter/Pro: company-first
                  }
                  className={`w-full py-3 px-6 rounded-lg font-light transition-all mb-6 ${
                    tier.popular
                      ? 'bg-gray-700 hover:bg-gray-600 text-white'
                      : 'bg-transparent border border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white'
                  }`}
                />

                {/* Features */}
                <div className="space-y-3">
                  <div className="text-sm font-light text-gray-400 mb-3">Features:</div>
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
                      <span className="text-gray-300 text-sm font-light">{feature}</span>
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
      </>
    )
  }

  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      <SubtleCircuitBackground />
      
      <div className="relative z-10 container mx-auto px-4 py-12">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-light mb-4 text-white">
              Choose Your Plan
            </h1>
          {companyName && (
            <p className="text-gray-400 text-lg mb-2">
              Subscribe to manage <span className="text-white font-medium">{companyName}</span>
            </p>
          )}
          <p className="text-gray-500 text-sm">
            Starter & Professional: Each company needs its own subscription. Enterprise: One subscription covers all companies (up to 100).
          </p>
        </div>

        {/* Company Selector for Starter/Professional */}
        {userCompanies.length > 0 && (
          <div className="max-w-2xl mx-auto mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Select Company (for Starter/Professional plans):
            </label>
            <select
              value={selectedCompanyForSubscription || ''}
              onChange={(e) => setSelectedCompanyForSubscription(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white font-light focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors"
            >
              {userCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            {selectedCompanyForSubscription && (
              <p className="text-gray-500 text-xs mt-2">
                Starter/Professional subscriptions are for this company only. Enterprise covers all companies.
              </p>
            )}
          </div>
        )}

        {/* Pay Later / Trial Option - Show if no company subscription or user has no companies */}
        {(!companyHasActiveSubscription && (selectedCompanyForSubscription || companyId || currentCompanyCount === 0)) && (
          <div className="max-w-2xl mx-auto mb-12">
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xl font-light text-white">Not ready to commit?</span>
              </div>
              <p className="text-gray-400 mb-4 font-light">
                Start with a <span className="text-gray-300 font-light">15-day free trial</span> — no credit card required.
                {currentCompanyCount === 0 ? (
                  <> You'll be able to create your first company after starting the trial.</>
                ) : selectedCompanyForSubscription ? (
                  <> This trial is for <span className="text-white font-medium">{userCompanies.find(c => c.id === selectedCompanyForSubscription)?.name || 'selected company'}</span> only.</>
                ) : (
                  <> Enterprise trial covers all your companies.</>
                )}
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => handleStartTrial('starter')}
                  disabled={isStartingTrial || isCheckingCompanySubscription}
                  className="bg-gray-700 text-white px-6 py-2 rounded-lg font-light hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {isStartingTrial ? 'Starting...' : currentCompanyCount === 0 ? 'Start Trial' : 'Trial for Starter'}
                </button>
                <button
                  onClick={() => handleStartTrial('enterprise')}
                  disabled={isStartingTrial || isCheckingCompanySubscription}
                  className="bg-transparent border border-gray-700 text-gray-300 px-6 py-2 rounded-lg font-light hover:border-gray-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {isStartingTrial ? 'Starting...' : 'Trial for Enterprise'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Show message if company has active subscription */}
        {companyHasActiveSubscription && (selectedCompanyForSubscription || companyId) && (
          <div className="max-w-2xl mx-auto mb-12">
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
              <p className="text-red-400 font-medium">
                Company already has an active subscription or trial
              </p>
              <p className="text-gray-400 text-sm mt-2">
                {selectedCompanyForSubscription && (
                  <>The selected company already has an active subscription or trial. You can upgrade your plan or wait for the current subscription to expire.</>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-4 max-w-4xl mx-auto mb-12">
          <div className="flex-1 h-px bg-gray-800"></div>
          <span className="text-gray-500 text-sm font-medium">OR SUBSCRIBE NOW</span>
          <div className="flex-1 h-px bg-gray-800"></div>
        </div>

        {renderPricingContent()}

        {/* Skip for now link */}
        <div className="text-center mt-12">
          <button
            onClick={() => handleStartTrial('starter')}
            disabled={isStartingTrial}
            className="text-gray-500 hover:text-gray-400 text-sm underline transition-colors disabled:opacity-50"
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
