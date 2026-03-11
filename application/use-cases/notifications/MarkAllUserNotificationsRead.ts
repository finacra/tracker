import type { NotificationRepository } from '@/application/interfaces/NotificationRepository'

export class MarkAllUserNotificationsRead {
  constructor(private readonly notificationRepository: NotificationRepository) {}

  execute(userId: string): Promise<void> {
    return this.notificationRepository.markAllReadForUser(userId)
  }
}
