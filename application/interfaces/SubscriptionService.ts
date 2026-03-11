export interface SubscriptionService {
  hasActiveSubscription(userId: string): Promise<boolean>
}
