import { NextRequest, NextResponse } from 'next/server'
import { createServerContainer } from '@/lib/composition/server-container'
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
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      )
    }

    console.log('[Webhook] Signature verified successfully')

    const event = JSON.parse(body)
    const { companyRepository, paymentRepository, subscriptionRepository } = createServerContainer()

    console.log(`[Webhook] Received event: ${event.event}, Event ID: ${request.headers.get('x-razorpay-event-id')}`)

    // Handle different event types
    switch (event.event) {
      case 'payment.captured':
        await handlePaymentCaptured(event.payload, paymentRepository, subscriptionRepository, companyRepository)
        break
      case 'payment.failed':
        await handlePaymentFailed(event.payload, paymentRepository)
        break
      case 'order.paid':
        await handleOrderPaid(event.payload, paymentRepository)
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

async function handlePaymentCaptured(
  payload: any,
  paymentRepository: ReturnType<typeof createServerContainer>['paymentRepository'],
  subscriptionRepository: ReturnType<typeof createServerContainer>['subscriptionRepository'],
  companyRepository: ReturnType<typeof createServerContainer>['companyRepository']
) {
  // Add null checks for payload structure
  if (!payload?.payment?.entity || !payload?.order?.entity) {
    console.error('[Webhook] Invalid payload structure for payment.captured:', payload)
    return
  }

  const payment = payload.payment.entity
  const order = payload.order.entity
  const existingPayment = await paymentRepository.findByProviderOrderId(order.id)

  console.log(`[Webhook] Payment captured - Order ID: ${order.id}, Payment ID: ${payment.id}`)

  // Update payment status
  if (existingPayment) {
    try {
      await paymentRepository.markCompleted(existingPayment.id, {
        providerPaymentId: payment.id,
        providerSignature: '',
        paymentProvider: 'razorpay',
        amountPaid: payment.amount / 100,
        paidAt: new Date(payment.created_at * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      })
    } catch (updateError) {
      console.error('[Webhook] Error updating payment:', updateError)
    }
  } else {
    console.error('[Webhook] Payment record not found for captured order:', order.id)
  }

  // Handle trial verification payments
  const notes = order.notes || {}
  if (notes.type === 'trial_verification') {
    console.log(`[Webhook] Trial verification payment captured for user: ${notes.user_id}, company: ${notes.company_id || 'none'}`)

    // Schedule refund for 24 hours later
    const refundScheduledAt = new Date()
    refundScheduledAt.setHours(refundScheduledAt.getHours() + 24)

    await paymentRepository.updateByProviderOrderId(order.id, {
      refundScheduledAt: refundScheduledAt.toISOString(),
      refundStatus: 'scheduled',
      updatedAt: new Date().toISOString(),
    })

    console.log(`[Webhook] Trial verification payment captured. Refund scheduled for: ${refundScheduledAt.toISOString()}`)

    // Create trial after payment verification (if payment record has user_id and company_id)
    if (existingPayment && notes.user_id) {
      try {
        // If user has no companies, create user-level trial
        const userCompanies = await companyRepository.listOwnedByUser(notes.user_id)

        if (userCompanies.length === 0) {
          console.log('[Webhook] User has no companies, creating user-level trial')
          await subscriptionRepository.createUserTrial(notes.user_id, existingPayment.appUserId)
          console.log('[Webhook] User-level trial created successfully')
        } else if (notes.company_id) {
          // User has companies, create company-level trial
          console.log(`[Webhook] Creating company-level trial for company: ${notes.company_id}`)
          await subscriptionRepository.createCompanyTrial(notes.user_id, notes.company_id, existingPayment.appUserId)
          console.log('[Webhook] Company-level trial created successfully')
        } else {
          // No company_id in notes, try to get from payment record
          if (existingPayment.companyId) {
            console.log(`[Webhook] Creating company-level trial from payment record for company: ${existingPayment.companyId}`)
            await subscriptionRepository.createCompanyTrial(notes.user_id, existingPayment.companyId, existingPayment.appUserId)
            console.log('[Webhook] Company-level trial created successfully from payment record')
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
    const startDate = new Date()
    const endDate = new Date(startDate)

    switch (notes.billing_cycle) {
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

    await subscriptionRepository.activatePaidSubscription({
      userId: notes.user_id,
      companyId: notes.company_id || null,
      tier: notes.tier,
      billingCycle: notes.billing_cycle,
      amount: payment.amount / 100,
      currency: payment.currency || 'INR',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    })
  }
}

async function handlePaymentFailed(
  payload: any,
  paymentRepository: ReturnType<typeof createServerContainer>['paymentRepository']
) {
  // Add null checks for payload structure
  if (!payload?.payment?.entity) {
    console.error('[Webhook] Invalid payload structure for payment.failed:', payload)
    return
  }

  const payment = payload.payment.entity
  const order = payload.order?.entity

  console.log(`[Webhook] Payment failed - Order ID: ${order?.id || 'unknown'}, Payment ID: ${payment.id}, Error: ${payment.error_description || 'unknown'}`)

  try {
    await paymentRepository.updateByProviderOrderId(order?.id || payment.order_id || '', {
      providerPaymentId: payment.id,
      paymentProvider: 'razorpay',
      status: 'failed',
      errorCode: payment.error_code,
      errorDescription: payment.error_description,
      updatedAt: new Date().toISOString(),
    })
  } catch (updateError) {
    console.error('[Webhook] Error updating failed payment:', updateError)
  }
}

async function handleOrderPaid(
  payload: any,
  paymentRepository: ReturnType<typeof createServerContainer>['paymentRepository']
) {
  // Add null checks for payload structure
  if (!payload?.order?.entity) {
    console.error('[Webhook] Invalid payload structure for order.paid:', payload)
    return
  }

  const order = payload.order.entity

  console.log(`[Webhook] Order paid - Order ID: ${order.id}`)

  await paymentRepository.updateByProviderOrderId(order.id, {
    status: 'completed',
    amountPaid: order.amount_paid ? order.amount_paid / 100 : null,
    updatedAt: new Date().toISOString(),
  })
}

