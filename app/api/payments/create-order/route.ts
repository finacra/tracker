import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createServerContainer } from '@/lib/composition/server-container'
import { getRazorpayInstance } from '@/lib/razorpay/client'
import { calculatePricing, getTierById, type BillingCycle, type PricingTier } from '@/lib/pricing/tiers'
import { resolveDiscountCode } from '@/lib/pricing/discount-codes'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limiter'
import { handleAPIError } from '@/lib/errors/handle-error'

export async function POST(request: NextRequest) {
  // Rate limit: 10 order creation attempts per IP per 15 minutes
  const ip = getClientIp(request)
  const { allowed, retryAfterMs } = checkRateLimit(`create-order:${ip}`, 10, 15 * 60 * 1000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
    )
  }

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
    const { tier, billingCycle, companyId, discountCode } = body

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
    const computedAmountInPaise = Math.round(pricing.price * 100) // Convert to paise

    // Server-side discount-code resolution. The client may pass a
    // `discountCode` in the body; we ignore anything we don't
    // explicitly recognize in the server-side registry. Never trust
    // a client-supplied price — only the registry decides the
    // override. The applied code is stamped onto the Razorpay order
    // notes and the Payment row's audit notes so finance can
    // reconcile heavily-discounted orders without scanning logs.
    const matchedDiscount = resolveDiscountCode(typeof discountCode === 'string' ? discountCode : null)
    const amountInPaise = matchedDiscount?.overrideAmountPaise ?? computedAmountInPaise
    const finalAmountRupees = amountInPaise / 100
    if (matchedDiscount) {
      console.log(
        `[create-order] discount code applied: ${matchedDiscount.code} ` +
        `(${tier}/${billingCycle}: ₹${pricing.price} → ₹${finalAmountRupees})`,
      )
    }

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
        // Keep the ORIGINAL (un-discounted) tier price for audit
        // history. The actual charged amount is order.amount in
        // paise above. Finance can compare these to reconcile any
        // discounted order without scanning server logs.
        amount_rupees: pricing.price.toString(),
        final_amount_rupees: finalAmountRupees.toString(),
        ...(matchedDiscount
          ? { discount_code: matchedDiscount.code }
          : {}),
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
        // Record what the user actually paid (post-discount), not the
        // sticker tier price. Finance can recover the original via
        // notes.amount_rupees if needed.
        amount: finalAmountRupees,
        currency: pricing.currency || 'INR',
        tier: tier as PricingTier,
        billingCycle: billingCycle as BillingCycle,
        receipt: order.receipt ?? null,
        notes: (order.notes as Record<string, string> | undefined) ?? null,
      })
    } catch (paymentError) {
      console.error('Error storing payment:', paymentError)
      // Continue anyway - order is created in Razorpay
      // But log the error for debugging
    }

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
