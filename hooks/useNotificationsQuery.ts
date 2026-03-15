'use client'

/**
 * React Query hooks for notifications.
 *
 * Replaces the manual useState + setInterval pattern in Header.tsx.
 *
 *  useNotificationsQuery   Fetches the notification list (panel-open mode).
 *  useUnreadCountQuery     Lightweight badge count (always-on, background poll).
 *  useMarkReadMutation     Marks one or many notifications as read.
 *  useMarkAllReadMutation  Marks every unread notification as read.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getNotifications,
  markNotificationsRead,
  markAllNotificationsRead,
  type Notification,
} from '@/app/actions/notifications'
import { queryKeys } from '@/lib/react-query/query-keys'
import { useAppStore } from '@/lib/store/appStore'

// ─── Query: full notification list ───────────────────────────────────────────

/**
 * Fetches the full notification list.
 * Only enabled when the panel is open (pass `enabled: showNotifications`).
 * Polls every 30 s while enabled to stay fresh.
 */
export function useNotificationsQuery(options: { enabled?: boolean; limit?: number } = {}) {
  const { enabled = true, limit } = options
  const setNotificationCount = useAppStore((s) => s.setNotificationCount)

  return useQuery({
    queryKey: [...queryKeys.notifications(), 'list', limit ?? 'all'],
    queryFn: async () => {
      const result = await getNotifications({ limit })
      if (!result.success) throw new Error(result.error || 'Failed to fetch notifications')
      // Keep the global badge in sync whenever we fetch the full list
      setNotificationCount(result.unreadCount ?? 0)
      return result.notifications as Notification[]
    },
    enabled,
    staleTime: 30 * 1000,       // treat data fresh for 30 s
    gcTime: 2 * 60 * 1000,
    refetchInterval: enabled ? 30 * 1000 : false, // poll every 30 s while panel is open
    refetchOnWindowFocus: true,
  })
}

// ─── Query: unread count only (badge) ────────────────────────────────────────

/**
 * Cheap badge-count query — fetches only unread notifications and returns the
 * count.  Runs in the background regardless of panel state.
 */
export function useUnreadCountQuery(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options
  const setNotificationCount = useAppStore((s) => s.setNotificationCount)

  return useQuery({
    queryKey: [...queryKeys.notifications(), 'unread-count'],
    queryFn: async () => {
      const result = await getNotifications({ unreadOnly: true, limit: 50 })
      if (!result.success) throw new Error(result.error || 'Failed to fetch unread count')
      const count = result.unreadCount ?? 0
      setNotificationCount(count)
      return count
    },
    enabled,
    staleTime: 60 * 1000,        // poll every minute
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,  // background poll every 60 s
    refetchOnWindowFocus: true,
  })
}

// ─── Mutation: mark one or more as read ──────────────────────────────────────

export function useMarkReadMutation() {
  const queryClient = useQueryClient()
  const setNotificationCount = useAppStore((s) => s.setNotificationCount)

  return useMutation({
    mutationFn: (ids: string | string[]) => markNotificationsRead(ids),
    onMutate: async (ids) => {
      // Optimistic update: mark notifications as read in cache immediately
      const idSet = new Set(Array.isArray(ids) ? ids : [ids])
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications() })

      const previous = queryClient.getQueriesData<Notification[]>({
        queryKey: queryKeys.notifications(),
      })

      queryClient.setQueriesData<Notification[]>(
        { queryKey: queryKeys.notifications() },
        (old) =>
          old?.map((n) =>
            idSet.has(n.id) ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
          )
      )

      return { previous }
    },
    onError: (_err, _ids, context) => {
      // Roll back on error
      context?.previous?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
    },
    onSettled: () => {
      // Re-sync with server
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications() })
    },
    onSuccess: () => {
      // Decrement badge — exact count will be corrected by next invalidation
      setNotificationCount(Math.max(0, useAppStore.getState().notificationCount - 1))
    },
  })
}

// ─── Mutation: mark all as read ──────────────────────────────────────────────

export function useMarkAllReadMutation() {
  const queryClient = useQueryClient()
  const clearNotificationCount = useAppStore((s) => s.clearNotificationCount)

  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications() })

      const previous = queryClient.getQueriesData<Notification[]>({
        queryKey: queryKeys.notifications(),
      })

      // Optimistically mark everything read
      queryClient.setQueriesData<Notification[]>(
        { queryKey: queryKeys.notifications() },
        (old) =>
          old?.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      )
      clearNotificationCount()

      return { previous }
    },
    onError: (_err, _vars, context) => {
      context?.previous?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications() })
    },
  })
}
