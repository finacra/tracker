import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import crypto from 'crypto'
import { calculatePricing, getTierById, type BillingCycle } from '@/lib/pricing/tiers'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
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
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('razorpay_order_id', razorpay_order_id)
      .eq('user_id', user.id)
      .single()

    if (paymentError || !payment) {
      return NextResponse.json(
        { error: 'Payment record not found' },
        { status: 404 }
      )
    }

    // Update payment status
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        razorpay_payment_id: razorpay_payment_id,
        razorpay_signature: razorpay_signature,
        status: 'completed',
        amount_paid: payment.amount,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id)

    if (updateError) {
      console.error('Error updating payment:', updateError)
      return NextResponse.json(
        { error: 'Failed to update payment' },
        { status: 500 }
      )
    }

    // Create or update subscription
    const tierConfig = getTierById(payment.tier as any)
    if (!tierConfig) {
      return NextResponse.json(
        { error: 'Invalid tier configuration' },
        { status: 500 }
      )
    }

    // Calculate subscription dates
    const startDate = new Date()
    const endDate = new Date()
    const billingCycle = payment.billing_cycle as BillingCycle

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

    // Check if subscription exists
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (existingSubscription) {
      // Update existing subscription
      const { error: subUpdateError } = await supabase
        .from('subscriptions')
        .update({
          tier: payment.tier,
          billing_cycle: payment.billing_cycle,
          amount: payment.amount,
          status: 'active',
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          current_period_start: startDate.toISOString(),
          current_period_end: endDate.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSubscription.id)

      if (subUpdateError) {
        console.error('Error updating subscription:', subUpdateError)
      }
    } else {
      // Create new subscription
      const { error: subInsertError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: user.id,
          company_id: payment.company_id,
          tier: payment.tier,
          billing_cycle: payment.billing_cycle,
          amount: payment.amount,
          currency: payment.currency,
          status: 'active',
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          current_period_start: startDate.toISOString(),
          current_period_end: endDate.toISOString(),
        })

      if (subInsertError) {
        console.error('Error creating subscription:', subInsertError)
      }
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
