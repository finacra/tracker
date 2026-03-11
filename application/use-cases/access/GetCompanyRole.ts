import type { AccessService } from '@/application/interfaces/AccessService'
import type { AppRole } from '@/domain/types/Role'

export class GetCompanyRole {
  constructor(private readonly accessService: AccessService) {}

  async execute(userId: string, companyId: string | null): Promise<AppRole | null> {
    const isSuperadmin = await this.accessService.isSuperadmin(userId)

    if (isSuperadmin) {
      return 'superadmin'
    }

    if (!companyId) {
      return null
    }

    const role = await this.accessService.getRoleForCompany(userId, companyId)

    // Preserve the existing action-layer contract for now: company-scoped role
    // checks default to `viewer` when no explicit row is found.
    return role ?? 'viewer'
  }
}
