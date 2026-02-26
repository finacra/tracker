/**
 * Pricing Tier Definitions for Finacra AI
 * 
 * Defines all pricing tiers (Starter, Enterprise)
 * and billing cycles (monthly, quarterly, half-yearly, annual)
 * with discount calculations.
 */

export type BillingCycle = 'monthly' | 'quarterly' | 'half-yearly' | 'annual'
export type PricingTier = 'starter' | 'enterprise'

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
  currency?: string // ISO currency code (e.g., 'INR', 'USD', 'AED')
  currencySymbol?: string // Currency symbol (e.g., '₹', '$', 'د.إ')
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
    monthlyPrice: 2500, // Per company pricing - competitive for single company
    features: [
      '1 company per subscription',
      'Up to 3 team members per company',
      'Basic Company/Director verification',
      'Document storage (10GB per company)',
      'Email support',
      'Standard compliance tracking',
      'Basic reporting',
      'Invited members get free access',
    ],
    limits: {
      companies: 1, // Company-first: 1 company per subscription
      storage: '10GB',
      users: 3,
      apiAccess: false,
      support: 'email',
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations and corporations',
    monthlyPrice: 18000, // User-first: covers up to 100 companies (₹180/company/month)
    features: [
      'Up to 100 companies per subscription',
      'Unlimited team members per company',
      'Premium Company/Director verification',
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
      companies: 100, // User-first: up to 100 companies per subscription
      storage: '500GB',
      users: 'unlimited',
      apiAccess: true,
      support: '24/7',
    },
  },
]

/**
 * Calculate pricing for a specific tier and billing cycle
 * @param countryCode - Optional country code for currency (defaults to 'IN' for backward compatibility)
 * Note: Base prices are in INR. Currency conversion will be added in future phases.
 */
export function calculatePricing(
  tier: PricingTierConfig,
  billingCycle: BillingCycle,
  countryCode: string = 'IN'
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

  // Get country currency info
  let currency = 'INR'
  let currencySymbol = '₹'
  try {
    const { CountryRegistry } = require('../countries')
    const country = CountryRegistry.get(countryCode) || CountryRegistry.get('IN')
    currency = country.currency.code
    currencySymbol = country.currency.symbol
  } catch {
    // Fallback to INR if country module not available
  }

  return {
    billingCycle,
    price: Math.round(price),
    discount,
    effectiveMonthly: Math.round(effectiveMonthly),
    savings: savings ? Math.round(savings) : undefined,
    currency,
    currencySymbol,
  }
}

/**
 * Get all pricing options for a tier
 * @param countryCode - Optional country code for currency (defaults to 'IN' for backward compatibility)
 */
export function getTierPricing(tier: PricingTierConfig, countryCode: string = 'IN'): TierPricing {
  const billingCycles: BillingCycle[] = ['monthly', 'quarterly', 'half-yearly', 'annual']
  const options = billingCycles.map((cycle) => calculatePricing(tier, cycle, countryCode))

  return {
    tier,
    options,
  }
}

/**
 * Get pricing for all tiers
 * @param countryCode - Optional country code for currency (defaults to 'IN' for backward compatibility)
 */
export function getAllPricing(countryCode: string = 'IN'): TierPricing[] {
  return PRICING_TIERS.map((tier) => getTierPricing(tier, countryCode))
}

/**
 * Get a specific tier by ID
 */
export function getTierById(id: PricingTier): PricingTierConfig | undefined {
  return PRICING_TIERS.find((tier) => tier.id === id)
}

/**
 * Format price in Indian Rupees (legacy function - maintained for backward compatibility)
 * @deprecated Use formatPrice with countryCode parameter instead
 */
export function formatPrice(price: number): string {
  return formatPriceWithCurrency(price, 'IN')
}

/**
 * Format price with country-specific currency
 * Backward compatible: defaults to INR if countryCode not provided
 */
export function formatPriceWithCurrency(
  price: number,
  countryCode: string = 'IN'
): string {
  try {
    const { CountryRegistry } = require('../countries')
    const country = CountryRegistry.get(countryCode) || CountryRegistry.get('IN')

    // Determine locale based on country
    let locale: string
    switch (countryCode) {
      case 'IN':
        locale = 'en-IN'
        break
      case 'US':
        locale = 'en-US'
        break
      case 'AE':
      case 'SA':
      case 'OM':
      case 'QA':
      case 'BH':
        locale = 'en-AE' // GCC countries typically use en-AE or en-GB
        break
      default:
        locale = 'en-IN' // Default to Indian locale
    }

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: country.currency.code,
      maximumFractionDigits: 0,
    }).format(price)
  } catch {
    // Fallback to INR if country module not available
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price)
  }
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
