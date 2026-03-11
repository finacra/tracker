import { SupabaseAuthService } from '@/infrastructure/auth/supabase/SupabaseAuthService'
import { PrismaNotificationRepository } from '@/infrastructure/persistence/prisma/PrismaNotificationRepository'
import { SupabaseUserRepository } from '@/infrastructure/persistence/supabase/SupabaseUserRepository'

// Prisma Pilot: NotificationRepository is the first repository swapped to Prisma.
// To revert, replace PrismaNotificationRepository with SupabaseNotificationRepository.
// import { SupabaseNotificationRepository } from '@/infrastructure/persistence/supabase/SupabaseNotificationRepository'

export function createServerNotificationContainer() {
  const userRepository = new SupabaseUserRepository()

  return {
    authService: new SupabaseAuthService(userRepository),
    notificationRepository: new PrismaNotificationRepository(),
    userRepository,
  }
}
