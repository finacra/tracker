import type { AppUser } from '@/domain/models/AppUser'

export interface AuthService {
  getCurrentUser(): Promise<AppUser | null>
  requireCurrentUser(): Promise<AppUser>
}
