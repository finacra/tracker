import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('RAZORPAY_WEBHOOK_SECRET not configured')
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      )
    }

    const body = await request.text()
    const signature = request.headers.get('x-razorpay-signature')

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 }
      )
    }

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex')

    if (signature !== expectedSignature) {
      console.error('Invalid webhook signature')
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      )
    }

    const event = JSON.parse(body)
    const supabase = await createClient()

    // Handle different event types
    switch (event.event) {
      case 'payment.captured':
        await handlePaymentCaptured(event.payload, supabase)
        break
      case 'payment.failed':
        await handlePaymentFailed(event.payload, supabase)
        break
      case 'order.paid':
        await handleOrderPaid(event.payload, supabase)
        break
      default:
        console.log(`Unhandled webhook event: ${event.event}`)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: error.message || 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

async function handlePaymentCaptured(payload: any, supabase: any) {
  const payment = payload.payment.entity
  const order = payload.order.entity

  // Update payment status
  await supabase
    .from('payments')
    .update({
      razorpay_payment_id: payment.id,
      status: 'completed',
      amount_paid: payment.amount / 100, // Convert from paise to rupees
      payment_method: payment.method,
      paid_at: new Date(payment.created_at * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('razorpay_order_id', order.id)

  // Handle trial verification payments
  const notes = order.notes || {}
  if (notes.type === 'trial_verification') {
    // Schedule refund for 24 hours later
    const refundScheduledAt = new Date()
    refundScheduledAt.setHours(refundScheduledAt.getHours() + 24)
    
    await supabase
      .from('payments')
      .update({
        refund_scheduled_at: refundScheduledAt.toISOString(),
        refund_status: 'scheduled',
      })
      .eq('razorpay_order_id', order.id)
    
    console.log(`Trial verification payment captured. Refund scheduled for: ${refundScheduledAt.toISOString()}`)
    return
  }

  // Handle subscription creation/update
  if (notes.user_id && notes.tier && notes.billing_cycle) {
    await createOrUpdateSubscription(
      notes.user_id,
      notes.company_id || null,
      notes.tier,
      notes.billing_cycle,
      payment.amount / 100,
      supabase
    )
  }
}

async function handlePaymentFailed(payload: any, supabase: any) {
  const payment = payload.payment.entity
  const order = payload.order.entity

  await supabase
    .from('payments')
    .update({
      razorpay_payment_id: payment.id,
      status: 'failed',
      error_code: payment.error_code,
      error_description: payment.error_description,
      updated_at: new Date().toISOString(),
    })
    .eq('razorpay_order_id', order.id)
}

async function handleOrderPaid(payload: any, supabase: any) {
  const order = payload.order.entity

  await supabase
    .from('payments')
    .update({
      status: 'completed',
      amount_paid: order.amount_paid / 100,
      updated_at: new Date().toISOString(),
    })
    .eq('razorpay_order_id', order.id)
}

async function createOrUpdateSubscription(
  userId: string,
  companyId: string | null,
  tier: string,
  billingCycle: string,
  amount: number,
  supabase: any
) {
  const startDate = new Date()
  const endDate = new Date()

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

  // Determine subscription type based on tier
  const subscriptionType = tier === 'enterprise' ? 'user' : 'company'
  const finalCompanyId = tier === 'enterprise' ? null : companyId

  // For Enterprise: check by user_id (user-first)
  // For Starter/Professional: check by company_id (company-first)
  let existing
  if (subscriptionType === 'user') {
    const { data } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('subscription_type', 'user')
      .eq('status', 'active')
      .single()
    existing = data
  } else {
    // Company-first: check by company_id
    if (finalCompanyId) {
      const { data } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('company_id', finalCompanyId)
        .eq('subscription_type', 'company')
        .eq('status', 'active')
        .single()
      existing = data
    }
  }

  if (existing) {
    await supabase
      .from('subscriptions')
      .update({
        tier,
        billing_cycle: billingCycle,
        amount,
        status: 'active',
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        current_period_start: startDate.toISOString(),
        current_period_end: endDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        company_id: finalCompanyId,
        subscription_type: subscriptionType,
        tier,
        billing_cycle: billingCycle,
        amount,
        currency: 'INR',
        status: 'active',
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        current_period_start: startDate.toISOString(),
        current_period_end: endDate.toISOString(),
      })
  }
}
