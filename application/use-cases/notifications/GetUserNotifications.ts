import type {
  NotificationQueryOptions,
  NotificationRepository,
} from '@/application/interfaces/NotificationRepository'
import type { AppNotification } from '@/domain/models/Notification'

export class GetUserNotifications {
  constructor(private readonly notificationRepository: NotificationRepository) {}

  async execute(
    userId: string,
    options: NotificationQueryOptions = {}
  ): Promise<{ notifications: AppNotification[]; unreadCount: number }> {
    const [notifications, unreadCount] = await Promise.all([
      this.notificationRepository.getForUser(userId, options),
      this.notificationRepository.countUnreadForUser(userId),
    ])

    return {
      notifications,
      unreadCount,
    }
  }
}
