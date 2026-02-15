import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  console.log('[ADMIN CLIENT] Creating admin client - SERVER SIDE:', {
    hasUrl: !!supabaseUrl,
    hasServiceKey: !!supabaseServiceKey,
    serviceKeyPrefix: supabaseServiceKey ? supabaseServiceKey.substring(0, 10) + '...' : 'missing',
  })

  if (!supabaseUrl || !supabaseServiceKey) {
    const missing = []
    if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL')
    if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
    throw new Error(`Missing Supabase admin environment variables: ${missing.join(', ')}`)
  }

  const client = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: { 
        'x-my-custom-header': 'finacra-admin',
        'apikey': supabaseServiceKey // Explicitly set service role key as apikey
      }
    }
  })

  console.log('[ADMIN CLIENT] Client created with service role key length:', supabaseServiceKey.length)
  console.log('[ADMIN CLIENT] Admin client created successfully - SERVER SIDE')
  return client
}
