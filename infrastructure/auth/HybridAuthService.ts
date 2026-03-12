import type { AuthService } from '@/application/interfaces/AuthService'
import type { AppUser } from '@/domain/models/AppUser'

export class HybridAuthService implements AuthService {
  constructor(
    private readonly primary: AuthService,
    private readonly secondary: AuthService
  ) {}

  async getCurrentUser(): Promise<AppUser | null> {
    try {
      const user = await this.primary.getCurrentUser()
      if (user) return user
    } catch (error) {
      console.error('[HybridAuthService] Primary provider error:', error)
    }
    
    try {
      return await this.secondary.getCurrentUser()
    } catch (error) {
      console.error('[HybridAuthService] Secondary provider error:', error)
      return null
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
