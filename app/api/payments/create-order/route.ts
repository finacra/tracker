import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createServerContainer } from '@/lib/composition/server-container'
import { getRazorpayInstance } from '@/lib/razorpay/client'
import { calculatePricing, getTierById, type BillingCycle, type PricingTier } from '@/lib/pricing/tiers'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { authService, paymentRepository, companyRepository } = createServerContainer()
    const user = await authService.getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { tier, billingCycle, companyId } = body

    // Get company country_code for currency
    let countryCode = 'IN'
    if (companyId) {
      const code = await companyRepository.getCountryCode(companyId)
      if (code) {
        countryCode = code
      }
    }

    // Validate inputs
    if (!tier || !billingCycle) {
      return NextResponse.json(
        { error: 'Tier and billing cycle are required' },
        { status: 400 }
      )
    }

    // Get pricing
    const tierConfig = getTierById(tier as PricingTier)
    if (!tierConfig) {
      return NextResponse.json(
        { error: 'Invalid tier' },
        { status: 400 }
      )
    }

    const pricing = calculatePricing(tierConfig, billingCycle as BillingCycle, countryCode)
    const amountInPaise = Math.round(pricing.price * 100) // Convert to paise

    // Validate Razorpay credentials
    if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('Razorpay credentials missing:', {
        keyId: !!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        keySecret: !!process.env.RAZORPAY_KEY_SECRET,
      })
      return NextResponse.json(
        { error: 'Razorpay credentials not configured' },
        { status: 500 }
      )
    }

    // Create Razorpay order
    // Generate short receipt ID (max 40 chars for Razorpay)
    // Format: sub_<short_user_id>_<timestamp>
    const shortUserId = user.id.replace(/-/g, '').substring(0, 8) // Remove dashes and take first 8 chars
    const timestamp = Date.now().toString().slice(-10) // Last 10 digits of timestamp
    const receipt = `sub_${shortUserId}_${timestamp}` // Max length: 4 + 8 + 1 + 10 = 23 chars

    const razorpay = getRazorpayInstance()
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: pricing.currency || 'INR',
      receipt: receipt,
      notes: {
        user_id: user.id,
        company_id: companyId || '',
        tier: tier,
        billing_cycle: billingCycle,
        amount_rupees: pricing.price.toString(),
      },
    })

    // Store payment record in database
    try {
      await paymentRepository.createPending({
        userId: user.id,
        appUserId: user.canonicalId,
        companyId: companyId || null,
        providerOrderId: order.id,
        paymentProvider: 'razorpay',
        amount: pricing.price,
        currency: pricing.currency || 'INR',
        tier: tier as PricingTier,
        billingCycle: billingCycle as BillingCycle,
        receipt: order.receipt ?? null,
        notes: (order.notes as Record<string, string> | undefined) ?? null,
      })
    } catch (paymentError: any) {
      console.error('Error storing payment:', paymentError)
      console.error('Payment error details:', {
        message: paymentError?.message,
      })
      // Continue anyway - order is created in Razorpay
      // But log the error for debugging
    }

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    })
  } catch (error: any) {
    console.error('Error creating Razorpay order:', error)
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ? 'Set' : 'Missing',
      keySecret: process.env.RAZORPAY_KEY_SECRET ? 'Set' : 'Missing',
    })
    return NextResponse.json(
      {
        error: error.message || 'Failed to create order',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}
