/**
 * Passport implementation of AuthService.
 * Resolves current user from Passport session.
 */

import type { AuthService } from '@/application/interfaces/AuthService'
import type { UserRepository } from '@/application/interfaces/UserRepository'
import type { AppUser } from '@/domain/models/AppUser'
import { getSession } from '@/lib/auth/passport-session'

export class PassportAuthService implements AuthService {
  constructor(private readonly userRepository: UserRepository) {}

  async getCurrentUser(): Promise<AppUser | null> {
    const session = await getSession()

    if (!session) {
      return null
    }

    // Resolve canonical user from app_users
    const canonicalUser = await this.userRepository.getById(session.appUserId)

    if (!canonicalUser) {
      return null
    }

    // Return AppUser with Passport provider info
    return {
      ...canonicalUser,
      id: session.appUserId, // Use canonical ID
      canonicalId: canonicalUser.id,
      legacyAuthProvider: 'passport',
      legacyAuthId: session.googleId,
    }
  }

  async requireCurrentUser(): Promise<AppUser> {
    const user = await this.getCurrentUser()

    if (!user) {
      throw new Error('Not authenticated')
    }

    return user
  }
}
