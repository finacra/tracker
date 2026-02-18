'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

export default function RootPage() {
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(true)
  const supabase = createClient()
  
  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session) {
          // Check if user has companies (owned or via user_roles)
          const { data: ownedCompanies } = await supabase
            .from('companies')
            .select('id')
            .eq('user_id', session.user.id)
            .limit(1)
          
          const { data: userRoles } = await supabase
            .from('user_roles')
            .select('company_id')
            .eq('user_id', session.user.id)
            .not('company_id', 'is', null)
            .limit(1)
          
          const hasCompanies = (ownedCompanies && ownedCompanies.length > 0) || (userRoles && userRoles.length > 0)
          
          if (hasCompanies) {
            router.replace('/data-room')
          } else {
            // Check if user has active subscription or trial
            // Users with active trials should be able to create companies
            const { data: subData, error: subError } = await supabase
              .rpc('check_user_subscription', { target_user_id: session.user.id })
              .single()
            
            const subInfo = subData as {
              has_subscription: boolean
              is_trial: boolean
              trial_days_remaining: number
              tier: string
            } | null
            
            // Check for active subscription OR active trial (trial days remaining > 0)
            const hasActiveSubscription = subInfo?.has_subscription === true || 
                                         (subInfo?.is_trial === true && (subInfo?.trial_days_remaining ?? 0) > 0)
            
            if (hasActiveSubscription) {
              router.replace('/onboarding')
            } else {
              router.replace('/subscribe')
            }
          }
        } else {
          // No session, redirect to home
          router.replace('/home')
        }
      } catch (error) {
        console.error('Error checking auth:', error)
        router.replace('/home')
      } finally {
        setIsChecking(false)
      }
    }
    
    checkAuthAndRedirect()
  }, [router, supabase])

  // Show loading state while redirecting
  return (
    <div className="min-h-screen bg-primary-dark flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
