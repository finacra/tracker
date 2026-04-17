// Supabase Edge Function to process trial verification refunds
// This function should be scheduled to run every hour via Supabase Cron
//
// Env required:
// - NEXT_PUBLIC_APP_URL or APP_URL (your Next.js app URL)

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
    const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') || Deno.env.get('APP_URL') || 'http://localhost:3000'

    if (!appUrl) {
      throw new Error('Missing required environment variable: NEXT_PUBLIC_APP_URL or APP_URL')
    }

    console.log('[PROCESS-TRIAL-REFUNDS] Starting refund processing...')

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
        ...refundResult,
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[process-trial-refunds] Unexpected error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
})
