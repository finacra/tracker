import { PrismaUserRepository } from '@/infrastructure/persistence/prisma/PrismaUserRepository'

export function createServerUserContainer() {
  return {
    userRepository: new PrismaUserRepository(),
  }
}
