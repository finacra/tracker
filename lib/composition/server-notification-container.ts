import { PassportAuthService } from '@/infrastructure/auth/passport/PassportAuthService'
import { PrismaNotificationRepository } from '@/infrastructure/persistence/prisma/PrismaNotificationRepository'
import { PrismaUserRepository } from '@/infrastructure/persistence/prisma/PrismaUserRepository'

export function createServerNotificationContainer() {
  const userRepository = new PrismaUserRepository()

  return {
    authService: new PassportAuthService(userRepository),
    notificationRepository: new PrismaNotificationRepository(),
    userRepository,
  }
}
