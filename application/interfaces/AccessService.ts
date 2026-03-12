import type { AppRole } from '@/domain/types/Role'
import type { CompanyAccessSnapshot } from '@/domain/types/CompanyAccess'

export interface AccessService {
  isSuperadmin(userId: string): Promise<boolean>
  getRoleForCompany(userId: string, companyId: string, isSuperadminCache?: boolean): Promise<AppRole | null>
  canViewCompany(userId: string, companyId: string, isSuperadminCache?: boolean): Promise<boolean>
  getCompanyAccessSnapshot(userId: string, companyId: string, isSuperadminCache?: boolean): Promise<CompanyAccessSnapshot>
  getAccessibleCompanyIds(userId: string, isSuperadminCache?: boolean): Promise<string[]>
}
