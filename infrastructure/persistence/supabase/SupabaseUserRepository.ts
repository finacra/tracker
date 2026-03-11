import type { UserRepository } from '@/application/interfaces/UserRepository'
import type { AppUser } from '@/domain/models/AppUser'
import { createAdminClient } from '@/utils/supabase/admin'

type AppUserRow = {
  id: string
  primary_email: string
  full_name: string | null
}

type IdentityRow = {
  legacy_auth_id: string | null
  provider: AppUser['legacyAuthProvider']
  app_users: AppUserRow | AppUserRow[] | null
}

export class SupabaseUserRepository implements UserRepository {
  private mapCanonicalUser(
    row: AppUserRow,
    provider: AppUser['legacyAuthProvider'],
    legacyAuthId: string | null
  ): AppUser {
    return {
      id: row.id,
      canonicalId: row.id,
      email: row.primary_email,
      fullName: row.full_name,
      legacyAuthProvider: provider,
      legacyAuthId,
    }
  }

  private mapIdentityRow(data: IdentityRow): AppUser | null {
    if (!data?.app_users) {
      return null
    }

    const appUser = Array.isArray(data.app_users) ? data.app_users[0] : data.app_users
    if (!appUser) {
      return null
    }

    return this.mapCanonicalUser(
      appUser,
      data.provider,
      (data.legacy_auth_id as string | null) ?? null
    )
  }

  private async getByCanonicalId(appUserId: string): Promise<AppUser | null> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('app_users')
      .select('id, primary_email, full_name')
      .eq('id', appUserId)
      .maybeSingle()

    if (error || !data) {
      return null
    }

    return this.mapCanonicalUser(data as AppUserRow, 'supabase', null)
  }

  async getById(userId: string): Promise<AppUser | null> {
    const byLegacyIdentity = await this.getByLegacyAuthIdentity('supabase', userId)
    if (byLegacyIdentity) {
      return byLegacyIdentity
    }

    return this.getByCanonicalId(userId)
  }

  async findByEmail(email: string): Promise<AppUser | null> {
    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      return null
    }

    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('auth_identities')
      .select('legacy_auth_id, provider, app_users!inner(id, primary_email, full_name)')
      .eq('provider', 'supabase')
      .ilike('email', normalizedEmail)
      .limit(1)
      .maybeSingle()

    if (error || !data) {
      return null
    }

    return this.mapIdentityRow(data as IdentityRow)
  }

  async getByLegacyAuthIdentity(
    provider: AppUser['legacyAuthProvider'],
    legacyAuthId: string
  ): Promise<AppUser | null> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('auth_identities')
      .select('legacy_auth_id, provider, app_users!inner(id, primary_email, full_name)')
      .eq('provider', provider)
      .eq('legacy_auth_id', legacyAuthId)
      .limit(1)
      .maybeSingle()

    if (error || !data) {
      return null
    }

    return this.mapIdentityRow({
      ...(data as IdentityRow),
      provider,
      legacy_auth_id: (data.legacy_auth_id as string | null) ?? legacyAuthId,
    })
  }
}
