/**
 * Pricing Tier Definitions for Finnovate AI
 * 
 * Defines all pricing tiers (Starter, Professional, Enterprise)
 * and billing cycles (monthly, quarterly, half-yearly, annual)
 * with discount calculations.
 */

export type BillingCycle = 'monthly' | 'quarterly' | 'half-yearly' | 'annual'
export type PricingTier = 'starter' | 'professional' | 'enterprise'

export interface PricingTierConfig {
  id: PricingTier
  name: string
  description: string
  monthlyPrice: number
  features: string[]
  popular?: boolean
  limits: {
    companies: number | 'unlimited'
    storage: string
    users: number | 'unlimited'
    apiAccess: boolean
    support: 'email' | 'priority' | '24/7'
  }
}

export interface PricingOption {
  billingCycle: BillingCycle
  price: number
  discount: number
  effectiveMonthly: number
  savings?: number
}

export interface TierPricing {
  tier: PricingTierConfig
  options: PricingOption[]
}

/**
 * Discount percentages for each billing cycle
 */
const BILLING_DISCOUNTS: Record<BillingCycle, number> = {
  monthly: 0,
  quarterly: 10,
  'half-yearly': 15,
  annual: 20,
}

/**
 * Pricing tier configurations
 */
export const PRICING_TIERS: PricingTierConfig[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for small businesses and startups',
    monthlyPrice: 3500,
    features: [
      '1 company per subscription',
      'Up to 3 team members per company',
      'Basic CIN/DIN verification',
      'Document storage (10GB per company)',
      'Email support',
      'Standard compliance tracking',
      'Basic reporting',
      'Invited members get free access',
    ],
    limits: {
      companies: 5,
      storage: '10GB',
      users: 3,
      apiAccess: false,
      support: 'email',
    },
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Ideal for growing businesses',
    monthlyPrice: 8000,
    features: [
      '1 company per subscription',
      'Up to 10 team members per company',
      'Advanced CIN/DIN verification',
      'Document storage (50GB per company)',
      'Priority email support',
      'Advanced compliance tracking',
      'Team collaboration tools',
      'API access',
      'Advanced reporting & analytics',
      'Custom workflows',
      'Invited members get free access',
    ],
    popular: true,
    limits: {
      companies: 20,
      storage: '50GB',
      users: 10,
      apiAccess: true,
      support: 'priority',
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations and corporations',
    monthlyPrice: 18000,
    features: [
      'Up to 100 companies per subscription',
      'Unlimited team members per company',
      'Premium CIN/DIN verification',
      'Document storage (500GB total)',
      '24/7 priority support',
      'Advanced compliance tracking & automation',
      'Custom API integrations',
      'Dedicated account manager',
      'Custom reporting & analytics',
      'SLA guarantees',
      'On-premise deployment option',
      'Invited members get free access',
    ],
    limits: {
      companies: 'unlimited',
      storage: '500GB',
      users: 'unlimited',
      apiAccess: true,
      support: '24/7',
    },
  },
]

/**
 * Calculate pricing for a specific tier and billing cycle
 */
export function calculatePricing(
  tier: PricingTierConfig,
  billingCycle: BillingCycle
): PricingOption {
  const discount = BILLING_DISCOUNTS[billingCycle]
  const monthlyPrice = tier.monthlyPrice

  let price: number
  let effectiveMonthly: number

  switch (billingCycle) {
    case 'monthly':
      price = monthlyPrice
      effectiveMonthly = monthlyPrice
      break
    case 'quarterly':
      price = monthlyPrice * 3 * (1 - discount / 100)
      effectiveMonthly = price / 3
      break
    case 'half-yearly':
      price = monthlyPrice * 6 * (1 - discount / 100)
      effectiveMonthly = price / 6
      break
    case 'annual':
      price = monthlyPrice * 12 * (1 - discount / 100)
      effectiveMonthly = price / 12
      break
  }

  const savings =
    billingCycle !== 'monthly'
      ? monthlyPrice * (billingCycle === 'quarterly' ? 3 : billingCycle === 'half-yearly' ? 6 : 12) - price
      : undefined

  return {
    billingCycle,
    price: Math.round(price),
    discount,
    effectiveMonthly: Math.round(effectiveMonthly),
    savings: savings ? Math.round(savings) : undefined,
  }
}

/**
 * Get all pricing options for a tier
 */
export function getTierPricing(tier: PricingTierConfig): TierPricing {
  const billingCycles: BillingCycle[] = ['monthly', 'quarterly', 'half-yearly', 'annual']
  const options = billingCycles.map((cycle) => calculatePricing(tier, cycle))

  return {
    tier,
    options,
  }
}

/**
 * Get pricing for all tiers
 */
export function getAllPricing(): TierPricing[] {
  return PRICING_TIERS.map((tier) => getTierPricing(tier))
}

/**
 * Get a specific tier by ID
 */
export function getTierById(id: PricingTier): PricingTierConfig | undefined {
  return PRICING_TIERS.find((tier) => tier.id === id)
}

/**
 * Format price in Indian Rupees
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(price)
}

/**
 * Get the best value billing cycle (highest discount)
 */
export function getBestValueBillingCycle(): BillingCycle {
  return 'annual'
}

/**
 * Calculate annual revenue from pricing
 */
export function calculateAnnualRevenue(
  tier: PricingTierConfig,
  billingCycle: BillingCycle
): number {
  const pricing = calculatePricing(tier, billingCycle)

  switch (billingCycle) {
    case 'monthly':
      return pricing.price * 12
    case 'quarterly':
      return pricing.price * 4
    case 'half-yearly':
      return pricing.price * 2
    case 'annual':
      return pricing.price
  }
}
