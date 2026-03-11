'use client'

import { useMemo } from 'react'
import { useUserRoleQuery } from './useUserRoleQuery'

export function useUserRole(companyId: string | null, options: { enabled?: boolean, initialData?: any } = {}) {
  const { enabled = true, initialData } = options

  const { data: role, isLoading: loading, error } = useUserRoleQuery({
    companyId,
    enabled,
    initialData,
  })

  const canEdit = role === 'editor' || role === 'admin' || role === 'superadmin'
  const canManage = role === 'admin' || role === 'superadmin'
  const isSuperadmin = role === 'superadmin'

  return useMemo(() => ({
    role,
    setRole: () => {}, // Keep for backward compatibility, but React Query manages state
    loading,
    error: error ? (error as Error).message : null,
    canEdit,
    canManage,
    isSuperadmin
  }), [role, loading, error, canEdit, canManage, isSuperadmin])
}
