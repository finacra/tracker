import type { AuthService } from '@/application/interfaces/AuthService'
import type { CompanyRepository } from '@/application/interfaces/CompanyRepository'
import type { SubscriptionService } from '@/application/interfaces/SubscriptionService'

export class GetRootDestination {
  constructor(
    private readonly authService: AuthService,
    private readonly companyRepository: CompanyRepository,
    private readonly subscriptionService: SubscriptionService
  ) {}

  async execute(): Promise<string> {
    const user = await this.authService.getCurrentUser()

    if (!user) {
      return '/home'
    }

    return this.executeForUser(user.id)
  }

  async executeForUser(userId: string): Promise<string> {
    if (await this.companyRepository.hasAnyAccessibleCompany(userId)) {
      return '/data-room'
    }

    return (await this.subscriptionService.hasActiveSubscription(userId))
      ? '/onboarding'
      : '/subscribe'
  }
}
