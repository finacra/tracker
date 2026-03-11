export interface UserSubscriptionState {
  hasSubscription: boolean
  tier: string
  isTrial: boolean
  trialDaysRemaining: number
  companyLimit: number
  userLimit: number
}

export interface CompanySubscriptionState {
  hasSubscription: boolean
  tier: string
  isTrial: boolean
  trialDaysRemaining: number
  userLimit: number
}

export interface SubscriptionRecord {
  id: string
  userId: string
  companyId: string | null
  subscriptionType: string | null
  status: string
  tier: string
  billingCycle: string
  amount: number
  currency: string
  startDate: string
  endDate: string
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  cancelledAt: string | null
  isTrial: boolean
  trialStartedAt: string | null
  trialEndsAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SubscriptionRepository {
  hasUsedEnterpriseUserTrial(userId: string): Promise<boolean>
  hasUsedCompanyTrial(companyId: string): Promise<boolean>
  createUserTrial(userId: string, appUserId?: string | null): Promise<void>
  createCompanyTrial(userId: string, companyId: string, appUserId?: string | null): Promise<void>
  getUserSubscriptionState(userId: string): Promise<UserSubscriptionState | null>
  getCompanySubscriptionState(companyId: string): Promise<CompanySubscriptionState | null>
  getById(id: string): Promise<SubscriptionRecord | null>
  listAll(): Promise<SubscriptionRecord[]>
  getLatestForCompany(companyId: string): Promise<SubscriptionRecord | null>
  activatePaidSubscription(input: {
    userId: string
    companyId: string | null
    tier: 'starter' | 'professional' | 'enterprise'
    billingCycle: 'monthly' | 'quarterly' | 'half-yearly' | 'annual'
    amount: number
    currency: string
    startDate: string
    endDate: string
    appUserId?: string | null
  }): Promise<void>

  // Admin & Team Mutations
  extendTrial(subscriptionId: string, baseDate: Date, days: number): Promise<void>
  revokeSubscription(subscriptionId: string): Promise<void>
  grantEnterpriseTrial(userId: string, days: number, appUserId?: string | null): Promise<void>
  grantCompanyTrial(userId: string, companyId: string, tier: string, days: number, appUserId?: string | null): Promise<void>
  changeTier(subscriptionId: string, tier: string): Promise<void>
}
