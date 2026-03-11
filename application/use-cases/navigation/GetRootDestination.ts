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
    // OPTIMIZATION: Check both in parallel since they're independent
    const [hasAccessibleCompany, hasActiveSubscription] = await Promise.all([
      this.companyRepository.hasAnyAccessibleCompany(userId),
      this.subscriptionService.hasActiveSubscription(userId)
    ])
    
    if (hasAccessibleCompany) {
      return '/data-room'
    }

    return hasActiveSubscription ? '/onboarding' : '/subscribe'
  }
}
