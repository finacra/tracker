'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { Session, User } from '@supabase/supabase-js'
import { trackLogin } from '@/lib/tracking/kpi-tracker'
import { AuthProvider } from '@/contexts/AuthContext'

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])
  const trackedLoginUserIdRef = useRef<string | null>(null)

  const trackLoginOnce = (nextUser: User | null, event?: string) => {
    if (!nextUser?.id) return
    if (trackedLoginUserIdRef.current === nextUser.id) return

    if (!event || event === 'SIGNED_IN') {
      trackedLoginUserIdRef.current = nextUser.id
      trackLogin(nextUser.id)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      trackLoginOnce(session?.user ?? null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      if (!session?.user) {
        trackedLoginUserIdRef.current = null
      }
      trackLoginOnce(session?.user ?? null, _event)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const signOut = async () => {
    trackedLoginUserIdRef.current = null
    await supabase.auth.signOut()
  }

  return (
    <AuthProvider
      value={{
        user,
        session,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthProvider>
  )
}
