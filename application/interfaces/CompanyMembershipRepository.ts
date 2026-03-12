import type { AppRole } from '@/domain/types/Role'

export interface CompanyMembership {
  id: string
  userId: string
  companyId: string | null
  role: AppRole
  createdAt: string
  updatedAt: string
}

export interface CompanyMembershipRepository {
  getAdminUserIds(companyId: string): Promise<string[]>
  getRoles(companyId?: string | null): Promise<CompanyMembership[]>
  getRolesByUserId(userId: string): Promise<CompanyMembership[]>
  getCompanyOwnerId(companyId: string): Promise<string | null>
  findRole(userId: string, companyId: string): Promise<CompanyMembership | null>
  isSuperadmin(userId: string): Promise<boolean>
  addRole(userId: string, companyId: string, role: Exclude<AppRole, 'superadmin'>, appUserId?: string | null): Promise<void>
  upsertRole(userId: string, companyId: string, role: Exclude<AppRole, 'superadmin'>, appUserId?: string | null): Promise<void>
  removeRole(roleId: string, companyId: string): Promise<void>
  updateRole(roleId: string, companyId: string, role: Exclude<AppRole, 'superadmin'>): Promise<void>
}
