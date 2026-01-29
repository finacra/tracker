'use client'

import { useState, useEffect } from 'react'
import { getUserRole } from '@/app/data-room/actions'

export function useUserRole(companyId: string | null) {
  const [role, setRole] = useState<'superadmin' | 'admin' | 'editor' | 'viewer' | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!companyId) {
      setRole(null)
      setLoading(false)
      return
    }

    async function fetchRole() {
      setLoading(true)
      setError(null)
      try {
        const result = await getUserRole(companyId)
        if (result.success && result.role) {
          setRole(result.role as 'superadmin' | 'admin' | 'editor' | 'viewer')
        } else {
          setError(result.error || 'Failed to fetch role')
          setRole('viewer') // Default to viewer
        }
      } catch (err: any) {
        console.error('Error fetching user role:', err)
        setError(err.message)
        setRole('viewer')
      } finally {
        setLoading(false)
      }
    }

    fetchRole()
  }, [companyId])

  const canEdit = role === 'editor' || role === 'admin' || role === 'superadmin'
  const canManage = role === 'admin' || role === 'superadmin'
  const isSuperadmin = role === 'superadmin'

  return {
    role,
    loading,
    error,
    canEdit,
    canManage,
    isSuperadmin
  }
}
