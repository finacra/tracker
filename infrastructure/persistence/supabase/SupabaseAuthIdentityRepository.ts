import type {
  AuthIdentityRecord,
  AuthIdentityRepository,
} from '@/application/interfaces/AuthIdentityRepository'
import { createAdminClient } from '@/utils/supabase/admin'

export class SupabaseAuthIdentityRepository implements AuthIdentityRepository {
  async findByLegacyAuthId(
    provider: string,
    legacyAuthId: string
  ): Promise<AuthIdentityRecord | null> {
    const admin: any = createAdminClient()
    const { data, error } = await admin
      .from('auth_identities')
      .select('*')
      .eq('provider', provider)
      .eq('legacy_auth_id', legacyAuthId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return null

    return this.mapRow(data)
  }

  async findByAppUserId(appUserId: string): Promise<AuthIdentityRecord[]> {
    const admin: any = createAdminClient()
    const { data, error } = await admin
      .from('auth_identities')
      .select('*')
      .eq('app_user_id', appUserId)
      .order('is_primary', { ascending: false })

    if (error) throw new Error(error.message)
    return (data ?? []).map((row: any) => this.mapRow(row))
  }

  async findPrimaryForAppUser(appUserId: string): Promise<AuthIdentityRecord | null> {
    const admin: any = createAdminClient()
    const { data, error } = await admin
      .from('auth_identities')
      .select('*')
      .eq('app_user_id', appUserId)
      .eq('is_primary', true)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return null
    return this.mapRow(data)
  }

  async create(
    input: Omit<AuthIdentityRecord, 'id' | 'createdAt'>
  ): Promise<AuthIdentityRecord> {
    const admin: any = createAdminClient()
    const { data, error } = await admin
      .from('auth_identities')
      .insert({
        app_user_id: input.appUserId,
        provider: input.provider,
        legacy_auth_id: input.legacyAuthId,
        email: input.email,
        is_primary: input.isPrimary,
        metadata: input.metadata ?? {},
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return this.mapRow(data)
  }

  private mapRow(row: any): AuthIdentityRecord {
    return {
      id: row.id,
      appUserId: row.app_user_id,
      provider: row.provider,
      legacyAuthId: row.legacy_auth_id ?? null,
      email: row.email ?? null,
      isPrimary: row.is_primary ?? false,
      metadata: typeof row.metadata === 'object' ? row.metadata : {},
      createdAt: row.created_at,
    }
  }
}
