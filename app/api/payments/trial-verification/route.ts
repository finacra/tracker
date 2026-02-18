import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getRazorpayInstance } from '@/lib/razorpay/client'

// Trial verification amount: ₹2 (200 paise)
const TRIAL_VERIFICATION_AMOUNT = 200

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
    const { companyId, tier } = body

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
      amount: TRIAL_VERIFICATION_AMOUNT,
      currency: 'INR',
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
    const { data: paymentData, error: paymentError } = await supabase
      .from('payments')
      .insert({
        user_id: user.id,
        company_id: companyId || null,
        razorpay_order_id: order.id,
        amount: 2, // ₹2
        currency: 'INR',
        status: 'pending',
        tier: tier || null,
        billing_cycle: null,
        receipt: order.receipt,
        notes: order.notes as any,
        payment_type: 'trial_verification', // Mark as trial verification
      })
      .select()
      .single()

    if (paymentError) {
      console.error('[Trial Verification] Error storing payment:', paymentError)
      console.error('[Trial Verification] Payment data:', {
        user_id: user.id,
        company_id: companyId || null,
        razorpay_order_id: order.id,
        amount: 2,
        currency: 'INR',
        status: 'pending',
        tier: tier || null,
        billing_cycle: null,
        receipt: order.receipt,
        payment_type: 'trial_verification',
      })
      // Don't continue - we need the payment record for verification
      return NextResponse.json(
        { 
          error: `Failed to store payment record: ${paymentError.message}`,
          details: paymentError
        },
        { status: 500 }
      )
    }

    console.log('[Trial Verification] Payment record created:', paymentData?.id)

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    })
  } catch (error: any) {
    console.error('Error creating trial verification order:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Failed to create verification order',
      },
      { status: 500 }
    )
  }
}
