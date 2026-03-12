import type { AuthService } from '@/application/interfaces/AuthService'
import type { AppUser } from '@/domain/models/AppUser'

export class HybridAuthService implements AuthService {
  constructor(
    private readonly primary: AuthService,
    private readonly secondary: AuthService
  ) {}

  async getCurrentUser(): Promise<AppUser | null> {
    const user = await this.primary.getCurrentUser()
    if (user) return user
    
    return this.secondary.getCurrentUser()
  }

  async requireCurrentUser(): Promise<AppUser> {
    const user = await this.getCurrentUser()
    if (!user) {
      throw new Error('Not authenticated')
    }
    return user
  }
}
