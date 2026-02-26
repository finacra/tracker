// Supabase Edge Function to process trial verification refunds
// This function should be scheduled to run every hour via Supabase Cron
//
// Env required:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - NEXT_PUBLIC_APP_URL or APP_URL (your Next.js app URL)

import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') || Deno.env.get('APP_URL') || 'http://localhost:3000'

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    // Create Supabase client with service role key for admin access
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log('[PROCESS-TRIAL-REFUNDS] Starting refund processing...')

    // Get all trial verification payments that are scheduled for refund
    const now = new Date().toISOString()
    const { data: paymentsToRefund, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('payment_type', 'trial_verification')
      .eq('status', 'completed')
      .eq('refund_status', 'scheduled')
      .lte('refund_scheduled_at', now)
      .is('provider_refund_id', null)

    if (fetchError) {
      console.error('[process-trial-refunds] Error fetching payments:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch payments', details: fetchError.message }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    if (!paymentsToRefund || paymentsToRefund.length === 0) {
      console.log('[process-trial-refunds] No payments to refund')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No payments to refund',
          refunded: 0,
          timestamp: new Date().toISOString()
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    console.log(`[process-trial-refunds] Found ${paymentsToRefund.length} payments to refund`)

    // Call the refund API endpoint
    // Note: We're calling our own API endpoint which has the Razorpay client setup
    const refundApiUrl = `${appUrl}/api/payments/refund-trial-verification`

    console.log(`[process-trial-refunds] Calling refund API: ${refundApiUrl}`)

    const refundResponse = await fetch(refundApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add authorization if your API requires it
        // 'Authorization': `Bearer ${supabaseServiceKey}`,
      },
    })

    if (!refundResponse.ok) {
      const errorText = await refundResponse.text()
      console.error('[process-trial-refunds] Refund API error:', errorText)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to process refunds',
          details: errorText,
          paymentsFound: paymentsToRefund.length,
          timestamp: new Date().toISOString()
        }),
        {
          status: refundResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const refundResult = await refundResponse.json()
    console.log('[process-trial-refunds] Refund processing result:', refundResult)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${paymentsToRefund.length} payments`,
        ...refundResult,
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (error: any) {
    console.error('[process-trial-refunds] Unexpected error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
})
