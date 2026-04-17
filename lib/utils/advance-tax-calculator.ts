/**
 * Advance Tax Shortfall Calculator
 *
 * Calculates shortfall and interest u/s 234C for each quarterly instalment.
 *
 * Schedule (Indian FY):
 *   Q1: 15 June   — at least 15% of estimated tax
 *   Q2: 15 Sep    — cumulative 45% (no interest if >= 36% paid)
 *   Q3: 15 Dec    — cumulative 75%
 *   Q4: 15 Mar    — 100%
 *
 * Interest: 1% per month (simple) on shortfall amount for 3 months per quarter.
 */

export interface AdvanceTaxInstallment {
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'
  dueDate: string
  cumulativePercent: number
  estimatedAmount: number
  amountPaid: number
  cumulativePaid: number
  shortfall: number
  interestRate: number // 1% per month
  interestMonths: number
  interestAmount: number
  isExemptFromInterest: boolean
}

export interface AdvanceTaxSummary {
  estimatedLiability: number
  totalPaid: number
  totalShortfall: number
  totalInterest: number
  installments: AdvanceTaxInstallment[]
}

const QUARTER_CONFIG = [
  { quarter: 'Q1' as const, dueDate: 'June 15', cumulativePercent: 15, minExemptPercent: null, interestMonths: 3 },
  { quarter: 'Q2' as const, dueDate: 'September 15', cumulativePercent: 45, minExemptPercent: 36, interestMonths: 3 },
  { quarter: 'Q3' as const, dueDate: 'December 15', cumulativePercent: 75, minExemptPercent: null, interestMonths: 3 },
  { quarter: 'Q4' as const, dueDate: 'March 15', cumulativePercent: 100, minExemptPercent: null, interestMonths: 1 },
]

/**
 * Calculate advance tax shortfall and interest for all 4 quarters.
 *
 * @param estimatedLiability - Total estimated tax liability for the FY
 * @param payments - Object with quarter keys and amount paid values
 */
export function calculateAdvanceTaxShortfall(
  estimatedLiability: number,
  payments: Partial<Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number>>
): AdvanceTaxSummary {
  if (estimatedLiability <= 0) {
    return {
      estimatedLiability: 0,
      totalPaid: 0,
      totalShortfall: 0,
      totalInterest: 0,
      installments: [],
    }
  }

  let cumulativePaid = 0
  let totalInterest = 0
  const installments: AdvanceTaxInstallment[] = []

  for (const config of QUARTER_CONFIG) {
    const paid = payments[config.quarter] || 0
    cumulativePaid += paid
    const estimatedAmount = Math.round((config.cumulativePercent / 100) * estimatedLiability)
    const shortfall = Math.max(0, estimatedAmount - cumulativePaid)

    // Q2 special rule: if cumulative paid >= 36%, no interest
    let isExempt = false
    if (config.minExemptPercent !== null) {
      const minAmount = Math.round((config.minExemptPercent / 100) * estimatedLiability)
      isExempt = cumulativePaid >= minAmount
    }

    // Interest: 1% per month on shortfall
    const interestAmount = isExempt ? 0 : Math.round(shortfall * 0.01 * config.interestMonths)
    totalInterest += interestAmount

    installments.push({
      quarter: config.quarter,
      dueDate: config.dueDate,
      cumulativePercent: config.cumulativePercent,
      estimatedAmount,
      amountPaid: paid,
      cumulativePaid,
      shortfall,
      interestRate: 1,
      interestMonths: config.interestMonths,
      interestAmount,
      isExemptFromInterest: isExempt,
    })
  }

  return {
    estimatedLiability,
    totalPaid: cumulativePaid,
    totalShortfall: installments.reduce((sum, i) => sum + i.shortfall, 0),
    totalInterest,
    installments,
  }
}

/**
 * Format currency in Indian numbering system (lakhs/crores).
 */
export function formatINR(amount: number): string {
  if (amount === 0) return '₹0'
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  // Indian format: XX,XX,XXX
  const str = abs.toString()
  const lastThree = str.slice(-3)
  const rest = str.slice(0, -3)
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + (rest ? ',' : '') + lastThree
  return `${sign}₹${formatted}`
}
