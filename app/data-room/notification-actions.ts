'use server'

import { createServerNotificationContainer } from '@/lib/composition/server-notification-container'
import { GetUserNotifications } from '@/application/use-cases/notifications/GetUserNotifications'
import { MarkUserNotificationsRead } from '@/application/use-cases/notifications/MarkUserNotificationsRead'
import { MarkAllUserNotificationsRead } from '@/application/use-cases/notifications/MarkAllUserNotificationsRead'
import type { AppNotification } from '@/domain/models/Notification'
import { createServerContainer } from '@/lib/composition/server-container'

export type Notification = AppNotification

async function getCurrentUserOrNull() {
  const { authService } = createServerContainer()
  return authService.getCurrentUser()
}

/**
 * Get notifications for current user
 */
export async function getNotifications(
  options: { unreadOnly?: boolean; limit?: number } = {}
): Promise<{ success: boolean; notifications?: Notification[]; unreadCount?: number; error?: string }> {
  try {
    const { authService, notificationRepository } = createServerNotificationContainer()
    const user = await authService.requireCurrentUser()
    const useCase = new GetUserNotifications(notificationRepository)
    const result = await useCase.execute(user.id, options)

    return {
      success: true,
      notifications: result.notifications as Notification[],
      unreadCount: result.unreadCount,
    }
  } catch (error: any) {
    console.error('Error in getNotifications:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Mark notification(s) as read
 */
export async function markNotificationsRead(
  notificationIds: string | string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const ids = Array.isArray(notificationIds) ? notificationIds : [notificationIds]
    const { notificationRepository } = createServerNotificationContainer()
    const useCase = new MarkUserNotificationsRead(notificationRepository)

    await useCase.execute(user.id, ids)

    return { success: true }
  } catch (error: any) {
    console.error('Error in markNotificationsRead:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Mark all notifications as read for current user
 */
export async function markAllNotificationsRead(): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUserOrNull()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const { notificationRepository } = createServerNotificationContainer()
    const useCase = new MarkAllUserNotificationsRead(notificationRepository)
    await useCase.execute(user.id)

    return { success: true }
  } catch (error: any) {
    console.error('Error in markAllNotificationsRead:', error)
    return { success: false, error: error.message }
  }
}
