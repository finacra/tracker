import type { AccessService } from '@/application/interfaces/AccessService'
import type { RequirementRepository } from '@/application/interfaces/RequirementRepository'
import type { Requirement } from '@/domain/models/Requirement'

export class GetCompanyRequirements {
  constructor(
    private readonly accessService: AccessService,
    private readonly requirementRepository: RequirementRepository
  ) {}

  async execute(userId: string, companyId: string, isSuperadminCache?: boolean): Promise<Requirement[]> {
    const startTime = performance.now()
    const canView = await this.accessService.canViewCompany(userId, companyId, isSuperadminCache)
    console.log(`[GetCompanyRequirements] Access check took ${(performance.now() - startTime).toFixed(2)}ms`)

    if (!canView) {
      throw new Error('Unauthorized')
    }

    // OPTIMIZATION: Make refreshOverdueStatuses non-blocking to speed up initial load
    // The status will be updated in the background, and the next fetch will have correct status
    const refreshStartTime = performance.now()
    this.requirementRepository.refreshOverdueStatuses(companyId).catch((err) => {
      console.error('[GetCompanyRequirements] Background status update failed (non-critical):', err)
    })
    // Don't await - let it run in background
    
    const fetchStartTime = performance.now()
    const requirements = await this.requirementRepository.getByCompanyId(companyId)
    console.log(`[GetCompanyRequirements] Fetch requirements took ${(performance.now() - fetchStartTime).toFixed(2)}ms`)
    console.log(`[GetCompanyRequirements] Total took ${(performance.now() - startTime).toFixed(2)}ms`)
    
    return requirements
  }
}
