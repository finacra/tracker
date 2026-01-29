'use client'

import { useState, useEffect } from 'react'
import { useAuth } from './useAuth'
import { getActiveSubscription, type Subscription } from '@/lib/subscriptions/subscription'

export function useSubscription() {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchSubscription() {
      if (!user) {
        setSubscription(null)
        setLoading(false)
        return
      }

      try {
        const activeSubscription = await getActiveSubscription(user.id)
        setSubscription(activeSubscription)
      } catch (error) {
        console.error('Error fetching subscription:', error)
        setSubscription(null)
      } finally {
        setLoading(false)
      }
    }

    fetchSubscription()
  }, [user])

  const hasActiveSubscription = subscription !== null && subscription.status === 'active'
  const tier = subscription?.tier || null

  return {
    subscription,
    hasActiveSubscription,
    tier,
    loading,
  }
}
