import type { AuthService } from '@/application/interfaces/AuthService'
import type { UserRepository } from '@/application/interfaces/UserRepository'
import type { AppUser } from '@/domain/models/AppUser'
import { createClient } from '@/utils/supabase/server'

export class SupabaseAuthService implements AuthService {
  constructor(private readonly userRepository: UserRepository) {}

  async getCurrentUser(): Promise<AppUser | null> {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return null
    }

    const canonicalUser = await this.userRepository.getByLegacyAuthIdentity('supabase', user.id)
    if (canonicalUser) {
      return {
        ...canonicalUser,
        // Runtime compatibility: the rest of the app still joins against legacy auth ids
        // in companies, roles, subscriptions, and related access checks.
        id: user.id,
        canonicalId: canonicalUser.canonicalId,
        legacyAuthProvider: 'supabase',
        legacyAuthId: user.id,
      }
    }

    // Temporary compatibility fallback until every auth entry path writes app-owned identity rows.
    return {
      id: user.id,
      canonicalId: null,
      email: user.email ?? '',
      fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
      legacyAuthProvider: 'supabase',
      legacyAuthId: user.id,
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
