import { SupabaseUserRepository } from '@/infrastructure/persistence/supabase/SupabaseUserRepository'

export function createServerUserContainer() {
  return {
    userRepository: new SupabaseUserRepository(),
  }
}
