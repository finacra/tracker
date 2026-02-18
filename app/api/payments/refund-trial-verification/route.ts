import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getRazorpayInstance } from '@/lib/razorpay/client'

/**
 * API endpoint to process refunds for trial verification payments
 * This should be called by a scheduled job (cron) every hour
 * to check for payments that need to be refunded
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get all trial verification payments that are scheduled for refund
    // and the scheduled time has passed
    const now = new Date().toISOString()
    const { data: paymentsToRefund, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('payment_type', 'trial_verification')
      .eq('status', 'completed')
      .eq('refund_status', 'scheduled')
      .lte('refund_scheduled_at', now)
      .is('razorpay_refund_id', null)

    if (fetchError) {
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
        if (!payment.razorpay_payment_id) {
          console.error(`Payment ${payment.id} missing razorpay_payment_id`)
          continue
        }

        // Create refund in Razorpay
        const refund = await razorpay.payments.refund(payment.razorpay_payment_id, {
          amount: payment.amount * 100, // Convert to paise
          notes: {
            reason: 'Trial verification refund - 24 hours after payment',
            payment_id: payment.id,
          },
        })

        // Update payment record
        await supabase
          .from('payments')
          .update({
            razorpay_refund_id: refund.id,
            refund_status: 'completed',
            refunded_at: new Date().toISOString(),
            refund_amount: payment.amount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', payment.id)

        refundedCount++
        console.log(`Refunded trial verification payment: ${payment.id}, Refund ID: ${refund.id}`)
      } catch (error: any) {
        console.error(`Error refunding payment ${payment.id}:`, error)
        errors.push(`Payment ${payment.id}: ${error.message}`)
        
        // Mark as failed if it's a permanent error
        if (error.statusCode === 400 || error.statusCode === 404) {
          await supabase
            .from('payments')
            .update({
              refund_status: 'failed',
              refund_error: error.message,
              updated_at: new Date().toISOString(),
            })
            .eq('id', payment.id)
        }
      }
    }

    return NextResponse.json({
      message: `Processed ${paymentsToRefund.length} payments`,
      refunded: refundedCount,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Error processing refunds:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process refunds' },
      { status: 500 }
    )
  }
}
