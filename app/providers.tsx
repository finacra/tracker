'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { Session } from '@supabase/supabase-js'
import { trackLogin } from '@/lib/tracking/kpi-tracker'

export function Providers({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const supabase = createClient()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      // Track login if session exists
      if (session?.user?.id) {
        trackLogin(session.user.id)
      }
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      // Track login when session is established
      if (session?.user?.id && _event === 'SIGNED_IN') {
        trackLogin(session.user.id)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  return <>{children}</>
}
