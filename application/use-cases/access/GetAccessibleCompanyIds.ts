import type { AccessService } from '@/application/interfaces/AccessService'

export class GetAccessibleCompanyIds {
  constructor(private readonly accessService: AccessService) {}

  execute(userId: string): Promise<string[]> {
    return this.accessService.getAccessibleCompanyIds(userId)
  }
}
