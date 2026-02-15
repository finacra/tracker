'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/utils/supabase/client'
import SubtleCircuitBackground from '@/components/SubtleCircuitBackground'

interface Company {
  id: string
  name: string
}

function SubscriptionRequiredInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  
  const companyId = searchParams.get('company_id')
  
  const [company, setCompany] = useState<Company | null>(null)
  const [ownedCompanies, setOwnedCompanies] = useState<Company[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      if (authLoading || !user) return
      
      setIsLoading(true)
      
      try {
        // Fetch specific company if provided
        if (companyId) {
          const { data } = await supabase
            .from('companies')
            .select('id, name')
            .eq('id', companyId)
            .single()
          
          if (data) {
            setCompany(data)
          }
        }
        
        // Fetch all owned companies
        const { data: companies } = await supabase
          .from('companies')
          .select('id, name')
          .eq('user_id', user.id)
        
        setOwnedCompanies(companies || [])
      } catch (err) {
        console.error('Error fetching data:', err)
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchData()
  }, [user, authLoading, companyId, supabase])

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
    }
  }, [user, authLoading, router])

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      <SubtleCircuitBackground />
      
      <div className="relative z-10 flex items-center justify-center min-h-screen px-4">
        <div className="max-w-lg w-full">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gray-800 border border-gray-700 rounded-xl flex items-center justify-center">
              <svg
                className="w-10 h-10 text-gray-400"
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
          <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-8 text-center">
            <h1 className="text-2xl font-light text-white mb-3">
              Subscription Required
            </h1>
            
            {company ? (
              <p className="text-gray-400 mb-6 font-light">
                Your trial for <span className="text-white font-light">{company.name}</span> has expired. 
                Subscribe to continue accessing this company.
              </p>
            ) : (
              <p className="text-gray-400 mb-6 font-light">
                Your trial has expired. Subscribe to continue accessing the Data Room.
              </p>
            )}
            
            {/* Actions */}
            <div className="space-y-3">
              {company && (
                <button
                  onClick={() => router.push(`/subscribe?company_id=${company.id}`)}
                  className="w-full bg-gray-700 text-white py-3 px-6 rounded-lg font-light hover:bg-gray-600 transition-colors"
                >
                  Subscribe to {company.name}
                </button>
              )}
              
              <button
                onClick={() => router.push('/pricing')}
                className="w-full bg-transparent border border-gray-700 text-gray-300 py-3 px-6 rounded-lg font-light hover:border-gray-600 hover:text-white transition-colors"
              >
                View All Plans
              </button>
            </div>
            
            {/* Other Companies */}
            {ownedCompanies.length > 1 && (
              <div className="mt-8 pt-6 border-t border-gray-800">
                <p className="text-sm text-gray-500 mb-3">
                  You have other companies you may have access to:
                </p>
                <div className="space-y-2">
                  {ownedCompanies
                    .filter(c => c.id !== companyId)
                    .slice(0, 3)
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => router.push(`/subscribe?company_id=${c.id}`)}
                        className="w-full text-left px-4 py-2 bg-gray-900 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors text-sm font-light"
                      >
                        {c.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
            
            {/* Create New Company */}
            <div className="mt-6 pt-6 border-t border-gray-800">
              <button
                onClick={() => router.push('/onboarding')}
                className="text-gray-400 hover:text-white text-sm font-light transition-colors"
              >
                + Create a New Company
              </button>
            </div>
          </div>
          
          {/* Help Text */}
          <div className="mt-6 text-center">
            <p className="text-gray-500 text-sm font-light">
              Need help? Contact{' '}
              <a href="mailto:info@finacra.com" className="text-gray-400 hover:text-white transition-colors">
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
        <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SubscriptionRequiredInner />
    </Suspense>
  )
}
