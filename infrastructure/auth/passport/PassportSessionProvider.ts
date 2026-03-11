/**
 * Passport implementation of SessionProvider.
 * Resolves the current authenticated user from Passport session cookies.
 */

import type { SessionProvider, SessionUser } from '@/application/interfaces/SessionProvider'
import { getSession } from '@/lib/auth/passport-session'
import { createServerContainer } from '@/lib/composition/server-container'

export class PassportSessionProvider implements SessionProvider {
  async getSessionUser(): Promise<SessionUser | null> {
    const session = await getSession()

    if (!session) {
      return null
    }

    // Resolve full user details from app_users
    const { userRepository } = createServerContainer()
    const appUser = await userRepository.getById(session.appUserId)

    if (!appUser) {
      return null
    }

    return {
      id: appUser.id,
      email: appUser.email,
      fullName: appUser.fullName,
    }
  }
}
