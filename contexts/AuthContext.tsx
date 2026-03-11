'use client'

import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { AppUser } from '@/domain/models/AppUser'

export interface AuthContextValue {
  user: AppUser | null // Canonical user profile (replaces legacy Supabase user)
  appUser: AppUser | null // Primary app-owned user profile
  loading: boolean
  signOut: () => Promise<void>
  session: null // Retired in favor of canonical AppUser
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: AuthContextValue
}) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
