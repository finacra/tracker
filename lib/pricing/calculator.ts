/**
 * Financial Calculator Utilities
 * 
 * Provides functions for break-even analysis, revenue projections,
 * and financial modeling calculations.
 */

import { PricingTierConfig, BillingCycle, calculateAnnualRevenue, getTierById } from './tiers'

export interface CustomerMix {
  tier: 'starter' | 'professional' | 'enterprise'
  billingCycle: BillingCycle
  count: number
}

export interface RevenueProjection {
  month: number
  customers: number
  mrr: number
  arr: number
  cumulativeRevenue: number
}

export interface BreakEvenAnalysis {
  fixedCosts: number
  capex?: number // Optional CapEx for Year 1
  variableCostPercent: number
  contributionMargin: number
  requiredRevenue: number
  breakEvenCustomers: number
  breakEvenMonths: number
}

export interface FinancialMetrics {
  mrr: number
  arr: number
  cac: number
  ltv: number
  ltvCacRatio: number
  cacPaybackMonths: number
  churnRate: number
  contributionMargin: number
  grossMargin: number
}

/**
 * Fixed costs structure (Annual)
 */
export const FIXED_COSTS = {
  // Operational Costs
  apis: 40000,
  salaries: 1200000, // Current team salaries (corrected from 100000)
  newHires: 1200000, // 5 × ₹20,000 × 12
  subscriptions: 1200000, // Software subscriptions (corrected from 120000)
  workplace: 600000, // Office rent, utilities, infrastructure

  // Marketing & Sales
  marketing: 1200000,
  branding: 600000,
  outreachPrograms: 1000000,
  printingCosts: 100000,
  travellingCosts: 1500000,
  gifts: 1000000,

  // Operations & Admin
  staffWelfare: 180000,
  officeExpenses: 200000, // Electricity, repair & maintenance
  miscExpenses: 180000,

  get total() {
    return (
      this.apis +
      this.salaries +
      this.newHires +
      this.subscriptions +
      this.workplace +
      this.marketing +
      this.branding +
      this.outreachPrograms +
      this.printingCosts +
      this.travellingCosts +
      this.gifts +
      this.staffWelfare +
      this.officeExpenses +
      this.miscExpenses
    )
  },
}

/**
 * One-time CapEx (Year 1 only)
 */
export const CAPEX_YEAR_1 = 3500000 // ₹35 lakhs

/**
 * Variable cost percentage (20% of revenue)
 */
export const VARIABLE_COST_PERCENT = 20

/**
 * Contribution margin (100% - variable cost %)
 */
export const CONTRIBUTION_MARGIN = 100 - VARIABLE_COST_PERCENT

/**
 * Calculate break-even analysis
 */
export function calculateBreakEven(
  averageAnnualRevenuePerCustomer: number = 60000,
  fixedCosts: number = FIXED_COSTS.total,
  capex: number = 0 // CapEx for Year 1 (default 0 for Year 2+)
): BreakEvenAnalysis {
  const variableCostPercent = VARIABLE_COST_PERCENT
  const contributionMargin = CONTRIBUTION_MARGIN / 100
  const totalCosts = fixedCosts + capex
  const requiredRevenue = totalCosts / contributionMargin
  const breakEvenCustomers = Math.ceil(requiredRevenue / averageAnnualRevenuePerCustomer)
  const breakEvenMonths = (breakEvenCustomers / 12) * 12 // Simplified: assumes linear growth

  return {
    fixedCosts,
    capex: capex > 0 ? capex : undefined,
    variableCostPercent,
    contributionMargin: contributionMargin * 100,
    requiredRevenue: Math.round(requiredRevenue),
    breakEvenCustomers,
    breakEvenMonths: Math.round(breakEvenMonths),
  }
}

/**
 * Calculate revenue from customer mix
 */
export function calculateRevenueFromMix(customerMix: CustomerMix[]): {
  monthly: number
  annual: number
  byTier: Record<string, number>
} {
  let totalMonthly = 0
  let totalAnnual = 0
  const byTier: Record<string, number> = {}

  for (const mix of customerMix) {
    // Filter out 'professional' tier if it doesn't exist in PricingTier
    if (mix.tier === 'professional') continue
    const tier = getTierById(mix.tier as 'starter' | 'enterprise')
    if (!tier) continue

    const annualRevenue = calculateAnnualRevenue(tier, mix.billingCycle)
    const monthlyRevenue = annualRevenue / 12

    const revenue = monthlyRevenue * mix.count
    totalMonthly += revenue
    totalAnnual += annualRevenue * mix.count

    const tierKey = `${mix.tier}-${mix.billingCycle}`
    byTier[tierKey] = revenue
  }

  return {
    monthly: Math.round(totalMonthly),
    annual: Math.round(totalAnnual),
    byTier,
  }
}

/**
 * Calculate monthly recurring revenue (MRR)
 */
export function calculateMRR(customerMix: CustomerMix[]): number {
  const revenue = calculateRevenueFromMix(customerMix)
  return revenue.monthly
}

/**
 * Calculate annual recurring revenue (ARR)
 */
export function calculateARR(customerMix: CustomerMix[]): number {
  const revenue = calculateRevenueFromMix(customerMix)
  return revenue.annual
}

/**
 * Project revenue over time
 */
export function projectRevenue(
  customerMix: CustomerMix[],
  months: number = 24,
  growthRate: number = 0.05 // 5% monthly growth
): RevenueProjection[] {
  const projections: RevenueProjection[] = []
  let currentCustomers = customerMix.reduce((sum, mix) => sum + mix.count, 0)
  let cumulativeRevenue = 0

  for (let month = 1; month <= months; month++) {
    // Apply growth rate
    if (month > 1) {
      currentCustomers = Math.round(currentCustomers * (1 + growthRate))
    }

    // Calculate MRR and ARR
    const mrr = calculateMRR(customerMix) * (currentCustomers / customerMix.reduce((sum, mix) => sum + mix.count, 0))
    const arr = mrr * 12
    cumulativeRevenue += mrr

    projections.push({
      month,
      customers: currentCustomers,
      mrr: Math.round(mrr),
      arr: Math.round(arr),
      cumulativeRevenue: Math.round(cumulativeRevenue),
    })
  }

  return projections
}

/**
 * Calculate financial metrics
 */
export function calculateFinancialMetrics(
  customerMix: CustomerMix[],
  cac: number = 20000, // Customer Acquisition Cost
  churnRate: number = 0.05, // 5% monthly
  averageLifetime: number = 36 // 3 years in months
): FinancialMetrics {
  const mrr = calculateMRR(customerMix)
  const arr = mrr * 12

  // Calculate LTV (Lifetime Value)
  const averageMonthlyRevenue = mrr / customerMix.reduce((sum, mix) => sum + mix.count, 0)
  const ltv = averageMonthlyRevenue * averageLifetime

  // Calculate metrics
  const ltvCacRatio = ltv / cac
  const cacPaybackMonths = cac / averageMonthlyRevenue
  const contributionMargin = CONTRIBUTION_MARGIN
  const grossMargin = CONTRIBUTION_MARGIN // Assuming no COGS beyond variable costs

  return {
    mrr: Math.round(mrr),
    arr: Math.round(arr),
    cac: Math.round(cac),
    ltv: Math.round(ltv),
    ltvCacRatio: Math.round(ltvCacRatio * 100) / 100,
    cacPaybackMonths: Math.round(cacPaybackMonths * 10) / 10,
    churnRate: churnRate * 100,
    contributionMargin,
    grossMargin,
  }
}

/**
 * Calculate profitability
 */
export function calculateProfitability(
  customerMix: CustomerMix[],
  fixedCosts: number = FIXED_COSTS.total,
  capex: number = 0 // CapEx for Year 1 (default 0 for Year 2+)
): {
  revenue: number
  variableCosts: number
  grossProfit: number
  fixedCosts: number
  capex: number
  totalCosts: number
  netProfit: number
  profitMargin: number
} {
  const revenue = calculateARR(customerMix)
  const variableCosts = Math.round(revenue * (VARIABLE_COST_PERCENT / 100))
  const grossProfit = revenue - variableCosts
  const totalCosts = fixedCosts + capex
  const netProfit = grossProfit - totalCosts
  const profitMargin = (netProfit / revenue) * 100

  return {
    revenue,
    variableCosts,
    grossProfit,
    fixedCosts,
    capex,
    totalCosts,
    netProfit,
    profitMargin: Math.round(profitMargin * 100) / 100,
  }
}

/**
 * Calculate break-even timeline
 */
export function calculateBreakEvenTimeline(
  customerMix: CustomerMix[],
  monthlyCustomerGrowth: number = 2, // customers per month
  fixedCosts: number = FIXED_COSTS.total,
  capex: number = 0 // CapEx for Year 1 (default 0 for Year 2+)
): {
  breakEvenMonth: number
  breakEvenCustomers: number
  totalRevenueAtBreakEven: number
} {
  const averageAnnualRevenue = calculateARR(customerMix) / customerMix.reduce((sum, mix) => sum + mix.count, 0)
  const averageMonthlyRevenue = averageAnnualRevenue / 12
  const totalCosts = fixedCosts + capex
  const requiredMonthlyRevenue = totalCosts / 12 / (CONTRIBUTION_MARGIN / 100)
  const breakEvenCustomers = Math.ceil(requiredMonthlyRevenue / averageMonthlyRevenue)
  const breakEvenMonth = Math.ceil(breakEvenCustomers / monthlyCustomerGrowth)
  const totalRevenueAtBreakEven = breakEvenCustomers * averageAnnualRevenue

  return {
    breakEvenMonth,
    breakEvenCustomers,
    totalRevenueAtBreakEven: Math.round(totalRevenueAtBreakEven),
  }
}

/**
 * Format number in Indian Rupees
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`
}
