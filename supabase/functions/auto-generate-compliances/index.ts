// Supabase Edge Function to auto-generate recurring compliances
// This function should be scheduled to run daily via Supabase cron
//
// Env required:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    // Create Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log('[auto-generate-compliances] Starting auto-generation of recurring compliances...')

    // Call the auto_generate_recurring_compliances function
    // Parameters: min_months_ahead (6), generate_months_ahead (12)
    const { data, error } = await supabase.rpc('auto_generate_recurring_compliances', {
      p_min_months_ahead: 6,
      p_generate_months_ahead: 12
    })

    if (error) {
      console.error('[auto-generate-compliances] Error generating recurring compliances:', error)
      throw error
    }

    const results = data || []
    const totalGenerated = results.reduce((sum: number, row: any) => sum + (row.periods_generated || 0), 0)
    const companiesProcessed = results.length

    console.log(`[auto-generate-compliances] Completed: Generated ${totalGenerated} periods for ${companiesProcessed} companies`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Generated ${totalGenerated} future compliance periods for ${companiesProcessed} companies`,
        details: results,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: any) {
    console.error('[auto-generate-compliances] Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred',
        timestamp: new Date().toISOString()
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
