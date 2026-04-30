'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useUserSubscription } from '@/hooks/useCompanyAccess'
import { queryKeys } from '@/lib/react-query/query-keys'
import {
  createTrialSubscription,
  getSubscribeInitState,
  getSubscribeCompanyState,
} from '@/app/subscribe/actions'
import { PRICING_TIERS, getTierPricing, formatPrice, type BillingCycle } from '@/lib/pricing/tiers'
import PaymentButton from '@/components/features/PaymentButton'
import SubtleCircuitBackground from '@/components/ui/SubtleCircuitBackground'
import Link from 'next/link'
import { loadRazorpayScript, createTrialVerificationOrder, verifyPayment, openRazorpayCheckout, type RazorpayResponse } from '@/lib/razorpay/payment'
import { trackSubscriptionEvent, trackConversion } from '@/lib/analytics'

function SubscribePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { user, loading: authLoading, signOut, displayName, displayEmail } = useAuth()
  const { hasSubscription, isTrial, trialDaysRemaining, currentCompanyCount, isLoading: subLoading } = useUserSubscription()
  // accessibleCompanyIds now comes from the batched init call below — no
  // separate useAnyCompanyAccess hook firing its own server roundtrip.
  const [accessibleCompanyIds, setAccessibleCompanyIds] = useState<string[]>([])
  const [anyAccessLoading, setAnyAccessLoading] = useState(true)
  
  const handleSignOut = async () => {
    await signOut()
    router.push('/home')
  }
  
  // Optional company_id for context (showing company name)
  const companyId = searchParams.get('company_id')
  const showUpgrade = searchParams.get('upgrade') === '1'
  
  const [companyName, setCompanyName] = useState<string>('')
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<BillingCycle>('annual')
  const [isStartingTrial, setIsStartingTrial] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userCompanies, setUserCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [accessibleCompanies, setAccessibleCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [selectedCompanyForSubscription, setSelectedCompanyForSubscription] = useState<string | null>(companyId)
  const [companyHasActiveSubscription, setCompanyHasActiveSubscription] = useState<boolean>(false)
  // Default to "checking" so we don't flash an incorrect trial / subscription
  // banner on first paint. Without these starting true, the page would render
  // with default values (companyTrialEligible=true, no subscription) and show
  // the "Not ready to commit? Start your trial" banner — then 3-5s later when
  // init returns and reveals the real state, that banner would be replaced
  // with "Free trial is not available" or "Company already has an active
  // subscription". The init useEffect flips both to true again on entry; this
  // just covers the initial render before the effect runs.
  const [isCheckingCompanySubscription, setIsCheckingCompanySubscription] = useState(true)
  const [isRazorpayScriptLoaded, setIsRazorpayScriptLoaded] = useState(false)
  const [companyTrialEligible, setCompanyTrialEligible] = useState<boolean>(true)
  const [isCheckingTrialEligibility, setIsCheckingTrialEligibility] = useState(true)
  const [trialEligibilityReason, setTrialEligibilityReason] = useState<string | null>(null)

  // First-paint init: ONE batched server call replaces three sequential
  // useEffects. Re-runs only when companyId (URL param) or user changes.
  // Dropdown changes go through the lighter getSubscribeCompanyState
  // refresh below.
  const initRanForRef = useRef<string | null>(null)
  const lastRefreshedCompanyRef = useRef<string | null>(null)
  useEffect(() => {
    if (authLoading || !user) return
    const initKey = `${user.id}:${companyId ?? ''}`
    if (initRanForRef.current === initKey) return
    initRanForRef.current = initKey

    let cancelled = false
    async function loadInit() {
      setAnyAccessLoading(true)
      setIsCheckingCompanySubscription(true)
      setIsCheckingTrialEligibility(true)
      try {
        const result = await getSubscribeInitState(companyId)
        if (cancelled) return
        if (!result.success || !result.data) {
          console.error('[subscribe] init failed:', result.error)
          return
        }
        const d = result.data

        setCompanyName(d.companyName || '')
        setUserCompanies(d.userCompanies)
        setAccessibleCompanies(d.accessibleCompanies)
        setAccessibleCompanyIds(d.accessibleCompanyIds)

        // Pre-populate React Query caches so useUserSubscription (and
        // any other hook reading these keys) serves from cache instead
        // of firing its own server roundtrip.
        queryClient.setQueryData(queryKeys.userSubscription(), d.userSubscription)
        queryClient.setQueryData(queryKeys.accessibleCompanies(), d.accessibleCompanyIds)

        // Auto-select the first owned company if no URL company_id was
        // provided. The server already pre-warmed subscription +
        // eligibility for this company in the same payload, so we
        // mark lastRefreshedCompanyRef to suppress the dropdown-refresh
        // effect from re-fetching the same data.
        if (!companyId && d.userCompanies.length > 0 && d.resolvedCompanyId) {
          setSelectedCompanyForSubscription((current) => current || d.resolvedCompanyId)
          lastRefreshedCompanyRef.current = d.resolvedCompanyId
        } else if (companyId) {
          lastRefreshedCompanyRef.current = companyId
        }

        const hasSub = d.subscription?.hasSubscription ?? false
        setCompanyHasActiveSubscription(hasSub)
        if (hasSub && !showUpgrade && d.resolvedCompanyId) {
          router.replace(`/data-room?company_id=${d.resolvedCompanyId}`)
        }

        setCompanyTrialEligible(d.eligibility.eligible)
        setTrialEligibilityReason(d.eligibility.reason)
      } catch (err) {
        console.error('[subscribe] init threw:', err)
      } finally {
        if (cancelled) return
        setAnyAccessLoading(false)
        setIsCheckingCompanySubscription(false)
        setIsCheckingTrialEligibility(false)
      }
    }
    loadInit()
    return () => {
      cancelled = true
    }
  }, [companyId, user, authLoading, showUpgrade, router, queryClient])

  // Lightweight refresh when the dropdown changes — re-derives just
  // subscription + eligibility for the newly-selected company. Skipped
  // on the first render (init pre-warmed lastRefreshedCompanyRef for
  // the resolved/auto-selected company).
  useEffect(() => {
    if (!user || authLoading) return
    if (anyAccessLoading) return
    const target = selectedCompanyForSubscription || companyId
    if (!target) return
    if (lastRefreshedCompanyRef.current === target) return
    lastRefreshedCompanyRef.current = target

    // Skip: the init call already covered the URL-provided companyId.
    if (target === companyId && !lastRefreshedCompanyRef.current) return

    let cancelled = false
    async function refresh() {
      setIsCheckingCompanySubscription(true)
      setIsCheckingTrialEligibility(true)
      try {
        const result = await getSubscribeCompanyState(target)
        if (cancelled || !result.success || !result.data) return
        const hasSub = result.data.subscription?.hasSubscription ?? false
        setCompanyHasActiveSubscription(hasSub)
        if (hasSub && !showUpgrade) {
          router.replace(`/data-room?company_id=${target}`)
        }
        setCompanyTrialEligible(result.data.eligibility.eligible)
        setTrialEligibilityReason(result.data.eligibility.reason)
      } finally {
        if (cancelled) return
        setIsCheckingCompanySubscription(false)
        setIsCheckingTrialEligibility(false)
      }
    }
    refresh()
    return () => {
      cancelled = true
    }
  }, [selectedCompanyForSubscription, companyId, user, authLoading, anyAccessLoading, showUpgrade, router])

  // Redirect if not authenticated (only once, prevent loops)
  // CRITICAL: Only redirect if auth is fully loaded AND user is null
  // This prevents redirect loops when coming from login (auth might still be loading)
  const hasRedirectedRef = useRef(false)
  
  useEffect(() => {
    if (hasRedirectedRef.current) return
    
    // CRITICAL: Don't redirect while auth is loading
    // This prevents false negatives when auth is still initializing after login
    if (authLoading) return
    
    // Only redirect if auth is fully loaded AND user is definitely null
    if (!user) {
      hasRedirectedRef.current = true
      router.push('/login')
    }
  }, [user, authLoading, router])

  // Auto-redirect when the user already has a subscription and there's
  // nothing for them to do on this page. We push them to /onboarding
  // rather than /data-room — same reasoning as the trial-creation
  // redirect: /data-room does a hard access check against a specific
  // company and will bounce to /owner-subscription-expired whenever
  // the target company's access snapshot is stale or the user is a
  // team member on the first-ranked company. /onboarding is safe in
  // every case — it shows the create form or the "Go to Data Room"
  // CTA based on fresh subscription state and doesn't fail on
  // per-company access edges.
  const hasRedirectedAwayRef = useRef(false)
  useEffect(() => {
    if (hasRedirectedAwayRef.current) return
    if (subLoading) return
    if (!user) return

    if (hasSubscription && (isTrial ? trialDaysRemaining > 0 : true) && !showUpgrade) {
      hasRedirectedAwayRef.current = true
      router.replace('/onboarding')
    }
  }, [hasSubscription, isTrial, trialDaysRemaining, subLoading, router, user, showUpgrade])

  // Load Razorpay script on mount
  useEffect(() => {
    loadRazorpayScript()
      .then(() => setIsRazorpayScriptLoaded(true))
      .catch((error) => {
        console.error('Failed to load Razorpay script:', error)
        setError('Payment system failed to load. Please refresh the page.')
      })
  }, [])

  const handleStartTrial = async () => {
    if (!user) {
      setError('Please sign in first')
      return
    }

    if (!isRazorpayScriptLoaded) {
      setError('Payment system is loading. Please wait a moment and try again.')
      return
    }

    // Check trial eligibility
    const targetCompanyId = selectedCompanyForSubscription || companyId || null
    if (!companyTrialEligible) {
      setError(
        trialEligibilityReason === 'enterprise_trial_used'
          ? 'Your account has already used its Enterprise trial. Please subscribe to continue.'
          : 'This company has already used its trial. Please subscribe to continue.'
      )
      return
    }

    setIsStartingTrial(true)
    setError(null)

    try {
      // Step 1: Create trial verification payment (₹2)
      // Use 'starter' as default tier for trial verification (tier doesn't matter for trial)
      const orderData = await createTrialVerificationOrder(targetCompanyId || undefined, 'starter')

      // Step 2: Open Razorpay checkout for verification
      openRazorpayCheckout({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Finacra AI',
        description: 'Trial Verification - ₹2 (will be refunded within 24 hours)',
        order_id: orderData.orderId,
        prefill: {
          email: displayEmail || undefined,
          name: displayName || undefined,
        },
        theme: {
          color: '#9CA3AF', // Gray color (matching the design)
        },
        handler: async (response: RazorpayResponse) => {
          try {
            // Step 3: Verify payment
            const verification = await verifyPayment(
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature
            )

            if (verification.success) {
              // Step 4: Payment verified, now create the trial
              await createTrialAfterVerification(targetCompanyId)
            } else {
              setError('Payment verification failed. Please try again.')
              setIsStartingTrial(false)
            }
          } catch (error) {
            console.error('Payment verification error:', error)
            setError(`Payment verification failed: ${error instanceof Error ? error.message : 'Something went wrong'}`)
            setIsStartingTrial(false)
          }
        },
        modal: {
          ondismiss: () => {
            setIsStartingTrial(false)
          },
        },
      })
    } catch (err) {
      console.error('Trial verification error:', err)
      setError(err instanceof Error ? err.message : 'Failed to start trial verification')
      setIsStartingTrial(false)
    }
  }

  const createTrialAfterVerification = async (targetCompanyId: string | null) => {
    try {
      const result = await createTrialSubscription(targetCompanyId)
      if (!result.success) {
        throw new Error(result.error || 'Failed to create trial')
      }

      trackSubscriptionEvent('trial_start', 'starter', undefined, undefined)
      trackConversion('trial_start')

      // ROOT CAUSE FIX: the data-room access check reads from three
      // react-query caches (userSubscription, companyAccess,
      // accessibleCompanies), all with a 5-minute staleTime. We were
      // only invalidating userSubscription here — so the moment the
      // user was router.push'd to /data-room?company_id=X, the
      // companyAccess query served a pre-trial snapshot showing
      // {ownerSubscriptionExpired: true} and redirected to the
      // owner-subscription-expired page. Now we invalidate every
      // cache the next page will read AND await the companyAccess
      // refetch so the next page mount already has fresh data.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.userSubscription() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accessibleCompanies() }),
        // Invalidate every company-access entry. Cheaper to nuke the
        // whole prefix than track which companyId maps to this trial.
        queryClient.invalidateQueries({ queryKey: ['company-access'] }),
      ])

      // Pull the target company id out of the redirect URL (if any)
      // and pre-warm its access snapshot before routing, so the next
      // page doesn't even briefly see an empty cache.
      const urlMatch = result.redirectTo?.match(/company_id=([^&]+)/)
      const targetId = urlMatch?.[1] || null
      if (targetId) {
        await queryClient.refetchQueries({ queryKey: queryKeys.companyAccess(targetId) })
      }

      if (result.redirectTo) {
        router.push(result.redirectTo)
      }
    } catch (err) {
      console.error('Trial creation error:', err)
      setError(err instanceof Error ? err.message : 'Failed to create trial')
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

  const backToDataRoomHref = accessibleCompanies.length > 0
    ? `/data-room?company_id=${accessibleCompanies[0].id}`
    : currentCompanyCount > 0
      ? '/data-room'
      : '/onboarding'

  // Show trial upgrade prompt ONLY if user explicitly wants to upgrade during trial
  if (isTrial && trialDaysRemaining > 0 && showUpgrade) {
    return (
      <div className="min-h-screen bg-primary-dark relative overflow-hidden">
        <SubtleCircuitBackground />
        
        {/* Back Button and Logout */}
        <div className="relative z-10 px-4 sm:px-6 pt-4 flex items-center justify-between">
          <Link
            href={backToDataRoomHref}
            className="inline-flex items-center gap-2 text-fg-muted hover:text-white transition-colors font-light text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Data Room
          </Link>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 text-fg-muted hover:text-white transition-colors font-light text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
        
        <div className="relative z-10 container mx-auto px-4 py-12">
          {/* Trial Banner */}
          <div className="max-w-2xl mx-auto mb-8">
            <div className="bg-bg-elevated/50 border border-line/15 rounded-xl p-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-3">
                <svg className="w-6 h-6 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xl font-light text-white">Trial Active</span>
              </div>
              <p className="text-fg-secondary mb-2 font-light">
                You have <span className="text-fg-secondary font-light">{trialDaysRemaining} days</span> remaining in your trial.
              </p>
              <p className="text-fg-muted text-sm font-light">
                Your trial is active. You can upgrade anytime to continue uninterrupted after it ends.
              </p>
            </div>
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-light mb-4 text-white">
              Upgrade Your Plan
            </h1>
            <p className="text-fg-muted font-light">
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
              className={`px-4 py-2 rounded-lg font-light transition-all whitespace-nowrap ${
                selectedBillingCycle === cycle.value
                  ? 'bg-bg-hover text-white'
                  : 'bg-bg-elevated text-fg-secondary hover:bg-bg-hover'
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
                className={`relative rounded-xl border p-8 transition-all bg-bg-card ${
                  tier.popular
                    ? 'border-line/30 md:scale-105'
                    : 'border-line/10 hover:border-line/15'
                }`}
              >
                {/* Popular Badge */}
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-bg-hover text-white px-4 py-1 rounded-full text-sm font-light">
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Tier Header */}
                <div className="mb-6">
                  <h3 className="text-2xl font-light mb-2 text-white">{tier.name}</h3>
                  <p className="text-fg-muted text-sm mb-4 font-light">{tier.description}</p>

                  {/* Price - Hidden for Enterprise */}
                  {tier.id !== 'enterprise' && (
                  <div className="mb-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-light text-white">
                        {formatPrice(selectedPricing.price)}
                      </span>
                      {selectedBillingCycle !== 'monthly' && (
                        <span className="text-fg-muted text-sm">
                          /{selectedBillingCycle === 'quarterly' ? 'quarter' : selectedBillingCycle === 'half-yearly' ? '6 months' : 'year'}
                        </span>
                      )}
                    </div>
                    {selectedBillingCycle !== 'monthly' && (
                      <div className="mt-2">
                        <span className="text-fg-muted text-sm">
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
                        <span className="text-fg-muted text-sm font-light">
                          {selectedPricing.discount}% discount
                        </span>
                      </div>
                    )}
                  </div>
                  )}
                  
                  {/* Enterprise Custom Message */}
                  {tier.id === 'enterprise' && (
                    <div className="mb-4">
                      <p className="text-fg-secondary text-lg font-light">
                        Contact us for custom pricing
                      </p>
                    </div>
                  )}

                  {/* Company/User Limits */}
                  <div className="text-xs text-fg-muted space-y-1 mb-4 border-t border-line/10 pt-3">
                    <div>📁 {tier.limits.companies === 'unlimited' ? 'Unlimited' : `Up to ${tier.limits.companies}`} companies</div>
                    <div>👥 {tier.limits.users === 'unlimited' ? 'Unlimited' : `Up to ${tier.limits.users}`} team members</div>
                  </div>
                </div>

                {/* CTA Button */}
                {tier.id === 'enterprise' ? (
                  <Link
                    href="/contact"
                    className={`w-full py-3 px-6 rounded-lg font-light transition-all mb-6 text-center block ${
                      tier.popular
                        ? 'bg-bg-hover hover:bg-gray-600 text-white'
                        : 'bg-transparent border border-line/15 text-fg-secondary hover:border-line/30 hover:text-white'
                    }`}
                  >
                    Contact Us
                  </Link>
                ) : (
                <PaymentButton
                  tier={tier.id}
                  billingCycle={selectedBillingCycle}
                  price={selectedPricing.price}
                  companyId={
                      selectedCompanyForSubscription || companyId || undefined
                  }
                  className={`w-full py-3 px-6 rounded-lg font-light transition-all mb-6 ${
                    tier.popular
                      ? 'bg-bg-hover hover:bg-gray-600 text-white'
                      : 'bg-transparent border border-line/15 text-fg-secondary hover:border-line/30 hover:text-white'
                  }`}
                />
                )}

                {/* Features */}
                <div className="space-y-3">
                  <div className="text-sm font-light text-fg-muted mb-3">Features:</div>
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
                      <span className="text-fg-secondary text-sm font-light">{feature}</span>
                    </div>
                  ))}
                  {tier.features.length > 5 && (
                    <div className="text-fg-muted text-sm">
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
      
      {/* Back Button and Logout */}
      <div className="relative z-10 px-4 sm:px-6 pt-4 flex items-center justify-between">
        <Link
          href={backToDataRoomHref}
          className="inline-flex items-center gap-2 text-fg-muted hover:text-white transition-colors font-light text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {accessibleCompanies.length > 0 || currentCompanyCount > 0 ? "Back to Data Room" : "Back to Onboarding"}
        </Link>
        <button
          onClick={handleSignOut}
          className="inline-flex items-center gap-2 text-fg-muted hover:text-white transition-colors font-light text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Logout
        </button>
      </div>
      
      <div className="relative z-10 container mx-auto px-4 py-12">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-light mb-4 text-white">
              Choose Your Plan
            </h1>
          {companyName && (
            <p className="text-fg-muted text-lg mb-2">
              Subscribe to manage <span className="text-white font-medium">{companyName}</span>
            </p>
          )}
          <p className="text-fg-muted text-sm">
            Starter & Professional: Each company needs its own subscription. Enterprise: One subscription covers all companies (up to 100).
          </p>
        </div>

        {/* Hold init-dependent content (company dropdown, trial banners,
            pricing tiers) on a single loader until getSubscribeInitState
            returns. Without this, the page rendered the header + tiers
            immediately and then 3–5s later the dropdown + warning banner
            would pop in below — which the user perceived as "a card just
            appeared". Now everything appears together in one paint. */}
        {anyAccessLoading ? (
          <div className="max-w-2xl mx-auto mb-12">
            <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.03] via-transparent to-blue-500/[0.04] px-5 py-6 sm:px-7 sm:py-7 flex items-center gap-4">
              <div className="relative flex h-3 w-3 flex-shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-400/80 font-medium mb-1">
                  System • Resolving Access
                </div>
                <div className="text-sm sm:text-base font-light text-white/90">
                  Checking your subscriptions, trial eligibility, and accessible companies…
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {!anyAccessLoading && accessibleCompanies.length > 0 && (
          <div className="max-w-2xl mx-auto mb-8">
            <div className="bg-bg-card border border-line/10 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-lg font-light text-white">Companies You Can Still Access</h2>
              </div>
              <p className="text-fg-muted text-sm font-light mb-4">
                Your current company may need a subscription, but these companies still have valid access.
              </p>
              <div className="space-y-2">
                {accessibleCompanies.map((company) => (
                  <button
                    key={company.id}
                    onClick={() => router.push(`/data-room?company_id=${company.id}`)}
                    className="w-full text-left px-4 py-3 bg-bg-card rounded-lg text-fg-secondary hover:bg-bg-elevated transition-colors text-sm font-light flex items-center justify-between group"
                  >
                    <span className="truncate flex-1">{company.name}</span>
                    <svg className="w-4 h-4 text-fg-muted group-hover:text-white transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Company Selector for Starter/Professional */}
        {!anyAccessLoading && userCompanies.length > 0 && (
          <div className="max-w-2xl mx-auto mb-6">
            <label className="block text-sm font-medium text-fg-secondary mb-2">
              Select Company (for Starter/Professional plans):
            </label>
            <select
              value={selectedCompanyForSubscription || ''}
              onChange={(e) => setSelectedCompanyForSubscription(e.target.value)}
              className="w-full px-4 py-2 bg-bg-card border border-line/15 rounded-lg text-white font-light focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors"
            >
              {userCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            {selectedCompanyForSubscription && (
              <p className="text-fg-muted text-xs mt-2">
                Starter/Professional subscriptions are for this company only. Enterprise covers all companies.
              </p>
            )}
          </div>
        )}

        {/* Pay Later / Trial Option - Show if no company subscription, company is eligible, and user has no companies or company selected */}
        {!anyAccessLoading && (!companyHasActiveSubscription && companyTrialEligible && !isCheckingTrialEligibility && (selectedCompanyForSubscription || companyId || currentCompanyCount === 0)) && (
          <div className="max-w-2xl mx-auto mb-12">
            <div className="bg-bg-elevated/50 border border-line/15 rounded-xl p-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-3">
                <svg className="w-6 h-6 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xl font-light text-white">Not ready to commit?</span>
              </div>
              <p className="text-fg-muted mb-2 font-light">
                Start with a <span className="text-fg-secondary font-light">15-day free trial</span> — verify with ₹2 payment (refunded within 24 hours).
                {currentCompanyCount === 0 ? (
                  <> You'll be able to create your first company after starting the trial.</>
                ) : selectedCompanyForSubscription ? (
                  <> This trial is for <span className="text-white font-medium">{userCompanies.find(c => c.id === selectedCompanyForSubscription)?.name || 'selected company'}</span> only.</>
                ) : (
                  <> After the trial, you can choose any plan (Starter, Professional, or Enterprise) when subscribing.</>
                )}
              </p>
              <p className="text-fg-muted text-xs mb-4 font-light">
                A ₹2 verification charge will be made to verify your payment method. This amount will be automatically refunded within 24 hours.
              </p>
              <div className="flex items-center justify-center">
                <button
                  onClick={handleStartTrial}
                  disabled={isStartingTrial || isCheckingCompanySubscription || isCheckingTrialEligibility}
                  className="bg-bg-hover text-white px-8 py-3 rounded-lg font-light hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {isStartingTrial ? 'Starting...' : 'Start 15-Day Trial'}
                </button>
              </div>
            </div>
          </div>
        )}

        {!anyAccessLoading && (!companyHasActiveSubscription && !companyTrialEligible && !isCheckingTrialEligibility && (selectedCompanyForSubscription || companyId || currentCompanyCount === 0)) && (
          <div className="max-w-2xl mx-auto mb-12">
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
              <p className="text-red-400 font-medium">
                Free trial is not available
              </p>
              <p className="text-fg-muted text-sm mt-2">
                {trialEligibilityReason === 'enterprise_trial_used'
                  ? 'This account has already used its Enterprise trial, so a company-level Starter or Professional trial is no longer available.'
                  : 'This company has already used its free trial. Please subscribe to continue.'}
              </p>
            </div>
          </div>
        )}

        {/* Show message if company has active subscription. Gate on the
            init having settled so we don't flash this banner before the
            real state is known. */}
        {!anyAccessLoading && companyHasActiveSubscription && !isCheckingCompanySubscription && (selectedCompanyForSubscription || companyId) && (
          <div className="max-w-2xl mx-auto mb-12">
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
              <p className="text-red-400 font-medium">
                Company already has an active subscription or trial
              </p>
              <p className="text-fg-muted text-sm mt-2">
                {selectedCompanyForSubscription && (
                  <>The selected company already has an active subscription or trial. You can upgrade your plan or wait for the current subscription to expire.</>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Pricing tiers + divider + skip-link only render once init has
            settled. Otherwise the user sees tiers + a 5s-late banner
            popping in above them. */}
        {!anyAccessLoading && (
          <>
            <div className="flex items-center gap-4 max-w-4xl mx-auto mb-12">
              <div className="flex-1 h-px bg-bg-elevated"></div>
              <span className="text-fg-muted text-sm font-medium">OR SUBSCRIBE NOW</span>
              <div className="flex-1 h-px bg-bg-elevated"></div>
            </div>

            {renderPricingContent()}

            {companyTrialEligible && !isCheckingTrialEligibility && (
              <div className="text-center mt-12">
                <button
                  onClick={handleStartTrial}
                  disabled={isStartingTrial}
                  className="text-fg-muted hover:text-fg-muted text-sm underline transition-colors disabled:opacity-50"
                >
                  Skip for now and start free trial (₹2 verification required)
                </button>
              </div>
            )}
          </>
        )}
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
