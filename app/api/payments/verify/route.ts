import { NextRequest, NextResponse } from 'next/server'
import { createServerContainer } from '@/lib/composition/server-container'
import crypto from 'crypto'
import { getTierById, type BillingCycle } from '@/lib/pricing/tiers'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limiter'

export async function POST(request: NextRequest) {
  // Rate limit: 20 verification attempts per IP per 15 minutes
  const ip = getClientIp(request)
  const { allowed, retryAfterMs } = checkRateLimit(`verify-payment:${ip}`, 20, 15 * 60 * 1000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
    )
  }

  try {
    const { authService, paymentRepository, subscriptionRepository } = createServerContainer()
    const user = await authService.getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: 'Missing payment verification data' },
        { status: 400 }
      )
    }

    // Verify signature
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keySecret) {
      return NextResponse.json(
        { error: 'Razorpay key secret not configured' },
        { status: 500 }
      )
    }

    const text = `${razorpay_order_id}|${razorpay_payment_id}`
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(text)
      .digest('hex')

    if (generatedSignature !== razorpay_signature) {
      return NextResponse.json(
        { error: 'Invalid payment signature' },
        { status: 400 }
      )
    }

    // Get payment record
    let payment = null
    try {
      payment = await paymentRepository.findByProviderOrderIdForUser(razorpay_order_id, user.id)
    } catch (paymentError) {
      console.error('[Payment Verify] Error fetching payment:', paymentError)
      console.error('[Payment Verify] Order ID:', razorpay_order_id)
      console.error('[Payment Verify] User ID:', user.id)

      // Try to find payment without user_id filter (for debugging)
      const allPayments = await paymentRepository.findByProviderOrderId(razorpay_order_id)

      console.error('[Payment Verify] Payments found with order ID:', allPayments)

      return NextResponse.json(
        { error: `Payment record not found: ${paymentError instanceof Error ? paymentError.message : 'Unknown error'}` },
        { status: 404 }
      )
    }

    if (!payment) {
      console.error('[Payment Verify] Payment is null')
      console.error('[Payment Verify] Order ID:', razorpay_order_id)
      console.error('[Payment Verify] User ID:', user.id)

      return NextResponse.json(
        { error: 'Payment record not found' },
        { status: 404 }
      )
    }

    // Update payment status
    try {
      await paymentRepository.markCompleted(payment.id, {
        providerPaymentId: razorpay_payment_id,
        providerSignature: razorpay_signature,
        paymentProvider: 'razorpay',
        amountPaid: payment.amount,
        paidAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    } catch (updateError) {
      console.error('Error updating payment:', updateError)
      return NextResponse.json(
        { error: 'Failed to update payment' },
        { status: 500 }
      )
    }

    // If this is a trial verification payment, just verify and return
    // The trial will be created separately via createTrialAfterVerification
    if (payment.paymentType === 'trial_verification') {
      return NextResponse.json({
        success: true,
        message: 'Trial verification payment confirmed',
        payment_type: 'trial_verification',
      })
    }

    // For regular subscription payments, create or update subscription
    const tierConfig = getTierById(payment.tier)
    if (!tierConfig) {
      return NextResponse.json(
        { error: 'Invalid tier configuration' },
        { status: 500 }
      )
    }

    // Calculate subscription dates
    const startDate = new Date()
    const endDate = new Date()
    const billingCycle = payment.billingCycle as BillingCycle

    switch (billingCycle) {
      case 'monthly':
        endDate.setMonth(endDate.getMonth() + 1)
        break
      case 'quarterly':
        endDate.setMonth(endDate.getMonth() + 3)
        break
      case 'half-yearly':
        endDate.setMonth(endDate.getMonth() + 6)
        break
      case 'annual':
        endDate.setFullYear(endDate.getFullYear() + 1)
        break
    }

    try {
      await subscriptionRepository.activatePaidSubscription({
        userId: user.id,
        appUserId: user.canonicalId,
        companyId: payment.companyId,
        tier: payment.tier,
        billingCycle: payment.billingCycle,
        amount: payment.amount,
        currency: payment.currency,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      })
    } catch (subscriptionError) {
      console.error('Error activating subscription:', subscriptionError)
    }

    return NextResponse.json({
      success: true,
      message: 'Payment verified and subscription activated',
    })
  } catch (error: any) {
    console.error('Error verifying payment:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to verify payment' },
      { status: 500 }
    )
  }
}
