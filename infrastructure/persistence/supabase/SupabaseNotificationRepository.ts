import type {
  CreateNotificationInput,
  NotificationQueryOptions,
  NotificationRepository,
} from '@/application/interfaces/NotificationRepository'
import type { AppNotification } from '@/domain/models/Notification'
import { createAdminClient } from '@/utils/supabase/admin'

export class SupabaseNotificationRepository implements NotificationRepository {
  async getForUser(
    userId: string,
    options: NotificationQueryOptions = {}
  ): Promise<AppNotification[]> {
    const adminSupabase: any = createAdminClient()

    let query = adminSupabase
      .from('company_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (options.unreadOnly) {
      query = query.eq('is_read', false)
    }

    if (options.limit) {
      query = query.limit(options.limit)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    return (data ?? []) as AppNotification[]
  }

  async countUnreadForUser(userId: string): Promise<number> {
    const adminSupabase: any = createAdminClient()
    const { count, error } = await adminSupabase
      .from('company_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    if (error) {
      throw new Error(error.message)
    }

    return count ?? 0
  }

  async markReadForUser(userId: string, notificationIds: string[]): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('company_notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .in('id', notificationIds)

    if (error) {
      throw new Error(error.message)
    }
  }

  async markAllReadForUser(userId: string): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('company_notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('is_read', false)

    if (error) {
      throw new Error(error.message)
    }
  }

  async createMany(notifications: CreateNotificationInput[]): Promise<void> {
    if (notifications.length === 0) {
      return
    }

    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('company_notifications')
      .insert(
        notifications.map((notification: CreateNotificationInput) => ({
          ...notification,
          app_user_id: notification.app_user_id || null, // Ensure explicit null
          metadata: notification.metadata ? JSON.stringify(notification.metadata) : null,
        }))
      )

    if (error) {
      throw new Error(error.message)
    }
  }
}
