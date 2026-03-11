import type { AccessService } from '@/application/interfaces/AccessService'
import type { RequirementRepository } from '@/application/interfaces/RequirementRepository'
import type { Requirement } from '@/domain/models/Requirement'

export class GetCompanyRequirements {
  constructor(
    private readonly accessService: AccessService,
    private readonly requirementRepository: RequirementRepository
  ) {}

  async execute(userId: string, companyId: string): Promise<Requirement[]> {
    const startTime = performance.now()
    const canView = await this.accessService.canViewCompany(userId, companyId)
    console.log(`[GetCompanyRequirements] Access check took ${(performance.now() - startTime).toFixed(2)}ms`)

    if (!canView) {
      throw new Error('Unauthorized')
    }

    const refreshStartTime = performance.now()
    await this.requirementRepository.refreshOverdueStatuses(companyId)
    console.log(`[GetCompanyRequirements] Refresh overdue statuses took ${(performance.now() - refreshStartTime).toFixed(2)}ms`)
    
    const fetchStartTime = performance.now()
    const requirements = await this.requirementRepository.getByCompanyId(companyId)
    console.log(`[GetCompanyRequirements] Fetch requirements took ${(performance.now() - fetchStartTime).toFixed(2)}ms`)
    console.log(`[GetCompanyRequirements] Total took ${(performance.now() - startTime).toFixed(2)}ms`)
    
    return requirements
  }
}
