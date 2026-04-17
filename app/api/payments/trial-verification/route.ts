import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createServerContainer } from '@/lib/composition/server-container'
import { getRazorpayInstance } from '@/lib/razorpay/client'
import { handleAPIError } from '@/lib/errors/handle-error'

// Trial verification amount: ₹2 (200 paise)
const TRIAL_VERIFICATION_AMOUNT = 200

export async function POST(request: NextRequest) {
  try {
    const { authService, paymentRepository, companyRepository } = createServerContainer()
    const user = await authService.getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { companyId, tier } = body

    // Get company country_code for currency
    let countryCode = 'IN'
    let currency = 'INR'
    let amountRupees = '2'
    let amountSmallest = 200 // Default 200 paise

    if (companyId) {
      const countryCodeFetched = await companyRepository.getCountryCode(companyId)
      if (countryCodeFetched) {
        countryCode = countryCodeFetched
        try {
          const { CountryRegistry } = require('@/lib/countries')
          const country = CountryRegistry.get(countryCode)
          if (country) {
            currency = country.currency.code
          }
        } catch (e) { }
      }
    }

    // Validate Razorpay credentials
    if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return NextResponse.json(
        { error: 'Razorpay credentials not configured' },
        { status: 500 }
      )
    }

    // Create Razorpay order for ₹2 verification
    const shortUserId = user.id.replace(/-/g, '').substring(0, 8)
    const timestamp = Date.now().toString().slice(-10)
    const receipt = `trial_${shortUserId}_${timestamp}`

    const razorpay = getRazorpayInstance()
    const order = await razorpay.orders.create({
      amount: amountSmallest,
      currency: currency,
      receipt: receipt,
      notes: {
        user_id: user.id,
        company_id: companyId || '',
        tier: tier || '',
        type: 'trial_verification',
        amount_rupees: '2',
      },
    })

    // Store payment record in database
    // Note: billing_cycle has CHECK constraint allowing only: 'monthly', 'quarterly', 'half-yearly', 'annual'
    // For trial verification (one-time payment), we use 'monthly' as a placeholder since it's just for verification
    try {
      await paymentRepository.createPending({
        userId: user.id,
        companyId: companyId || null,
        providerOrderId: order.id,
        paymentProvider: 'razorpay',
        amount: 2,
        currency,
        tier: (tier || 'starter'),
        billingCycle: 'monthly',
        receipt: order.receipt ?? null,
        notes: (order.notes as Record<string, string> | undefined) ?? null,
        paymentType: 'trial_verification',
      })
    } catch (paymentError) {
      console.error('[Trial Verification] Error storing payment:', paymentError)
      // Don't continue - we need the payment record for verification
      return handleAPIError(paymentError)
    }

    console.log('[Trial Verification] Payment record created for order:', order.id)

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    })
  } catch (error) {
    return handleAPIError(error)
  }
}
