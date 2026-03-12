import type { AppUser } from '@/domain/models/AppUser'

export interface UserRepository {
  getById(userId: string): Promise<AppUser | null>
  findByEmail(email: string): Promise<AppUser | null>
  getByLegacyAuthIdentity(
    provider: AppUser['legacyAuthProvider'],
    legacyAuthId: string
  ): Promise<AppUser | null>
  listByIds(userIds: string[]): Promise<AppUser[]>
}
