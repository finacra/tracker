'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { Session } from '@supabase/supabase-js'

export function Providers({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const supabase = createClient()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  return <>{children}</>
}
