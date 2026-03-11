import type {
  CreateNotificationInput,
  NotificationRepository,
} from '@/application/interfaces/NotificationRepository'

export class CreateNotifications {
  constructor(private readonly notificationRepository: NotificationRepository) {}

  execute(notifications: CreateNotificationInput[]): Promise<void> {
    return this.notificationRepository.createMany(notifications)
  }
}
