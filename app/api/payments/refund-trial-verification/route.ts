import { NextRequest, NextResponse } from 'next/server'
import { getRazorpayInstance } from '@/lib/razorpay/client'
import { createServerContainer } from '@/lib/composition/server-container'
import { handleAPIError } from '@/lib/errors/handle-error'

/**
 * API endpoint to process refunds for trial verification payments
 * This should be called by a scheduled job (cron) every hour
 * to check for payments that need to be refunded.
 *
 * Requires the Authorization header: Bearer <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[refund-trial-verification] CRON_SECRET env var is not set')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { paymentRepository } = createServerContainer()

    // Get all trial verification payments that are scheduled for refund
    // and the scheduled time has passed
    const now = new Date().toISOString()
    let paymentsToRefund
    try {
      paymentsToRefund = await paymentRepository.findScheduledTrialVerificationRefunds(now)
    } catch (fetchError) {
      console.error('Error fetching payments to refund:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch payments' },
        { status: 500 }
      )
    }

    if (!paymentsToRefund || paymentsToRefund.length === 0) {
      return NextResponse.json({
        message: 'No payments to refund',
        refunded: 0,
      })
    }

    const razorpay = getRazorpayInstance()
    let refundedCount = 0
    const errors: string[] = []

    // Process refunds
    for (const payment of paymentsToRefund) {
      try {
        if (!payment.providerPaymentId) {
          console.error(`Payment ${payment.id} missing provider_payment_id`)
          continue
        }

        // Create refund in Razorpay
        const refund = await razorpay.payments.refund(payment.providerPaymentId, {
          amount: payment.amount * 100, // Convert to paise
          notes: {
            reason: 'Trial verification refund - 24 hours after payment',
            payment_id: payment.id,
          },
        })

        // Update payment record
        await paymentRepository.updateById(payment.id, {
          providerRefundId: refund.id,
          refundStatus: 'completed',
          refundedAt: new Date().toISOString(),
          refundAmount: payment.amount,
          updatedAt: new Date().toISOString(),
        })

        refundedCount++
        console.log(`Refunded trial verification payment: ${payment.id}, Refund ID: ${refund.id}`)
      } catch (error) {
        console.error(`Error refunding payment ${payment.id}:`, error)
        const message = error instanceof Error ? error.message : String(error)
        errors.push(`Payment ${payment.id}: ${message}`)

        // Mark as failed if it's a permanent error
        const statusCode = (error as any)?.statusCode
        if (statusCode === 400 || statusCode === 404) {
          await paymentRepository.updateById(payment.id, {
            refundStatus: 'failed',
            refundError: message,
            updatedAt: new Date().toISOString(),
          })
        }
      }
    }

    return NextResponse.json({
      message: `Processed ${paymentsToRefund.length} payments`,
      refunded: refundedCount,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    return handleAPIError(error)
  }
}
