'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { getOwnerExpiredInfo } from './actions'
import SubtleCircuitBackground from '@/components/ui/SubtleCircuitBackground'

interface OwnerInfo {
  email: string
  name?: string
  companyName: string
}

function OwnerExpiredPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  
  const companyId = searchParams.get('company_id')
  const [ownerInfo, setOwnerInfo] = useState<OwnerInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const hasFetchedRef = useRef(false)
  const hasRedirectedRef = useRef(false)

  useEffect(() => {
    // Prevent multiple fetches
    if (hasFetchedRef.current || authLoading) return
    
    async function fetchOwnerInfo() {
      if (!companyId) {
        setIsLoading(false)
        return
      }

      hasFetchedRef.current = true
      try {
        const result = await getOwnerExpiredInfo(companyId)
        if (result.success && result.companyName) {
          setOwnerInfo({
            email: '',
            companyName: result.companyName,
          })
        }
      } catch (err) {
        console.error('Error fetching owner info:', err)
      } finally {
        setIsLoading(false)
      }
    }

      fetchOwnerInfo()
  }, [companyId, authLoading])

  // Redirect if not authenticated (only once)
  useEffect(() => {
    if (hasRedirectedRef.current) return
    
    if (!authLoading && !user) {
      hasRedirectedRef.current = true
      router.push('/')
    }
  }, [user, authLoading, router])

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-orange border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      <SubtleCircuitBackground />
      
      <div className="relative z-10 flex items-center justify-center min-h-screen px-4">
        <div className="max-w-md w-full">
          {/* Icon */}
          <div className="flex justify-center mb-8">
            <div className="w-20 h-20 bg-yellow-500/20 rounded-2xl flex items-center justify-center">
              <svg className="w-10 h-10 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          {/* Card */}
          <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-8 text-center">
            <h1 className="text-2xl font-bold text-white mb-4">
              Subscription Expired
            </h1>
            
            <p className="text-gray-400 mb-6">
              The subscription for{' '}
              <span className="text-white font-semibold">
                {ownerInfo?.companyName || 'this company'}
              </span>{' '}
              has expired. Please contact the company owner to renew their subscription.
            </p>

            {/* Info Box */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3 text-left">
                <div className="w-10 h-10 bg-primary-orange/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-primary-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Company Owner</p>
                  <p className="text-white text-sm font-medium">
                    Contact your administrator
                  </p>
                </div>
              </div>
            </div>

            <p className="text-gray-500 text-sm mb-6">
              Once the subscription is renewed, you'll automatically regain access to the data room.
            </p>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  // Clear the company selection and go to data-room
                  // This allows user to select a different company with valid subscription
                  router.push('/data-room')
                }}
                className="w-full bg-gray-800 text-gray-300 px-6 py-3 rounded-lg font-medium hover:bg-gray-700 transition-colors"
              >
                Select Another Company
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-8">
            <p className="text-gray-600 text-sm">
              Need help? Contact{' '}
              <a href="mailto:info@finacra.com" className="text-primary-orange hover:underline">
                info@finacra.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OwnerSubscriptionExpiredPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-orange border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <OwnerExpiredPageInner />
    </Suspense>
  )
}
