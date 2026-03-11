import type { NotificationRepository } from '@/application/interfaces/NotificationRepository'

export class MarkUserNotificationsRead {
  constructor(private readonly notificationRepository: NotificationRepository) {}

  execute(userId: string, notificationIds: string[]): Promise<void> {
    return this.notificationRepository.markReadForUser(userId, notificationIds)
  }
}
