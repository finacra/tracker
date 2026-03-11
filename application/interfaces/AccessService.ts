import type { AppRole } from '@/domain/types/Role'
import type { CompanyAccessSnapshot } from '@/domain/types/CompanyAccess'

export interface AccessService {
  isSuperadmin(userId: string): Promise<boolean>
  getRoleForCompany(userId: string, companyId: string): Promise<AppRole | null>
  canViewCompany(userId: string, companyId: string): Promise<boolean>
  getCompanyAccessSnapshot(userId: string, companyId: string): Promise<CompanyAccessSnapshot>
  getAccessibleCompanyIds(userId: string): Promise<string[]>
}
