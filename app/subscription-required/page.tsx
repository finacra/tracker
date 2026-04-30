'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { getOwnedCompanySubscriptionOverview } from '@/app/data-room/actions'
import SubtleCircuitBackground from '@/components/ui/SubtleCircuitBackground'

interface Company {
  id: string
  name: string
}

interface CompanyWithStatus extends Company {
  status: 'trial' | 'valid' | 'expired'
  isTrial: boolean
  trialDaysRemaining?: number
}

function SubscriptionRequiredInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  
  const companyId = searchParams.get('company_id')
  
  const [company, setCompany] = useState<Company | null>(null)
  const [accessibleCompanies, setAccessibleCompanies] = useState<CompanyWithStatus[]>([])
  const [expiredCompanies, setExpiredCompanies] = useState<Company[]>([])
  const [selectedExpiredCompany, setSelectedExpiredCompany] = useState<string | null>(companyId)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      if (authLoading || !user) return
      
      setIsLoading(true)
      
      try {
        const result = await getOwnedCompanySubscriptionOverview(companyId)

        if (result.success) {
          setCompany(result.company ?? null)
          setAccessibleCompanies(result.accessibleCompanies ?? [])
          setExpiredCompanies(result.expiredCompanies ?? [])
          setSelectedExpiredCompany(result.selectedExpiredCompanyId ?? null)
        }
      } catch (err) {
        console.error('Error fetching data:', err)
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchData()
  }, [user, authLoading, companyId])

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
    }
  }, [user, authLoading, router])

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-line/30 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      <SubtleCircuitBackground />
      
      <div className="relative z-10 flex items-center justify-center min-h-screen px-4 py-8">
        <div className="max-w-lg w-full space-y-6">
          {/* Active Companies Section - Prominent at top */}
          {accessibleCompanies.length > 0 && (
            <div className="bg-bg-card border border-line/10 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-lg font-light text-white">Access Your Active Companies</h2>
              </div>
              <div className="space-y-2">
                {accessibleCompanies.map((c) => {
                  const getStatusBadge = () => {
                    if (c.isTrial) {
                      return (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                          Trial {c.trialDaysRemaining !== undefined ? `(${c.trialDaysRemaining}d)` : ''}
                        </span>
                      )
                    } else {
                      return (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
                          Valid
                        </span>
                      )
                    }
                  }
                  
                  return (
                    <button
                      key={c.id}
                      onClick={() => router.push(`/data-room?company_id=${c.id}`)}
                      className="w-full text-left px-4 py-3 bg-bg-card rounded-lg text-fg-secondary hover:bg-bg-elevated transition-colors text-sm font-light flex items-center justify-between group"
                    >
                      <span className="truncate flex-1">{c.name}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {getStatusBadge()}
                        <svg className="w-4 h-4 text-fg-muted group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-bg-elevated border border-line/15 rounded-xl flex items-center justify-center">
              <svg
                className="w-10 h-10 text-fg-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
          </div>
          
          {/* Main Card */}
          <div className="bg-bg-card border border-line/10 rounded-xl p-8 text-center">
            <h1 className="text-2xl font-light text-white mb-3">
              Subscription Required
            </h1>
            
            {selectedExpiredCompany && expiredCompanies.length > 0 ? (
              <p className="text-fg-muted mb-6 font-light">
                Your trial for <span className="text-white font-light">{expiredCompanies.find(c => c.id === selectedExpiredCompany)?.name || 'this company'}</span> has expired. 
                Subscribe to continue accessing this company.
              </p>
            ) : expiredCompanies.length > 0 ? (
              <p className="text-fg-muted mb-6 font-light">
                Your trial has expired. Subscribe to continue accessing your companies.
              </p>
            ) : (
              <p className="text-fg-muted mb-6 font-light">
                Your trial has expired. Subscribe to continue accessing the Data Room.
              </p>
            )}
            
            {/* Expired Companies Selection - Show if multiple expired companies */}
            {expiredCompanies.length > 1 && (
              <div className="mb-6 text-left">
                <p className="text-sm text-fg-muted mb-3 font-light">
                  Select company to subscribe:
                </p>
                <div className="space-y-2">
                  {expiredCompanies.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedExpiredCompany(c.id)}
                      className={`w-full text-left px-4 py-3 rounded-lg text-sm font-light transition-colors flex items-center gap-3 ${
                        selectedExpiredCompany === c.id
                          ? 'bg-bg-hover text-white border border-line/30'
                          : 'bg-bg-card text-fg-secondary hover:bg-bg-elevated border border-line/10'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedExpiredCompany === c.id
                          ? 'border-white bg-white'
                          : 'border-line/40'
                      }`}>
                        {selectedExpiredCompany === c.id && (
                          <div className="w-2 h-2 rounded-full bg-bg-card"></div>
                        )}
                      </div>
                      <span className="truncate flex-1">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Actions */}
            <div className="space-y-3">
              {selectedExpiredCompany && expiredCompanies.length > 0 && (
                <button
                  onClick={() => router.push(`/subscribe?company_id=${selectedExpiredCompany}`)}
                  className="w-full bg-bg-hover text-white py-3 px-6 rounded-lg font-light hover:bg-bg-hover transition-colors"
                >
                  Subscribe to {expiredCompanies.find(c => c.id === selectedExpiredCompany)?.name || 'Selected Company'}
                </button>
              )}
              
              <button
                onClick={() => router.push('/pricing')}
                className="w-full bg-transparent border border-line/15 text-fg-secondary py-3 px-6 rounded-lg font-light hover:border-line/30 hover:text-white transition-colors"
              >
                View All Plans
              </button>
            </div>
            
            {/* Create New Company */}
            <div className="mt-6 pt-6 border-t border-line/10">
              <button
                onClick={() => router.push('/onboarding')}
                className="text-fg-muted hover:text-white text-sm font-light transition-colors"
              >
                + Create a New Company
              </button>
            </div>
          </div>
          
          {/* Help Text */}
          <div className="mt-6 text-center">
            <p className="text-fg-muted text-sm font-light">
              Need help? Contact{' '}
              <a href="mailto:info@finacra.com" className="text-fg-muted hover:text-white transition-colors">
                info@finacra.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SubscriptionRequiredPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-line/30 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SubscriptionRequiredInner />
    </Suspense>
  )
}
