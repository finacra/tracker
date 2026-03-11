export type AppCompanyAccessType = 'subscription' | 'trial' | 'invited' | 'superadmin' | null

export interface AccessSubscriptionInfo {
  hasSubscription: boolean
  tier: string
  isTrial: boolean
  trialDaysRemaining: number
  companyLimit: number
  userLimit: number
}

export interface CompanyAccessSnapshot {
  hasAccess: boolean
  accessType: AppCompanyAccessType
  trialDaysRemaining: number | null
  isOwner: boolean
  subscriptionInfo: AccessSubscriptionInfo | null
  ownerSubscriptionExpired: boolean
}
