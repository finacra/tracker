'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { loadRazorpayScript, createRazorpayOrder, verifyPayment, openRazorpayCheckout, type RazorpayResponse } from '@/lib/razorpay/payment'
import { formatPrice, type PricingTier, type BillingCycle } from '@/lib/pricing/tiers'

interface PaymentButtonProps {
  tier: PricingTier
  billingCycle: BillingCycle
  price: number
  companyId?: string
  className?: string
}

export default function PaymentButton({ tier, billingCycle, price, companyId, className }: PaymentButtonProps) {
  const { user } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [isScriptLoaded, setIsScriptLoaded] = useState(false)

  useEffect(() => {
    loadRazorpayScript()
      .then(() => setIsScriptLoaded(true))
      .catch((error) => {
        console.error('Failed to load Razorpay script:', error)
      })
  }, [])

  const handlePayment = async () => {
    if (!user) {
      alert('Please sign in to continue')
      return
    }

    if (!isScriptLoaded) {
      alert('Payment system is loading. Please try again in a moment.')
      return
    }

    setIsLoading(true)

    try {
      // Create order
      const orderData = await createRazorpayOrder(tier, billingCycle, companyId)

      // Open Razorpay checkout
      openRazorpayCheckout({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Finnovate AI',
        description: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan - ${billingCycle}`,
        order_id: orderData.orderId,
        prefill: {
          email: user.email || undefined,
          name: user.user_metadata?.full_name || undefined,
        },
        theme: {
          color: '#FF6B35', // Primary orange color
        },
        handler: async (response: RazorpayResponse) => {
          try {
            // Verify payment
            const verification = await verifyPayment(
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature
            )

            if (verification.success) {
              alert('Payment successful! Your subscription has been activated.')
              // Redirect to data-room after successful payment
              window.location.href = '/data-room'
            }
          } catch (error: any) {
            console.error('Payment verification error:', error)
            alert(`Payment verification failed: ${error.message}`)
          } finally {
            setIsLoading(false)
          }
        },
        modal: {
          ondismiss: () => {
            setIsLoading(false)
          },
        },
      })
    } catch (error: any) {
      console.error('Payment error:', error)
      alert(`Payment failed: ${error.message}`)
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={handlePayment}
      disabled={isLoading || !isScriptLoaded}
      className={className || 'w-full py-3 px-6 rounded-lg font-semibold transition-all bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 disabled:cursor-not-allowed'}
    >
      {isLoading ? 'Processing...' : `Subscribe - ${formatPrice(price)}`}
    </button>
  )
}
