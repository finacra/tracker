import type { AppNotification } from '@/domain/models/Notification'

export interface NotificationQueryOptions {
  unreadOnly?: boolean
  limit?: number
}

export interface CreateNotificationInput {
  company_id: string
  user_id: string
  app_user_id?: string | null
  type: string
  title: string
  message: string
  requirement_id: string | null
  metadata: Record<string, unknown> | null
  is_read: boolean
}

export interface NotificationRepository {
  getForUser(userId: string, options?: NotificationQueryOptions): Promise<AppNotification[]>
  countUnreadForUser(userId: string): Promise<number>
  markReadForUser(userId: string, notificationIds: string[]): Promise<void>
  markAllReadForUser(userId: string): Promise<void>
  createMany(notifications: CreateNotificationInput[]): Promise<void>
}
