'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getCompanyAccessStatuses } from '@/app/data-room/actions'

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
  // Pre-fetched subscription status for the initially-selected company.
  // Provided by /data-room/page.tsx from getDataRoomInitState's payload
  // so we don't immediately roundtrip getCompanyAccessStatuses for the
  // company the user is already looking at.
  initialCurrentCompanyStatus?: {
    companyId: string
    hasSubscription: boolean
    isTrial: boolean
    trialDaysRemaining?: number
    tier?: string | null
    status?: string
  } | null
}

export default function CompanySelector({ companies, currentCompany, onCompanyChange, initialCurrentCompanyStatus }: CompanySelectorProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [subscriptionStatuses, setSubscriptionStatuses] = useState<Map<string, CompanySubscriptionStatus>>(() => {
    if (!initialCurrentCompanyStatus) return new Map()
    return new Map([
      [initialCurrentCompanyStatus.companyId, {
        companyId: initialCurrentCompanyStatus.companyId,
        hasSubscription: initialCurrentCompanyStatus.hasSubscription,
        isTrial: initialCurrentCompanyStatus.isTrial,
        trialDaysRemaining: initialCurrentCompanyStatus.trialDaysRemaining,
        tier: initialCurrentCompanyStatus.tier ?? undefined,
      }],
    ])
  })
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(false)
  const fetchedStatusIdsRef = useRef<Set<string>>(
    new Set(initialCurrentCompanyStatus ? [initialCurrentCompanyStatus.companyId] : [])
  )

  // Fetch the selected company's status first, then fetch the rest when the dropdown is opened.
  useEffect(() => {
    async function fetchSubscriptionStatuses() {
      const targetCompanies = isOpen
        ? companies
        : currentCompany
          ? [currentCompany]
          : []

      const companiesToCheck = targetCompanies.filter(
        (company: Company) => !fetchedStatusIdsRef.current.has(company.id)
      )

      if (companiesToCheck.length === 0) return

      setIsLoadingStatuses(true)

      try {
        const result = await getCompanyAccessStatuses(companiesToCheck.map((company) => company.id))
        const statuses = result.success && result.statuses
          ? result.statuses.map((status) => ({
              companyId: status.companyId,
              status: {
                companyId: status.companyId,
                hasSubscription: status.hasSubscription,
                isTrial: status.isTrial,
                trialDaysRemaining: status.trialDaysRemaining,
                tier: status.tier ?? undefined,
              },
            }))
          : companiesToCheck.map((company) => ({
              companyId: company.id,
              status: {
                companyId: company.id,
                hasSubscription: false,
                isTrial: false,
              },
            }))

        setSubscriptionStatuses((prev: Map<string, CompanySubscriptionStatus>) => {
          const next = new Map(prev)
          statuses.forEach(({ companyId, status }) => {
            next.set(companyId, status)
            fetchedStatusIdsRef.current.add(companyId)
          })
          return next
        })
      } catch (err) {
        console.error('Error fetching subscription statuses:', err)
      } finally {
        setIsLoadingStatuses(false)
      }
    }

    fetchSubscriptionStatuses()
  }, [companies, currentCompany, isOpen])

  const getSubscriptionStatus = (companyId: string): CompanySubscriptionStatus | null => {
    return subscriptionStatuses.get(companyId) || null
  }

  const getStatusBadge = (status: CompanySubscriptionStatus | null) => {
    if (!status) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-bg-elevated text-fg-muted border border-line/15">
          No Plan
        </span>
      )
    }

    // Check for trial first, as trials are a form of subscription
    if (status.isTrial && status.trialDaysRemaining !== undefined && status.trialDaysRemaining > 0) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-warn/12 text-accent-warn border border-accent-warn/25">
          Trial · <span className="font-mono tabular-nums">{status.trialDaysRemaining}d</span>
        </span>
      )
    }

    if (status.hasSubscription) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-success/15 text-accent-success border border-accent-success/30">
          Active
        </span>
      )
    } else {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-danger/12 text-accent-danger border border-accent-danger/25">
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
        className="flex items-center gap-4 p-4 sm:p-5 bg-bg-card border border-line/15 rounded-token-md hover:border-line/30 transition-colors duration-token ease-token w-full group"
      >
        <div className="w-11 h-11 sm:w-12 sm:h-12 bg-bg-elevated border border-line/10 rounded-token-md flex items-center justify-center flex-shrink-0">
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
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="text-fg-muted text-[11px] uppercase tracking-wider">
            {currentCompany ? `${currentCompany.type.toLowerCase()} · ${currentCompany.year}` : 'No company selected'}
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
          <div className="text-fg-primary text-base sm:text-lg font-medium break-words leading-snug tracking-tight">
            {currentCompany ? currentCompany.name : 'Select Company'}
          </div>
        </div>
        <svg
          width="16"
          height="16"
          className={`flex-shrink-0 text-fg-muted transition-transform duration-token ease-token group-hover:text-fg-secondary ${isOpen ? 'rotate-180' : ''}`}
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
          <div className="absolute top-full left-0 mt-2 w-full bg-bg-card border border-line/15 rounded-token-md shadow-popover z-50 sm:min-w-[400px]">
            <div className="px-4 py-3 border-b border-line/10">
              <div className="text-fg-muted text-[11px] font-medium uppercase tracking-wider">
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
                  className={`w-full flex items-center gap-4 px-4 py-3 hover:bg-bg-hover transition-colors duration-token ease-token text-left ${
                    currentCompany && company.id === currentCompany.id ? 'bg-bg-hover' : ''
                  }`}
                >
                  <div className="w-10 h-10 bg-bg-elevated border border-line/10 rounded-token-md flex items-center justify-center flex-shrink-0">
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
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-fg-muted text-[11px] uppercase tracking-wider">
                      {company.type.toLowerCase()} · {company.year}
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
                    <div className="text-fg-primary font-medium text-sm break-words leading-snug tracking-tight">{company.name}</div>
                  </div>
                  {currentCompany && company.id === currentCompany.id && (
                    <div className="w-1.5 h-1.5 bg-accent-brand rounded-full flex-shrink-0"></div>
                  )}
                </button>
              ))}
              <button
                onClick={() => {
                  // Navigate to onboarding
                  router.push('/onboarding')
                }}
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-bg-hover transition-colors duration-token ease-token text-left border-t border-line/10"
              >
                <div className="w-10 h-10 bg-bg-elevated border border-line/10 rounded-token-md flex items-center justify-center flex-shrink-0">
                  <svg
                    width="16"
                    height="16"
                    className="text-fg-muted"
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
                <div className="text-fg-secondary font-medium text-sm">Create New Company</div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
