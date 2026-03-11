'use client'

import { useMemo } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'

export function useAuth() {
  const auth = useAuthContext()
  const displayEmail = auth.appUser?.email || ''
  const displayName = auth.appUser?.fullName?.trim() || displayEmail.split('@')[0] || 'User'
  const displayInitials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || displayEmail[0]?.toUpperCase() || 'U'

  return useMemo(() => ({
    ...auth,
    displayEmail,
    displayName,
    displayInitials,
  }), [auth, displayEmail, displayName, displayInitials])
}
