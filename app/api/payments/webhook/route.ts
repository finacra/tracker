import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
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
    const eventId = request.headers.get('x-razorpay-event-id')
    const requestId = request.headers.get('request-id')

    console.log(`[Webhook] Incoming webhook - Event ID: ${eventId}, Request ID: ${requestId}`)
    console.log(`[Webhook] Headers received:`, {
      'x-razorpay-signature': signature ? 'present' : 'missing',
      'x-razorpay-event-id': eventId,
      'content-type': request.headers.get('content-type'),
      'user-agent': request.headers.get('user-agent'),
    })

    if (!signature) {
      console.error('[Webhook] Missing X-Razorpay-Signature header')
      console.error('[Webhook] All headers:', Object.fromEntries(request.headers.entries()))
      console.error('[Webhook] This usually means:')
      console.error('[Webhook] 1. Webhook secret is not configured in Razorpay dashboard')
      console.error('[Webhook] 2. Webhook URL is not properly configured')
      console.error('[Webhook] 3. This is a test webhook from Razorpay dashboard (test webhooks may not include signature)')
      
      // In production, we should reject webhooks without signatures for security
      // But we'll log the event data for debugging purposes
      try {
        const event = JSON.parse(body)
        console.error('[Webhook] Event data (for debugging):', {
          event: event.event,
          event_id: event.id,
          created_at: event.created_at,
        })
      } catch (e) {
        console.error('[Webhook] Could not parse event body')
      }
      
      return NextResponse.json(
        { 
          error: 'Missing signature',
          message: 'X-Razorpay-Signature header is required. Please configure webhook secret in Razorpay dashboard.'
        },
        { status: 400 }
      )
    }

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex')

    if (signature !== expectedSignature) {
      console.error('[Webhook] Invalid webhook signature')
      console.error(`[Webhook] Expected: ${expectedSignature.substring(0, 20)}...`)
      console.error(`[Webhook] Received: ${signature.substring(0, 20)}...`)
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      )
    }

    console.log('[Webhook] Signature verified successfully')

    const event = JSON.parse(body)
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    console.log(`[Webhook] Received event: ${event.event}, Event ID: ${request.headers.get('x-razorpay-event-id')}`)

    // Handle different event types
    switch (event.event) {
      case 'payment.captured':
        await handlePaymentCaptured(event.payload, supabase, adminSupabase)
        break
      case 'payment.failed':
        await handlePaymentFailed(event.payload, supabase)
        break
      case 'order.paid':
        await handleOrderPaid(event.payload, supabase)
        break
      default:
        console.log(`[Webhook] Unhandled webhook event: ${event.event}`)
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

async function handlePaymentCaptured(payload: any, supabase: any, adminSupabase: any) {
  // Add null checks for payload structure
  if (!payload?.payment?.entity || !payload?.order?.entity) {
    console.error('[Webhook] Invalid payload structure for payment.captured:', payload)
    return
  }

  const payment = payload.payment.entity
  const order = payload.order.entity

  console.log(`[Webhook] Payment captured - Order ID: ${order.id}, Payment ID: ${payment.id}`)

  // Update payment status
  const { data: updatedPayment, error: updateError } = await supabase
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
    .select()
    .single()

  if (updateError) {
    console.error('[Webhook] Error updating payment:', updateError)
  }

  // Handle trial verification payments
  const notes = order.notes || {}
  if (notes.type === 'trial_verification') {
    console.log(`[Webhook] Trial verification payment captured for user: ${notes.user_id}, company: ${notes.company_id || 'none'}`)
    
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
    
    console.log(`[Webhook] Trial verification payment captured. Refund scheduled for: ${refundScheduledAt.toISOString()}`)
    
    // Create trial after payment verification (if payment record has user_id and company_id)
    if (updatedPayment && notes.user_id) {
      try {
        // If user has no companies, create user-level trial
        const { data: userCompanies } = await adminSupabase
          .from('companies')
          .select('id')
          .eq('user_id', notes.user_id)
          .limit(1)

        if (!userCompanies || userCompanies.length === 0) {
          console.log('[Webhook] User has no companies, creating user-level trial')
          const { data: trialData, error: trialError } = await adminSupabase
            .rpc('create_user_trial', { target_user_id: notes.user_id })

          if (trialError) {
            console.error('[Webhook] Error creating user trial:', trialError)
          } else {
            console.log('[Webhook] User-level trial created successfully')
          }
        } else if (notes.company_id) {
          // User has companies, create company-level trial
          console.log(`[Webhook] Creating company-level trial for company: ${notes.company_id}`)
          const { data: trialData, error: trialError } = await adminSupabase
            .rpc('create_company_trial', {
              p_user_id: notes.user_id,
              p_company_id: notes.company_id
            })

          if (trialError) {
            console.error('[Webhook] Error creating company trial:', trialError)
          } else {
            console.log('[Webhook] Company-level trial created successfully')
          }
        } else {
          // No company_id in notes, try to get from payment record
          if (updatedPayment.company_id) {
            console.log(`[Webhook] Creating company-level trial from payment record for company: ${updatedPayment.company_id}`)
            const { data: trialData, error: trialError } = await adminSupabase
              .rpc('create_company_trial', {
                p_user_id: notes.user_id,
                p_company_id: updatedPayment.company_id
              })

            if (trialError) {
              console.error('[Webhook] Error creating company trial from payment:', trialError)
            } else {
              console.log('[Webhook] Company-level trial created successfully from payment record')
            }
          }
        }
      } catch (trialErr) {
        console.error('[Webhook] Error creating trial:', trialErr)
        // Don't fail the webhook - payment is verified, trial can be created manually if needed
      }
    }
    
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
  // Add null checks for payload structure
  if (!payload?.payment?.entity) {
    console.error('[Webhook] Invalid payload structure for payment.failed:', payload)
    return
  }

  const payment = payload.payment.entity
  const order = payload.order?.entity

  console.log(`[Webhook] Payment failed - Order ID: ${order?.id || 'unknown'}, Payment ID: ${payment.id}, Error: ${payment.error_description || 'unknown'}`)

  const { error: updateError } = await supabase
    .from('payments')
    .update({
      razorpay_payment_id: payment.id,
      status: 'failed',
      error_code: payment.error_code,
      error_description: payment.error_description,
      updated_at: new Date().toISOString(),
    })
    .eq('razorpay_order_id', order?.id || payment.order_id || '')

  if (updateError) {
    console.error('[Webhook] Error updating failed payment:', updateError)
  }
}

async function handleOrderPaid(payload: any, supabase: any) {
  // Add null checks for payload structure
  if (!payload?.order?.entity) {
    console.error('[Webhook] Invalid payload structure for order.paid:', payload)
    return
  }

  const order = payload.order.entity

  console.log(`[Webhook] Order paid - Order ID: ${order.id}`)

  await supabase
    .from('payments')
    .update({
      status: 'completed',
      amount_paid: order.amount_paid ? order.amount_paid / 100 : null,
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
