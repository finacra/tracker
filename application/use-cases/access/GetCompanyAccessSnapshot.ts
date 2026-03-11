import type { AccessService } from '@/application/interfaces/AccessService'
import type { CompanyAccessSnapshot } from '@/domain/types/CompanyAccess'

export class GetCompanyAccessSnapshot {
  constructor(private readonly accessService: AccessService) {}

  execute(userId: string, companyId: string): Promise<CompanyAccessSnapshot> {
    return this.accessService.getCompanyAccessSnapshot(userId, companyId)
  }
}
