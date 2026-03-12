import type {
  CompanyMembership,
  CompanyMembershipRepository,
} from '@/application/interfaces/CompanyMembershipRepository'
import type { AppRole } from '@/domain/types/Role'
import { createAdminClient } from '@/utils/supabase/admin'

type MembershipRow = {
  id: string
  user_id: string
  company_id: string | null
  role: AppRole
  created_at: string
  updated_at: string
}

export class SupabaseCompanyMembershipRepository implements CompanyMembershipRepository {
  private mapRow(row: MembershipRow): CompanyMembership {
    return {
      id: row.id,
      userId: row.user_id,
      companyId: row.company_id,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  async getAdminUserIds(companyId: string): Promise<string[]> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('user_roles')
      .select('user_id')
      .eq('company_id', companyId)
      .in('role', ['admin', 'superadmin'])

    if (error) throw new Error(error.message)
    return (data ?? []).map((row: { user_id: string }) => row.user_id)
  }

  async getRoles(companyId?: string | null): Promise<CompanyMembership[]> {
    const adminSupabase: any = createAdminClient()
    let query = adminSupabase.from('user_roles').select('*')
    if (companyId) query = query.eq('company_id', companyId)
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []).map((row: MembershipRow) => this.mapRow(row))
  }

  async getRolesByUserId(userId: string): Promise<CompanyMembership[]> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('user_roles')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)
    return (data ?? []).map((row: MembershipRow) => this.mapRow(row))
  }

  async getCompanyOwnerId(companyId: string): Promise<string | null> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase.from('companies').select('user_id').eq('id', companyId).maybeSingle()
    if (error) throw new Error(error.message)
    return (data?.user_id as string | null) ?? null
  }

  async findRole(userId: string, companyId: string): Promise<CompanyMembership | null> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('user_roles')
      .select('*')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    return data ? this.mapRow(data as MembershipRow) : null
  }

  async addRole(userId: string, companyId: string, role: Exclude<AppRole, 'superadmin'>, appUserId?: string | null): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase.from('user_roles').insert({
      user_id: userId,
      app_user_id: appUserId || null,
      company_id: companyId,
      role,
    })
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
  }

  async upsertRole(userId: string, companyId: string, role: Exclude<AppRole, 'superadmin'>, appUserId?: string | null): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('user_roles')
      .upsert(
        {
          user_id: userId,
          app_user_id: appUserId || null,
          company_id: companyId,
          role,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,company_id' }
      )
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
  }

  async removeRole(roleId: string, companyId: string): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase.from('user_roles').delete().eq('id', roleId).eq('company_id', companyId)
    if (error) throw new Error(error.message)
  }

  async updateRole(roleId: string, companyId: string, role: Exclude<AppRole, 'superadmin'>): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase.from('user_roles').update({ role }).eq('id', roleId).eq('company_id', companyId)
    if (error) throw new Error(error.message)
  }
  
  async isSuperadmin(userId: string): Promise<boolean> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('user_roles')
      .select('id')
      .eq('app_user_id', userId)
      .is('company_id', null)
      .eq('role', 'superadmin')
      .limit(1)
      .maybeSingle()

    if (data) return true

    const { data: dataLegacy } = await adminSupabase
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .is('company_id', null)
      .eq('role', 'superadmin')
      .limit(1)
      .maybeSingle()

    return !!dataLegacy
  }
}
