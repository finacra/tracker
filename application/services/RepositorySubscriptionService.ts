import type { SubscriptionService } from '@/application/interfaces/SubscriptionService'
import type { SubscriptionRepository } from '@/application/interfaces/SubscriptionRepository'

export class RepositorySubscriptionService implements SubscriptionService {
    constructor(private subscriptionRepository: SubscriptionRepository) { }

    async hasActiveSubscription(userId: string): Promise<boolean> {
        const state = await this.subscriptionRepository.getUserSubscriptionState(userId)
        if (!state) return false
        return state.hasSubscription || (state.isTrial && state.trialDaysRemaining > 0)
    }
}
