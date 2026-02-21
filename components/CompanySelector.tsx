'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

interface Company {
  id: string
  name: string
  type: string
  year: string
  country_code?: string
  region?: string
}

interface CompanySubscriptionStatus {
  companyId: string
  hasSubscription: boolean
  isTrial: boolean
  trialDaysRemaining?: number
  tier?: string
}

interface CompanySelectorProps {
  companies: Company[]
  currentCompany: Company | null
  onCompanyChange: (company: Company) => void
}

export default function CompanySelector({ companies, currentCompany, onCompanyChange }: CompanySelectorProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [subscriptionStatuses, setSubscriptionStatuses] = useState<Map<string, CompanySubscriptionStatus>>(new Map())
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(false)
  const supabase = createClient()

  // Fetch subscription status for all companies
  useEffect(() => {
    async function fetchSubscriptionStatuses() {
      if (companies.length === 0) return

      setIsLoadingStatuses(true)
      const statusMap = new Map<string, CompanySubscriptionStatus>()

      try {
        // Get current user for user-level subscription check
        const { data: { user } } = await supabase.auth.getUser()
        
        // Fetch status for all companies in parallel
        const statusPromises = companies.map(async (company) => {
          try {
            // First check company-level subscription (Starter/Professional)
            const { data: companyData, error: companyError } = await supabase
              .rpc('check_company_subscription', { p_company_id: company.id })
              .single()

            // #region agent log
            console.log(`[CompanySelector] Company subscription RPC result for ${company.id}:`, { data: companyData, error: companyError, companyName: company.name });
            // #endregion

            if (!companyError && companyData && (companyData as any).has_subscription) {
              const subscriptionData = companyData as {
                has_subscription: boolean
                tier: string
                is_trial: boolean
                trial_days_remaining: number
                user_limit: number
              }
              
              // #region agent log
              console.log(`[CompanySelector] Company-level subscription found for ${company.id}:`, {
                has_subscription: subscriptionData.has_subscription,
                is_trial: subscriptionData.is_trial,
                trial_days_remaining: subscriptionData.trial_days_remaining,
                tier: subscriptionData.tier
              });
              // #endregion
              
              statusMap.set(company.id, {
                companyId: company.id,
                hasSubscription: subscriptionData.has_subscription,
                isTrial: subscriptionData.is_trial,
                trialDaysRemaining: subscriptionData.trial_days_remaining,
                tier: subscriptionData.tier,
              })
              return // Company has subscription, no need to check user-level
            }

            // If no company-level subscription, check user-level (Enterprise)
            if (user) {
              try {
                const { data: userData, error: userError } = await supabase
                  .rpc('check_user_subscription', { target_user_id: user.id })
                  .single()

                // #region agent log
                console.log(`[CompanySelector] User subscription RPC result for ${company.id}:`, { data: userData, error: userError });
                // #endregion

                if (!userError && userData && (userData as any).has_subscription) {
                  const userSubData = userData as {
                    has_subscription: boolean
                    tier: string
                    is_trial: boolean
                    trial_days_remaining: number
                    company_limit: number
                    user_limit: number
                  }
                  
                  // #region agent log
                  console.log(`[CompanySelector] User-level subscription found for ${company.id}:`, {
                    has_subscription: userSubData.has_subscription,
                    is_trial: userSubData.is_trial,
                    trial_days_remaining: userSubData.trial_days_remaining,
                    tier: userSubData.tier
                  });
                  // #endregion
                  
                  // Enterprise tier covers all companies
                  statusMap.set(company.id, {
                    companyId: company.id,
                    hasSubscription: userSubData.has_subscription,
                    isTrial: userSubData.is_trial,
                    trialDaysRemaining: userSubData.trial_days_remaining,
                    tier: userSubData.tier,
                  })
                  return
                }
              } catch (userErr) {
                console.log(`[CompanySelector] User subscription check failed for ${company.id}:`, userErr)
              }
            }

            // #region agent log
            console.log(`[CompanySelector] No subscription found for ${company.id}`);
            // #endregion
            // No subscription found at either level
            statusMap.set(company.id, {
              companyId: company.id,
              hasSubscription: false,
              isTrial: false,
            })
          } catch (err) {
            console.error(`Error checking subscription for company ${company.id}:`, err)
            statusMap.set(company.id, {
              companyId: company.id,
              hasSubscription: false,
              isTrial: false,
            })
          }
        })

        await Promise.all(statusPromises)
        setSubscriptionStatuses(statusMap)
      } catch (err) {
        console.error('Error fetching subscription statuses:', err)
      } finally {
        setIsLoadingStatuses(false)
      }
    }

    fetchSubscriptionStatuses()
  }, [companies, supabase])

  const getSubscriptionStatus = (companyId: string): CompanySubscriptionStatus | null => {
    return subscriptionStatuses.get(companyId) || null
  }

  const getStatusBadge = (status: CompanySubscriptionStatus | null) => {
    if (!status) {
      return (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-800 text-gray-400 border border-gray-700">
          No Plan
        </span>
      )
    }

    // #region agent log
    console.log('[CompanySelector] getStatusBadge called with status:', {
      companyId: status.companyId,
      hasSubscription: status.hasSubscription,
      isTrial: status.isTrial,
      trialDaysRemaining: status.trialDaysRemaining
    });
    // #endregion

    // Check for trial first, as trials are a form of subscription
    if (status.isTrial && status.trialDaysRemaining !== undefined && status.trialDaysRemaining > 0) {
      return (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
          Trial ({status.trialDaysRemaining}d)
        </span>
      )
    }

    if (status.hasSubscription) {
      return (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
          Valid
        </span>
      )
    } else {
      return (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
          Expired
        </span>
      )
    }
  }

  return (
    <div className="relative">
      {/* Current Company Display */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-4 p-5 sm:p-6 bg-[#1a1a1a] border border-gray-800 rounded-xl hover:border-gray-700 transition-all w-full group"
      >
        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg
            width="20"
            height="20"
            className="sm:w-6 sm:h-6"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M14 2V8H20"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="text-gray-500 text-xs sm:text-sm font-light">
              {currentCompany ? `${currentCompany.type.toLowerCase()} – ${currentCompany.year}` : 'No company selected'}
            </div>
            {currentCompany && (() => {
              const status = getSubscriptionStatus(currentCompany.id)
              return status ? (
                <div className="flex-shrink-0">
                  {getStatusBadge(status)}
                </div>
              ) : null
            })()}
          </div>
          <div className="text-white text-lg sm:text-xl font-light break-words leading-snug uppercase tracking-tight">
            {currentCompany ? currentCompany.name : 'Select Company'}
          </div>
        </div>
        <svg
          width="18"
          height="18"
          className={`flex-shrink-0 text-gray-500 transition-transform group-hover:text-gray-400 ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-3 w-full bg-[#1a1a1a] border border-gray-800 rounded-xl shadow-2xl z-50 sm:min-w-[400px] opacity-100">
            <div className="p-4 border-b border-gray-800">
              <div className="text-gray-500 text-xs font-light uppercase tracking-wider">
                Select Company
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {companies.map((company) => (
                <button
                  key={company.id}
                  onClick={() => {
                    onCompanyChange(company)
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center gap-4 p-4 hover:bg-gray-900/50 transition-colors text-left ${
                    currentCompany && company.id === currentCompany.id ? 'bg-gray-900/30' : ''
                  }`}
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg
                      width="18"
                      height="18"
                      className="sm:w-5 sm:h-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M14 2V8H20"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="text-gray-500 text-xs sm:text-sm font-light">
                        {company.type.toLowerCase()} – {company.year}
                      </div>
                      {(() => {
                        const status = getSubscriptionStatus(company.id)
                        return status ? (
                          <div className="flex-shrink-0">
                            {getStatusBadge(status)}
                          </div>
                        ) : null
                      })()}
                    </div>
                    <div className="text-white font-light text-sm sm:text-base break-words leading-snug uppercase tracking-tight">{company.name}</div>
                  </div>
                  {currentCompany && company.id === currentCompany.id && (
                    <div className="w-2 h-2 bg-gray-400 rounded-full flex-shrink-0"></div>
                  )}
                </button>
              ))}
              <button
                onClick={() => {
                  // Navigate to onboarding
                  router.push('/onboarding')
                }}
                className="w-full flex items-center gap-4 p-4 hover:bg-gray-900/50 transition-colors text-left border-t border-gray-800"
              >
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg
                    width="18"
                    height="18"
                    className="sm:w-5 sm:h-5 text-gray-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <div className="text-gray-300 font-light text-sm sm:text-base">Create New Company</div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
