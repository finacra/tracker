/**
 * Profile Builder — Converts a DB Company record to a CompanyRuleProfile
 *
 * This bridges the gap between the Prisma model and the rules engine's input type.
 * NIC code is resolved to division + section using the NIC codes dataset.
 */

import type { CompanyRuleProfile } from './types'
import { NIC_CODES, type NicSubclass } from '@/data/nic-codes'

/**
 * Shape of the company data we need from the DB.
 * Matches the Prisma select used in the server action.
 */
export interface CompanyForRuleEvaluation {
  type: string | null
  nic_code: string | null
  state: string | null
  is_listed: boolean | null
  employee_count: number | null
  annual_turnover: { toNumber(): number } | number | null // Prisma Decimal or number
  is_gst_registered: boolean | null
  net_worth: { toNumber(): number } | number | null       // Prisma Decimal or number
  is_msme: boolean | null
  msme_category: string | null
  has_imports_exports: boolean | null
  is_startup_dpiit: boolean | null
  incorporation_date: Date | null
  country_code: string | null
}

/**
 * Converts a DB company record into a CompanyRuleProfile for the rules engine.
 *
 * - Resolves NIC 5-digit code → division (2-digit) + section (1-letter)
 * - Converts Prisma Decimal to number for turnover/net_worth
 * - Normalizes booleans (null → false for flags, null preserved for MSME)
 */
export function buildRuleProfile(company: CompanyForRuleEvaluation): CompanyRuleProfile {
  const nicData: NicSubclass | undefined = company.nic_code
    ? NIC_CODES.find((n: NicSubclass) => n.code === company.nic_code)
    : undefined

  // Convert Prisma Decimal to number
  const turnoverLakhs = toNumberOrNull(company.annual_turnover)
  const netWorthCrores = toNumberOrNull(company.net_worth)

  return {
    type: company.type,
    state: company.state,
    nicCode: company.nic_code,
    nicDivision: nicData?.divisionCode || '',
    nicSection: nicData?.section || '',
    isListed: company.is_listed ?? false,
    employeeCount: company.employee_count,
    annualTurnoverLakhs: turnoverLakhs,
    isGstRegistered: company.is_gst_registered ?? false,
    netWorthCrores: netWorthCrores,
    isMsme: company.is_msme ?? null,
    msmeCategory: company.msme_category,
    hasImportsExports: company.has_imports_exports ?? false,
    isStartupDpiit: company.is_startup_dpiit ?? false,
    incorporationDate: company.incorporation_date,
    countryCode: company.country_code || 'IN',
  }
}

function toNumberOrNull(val: { toNumber(): number } | number | null): number | null {
  if (val === null || val === undefined) return null
  if (typeof val === 'number') return val
  if (typeof val?.toNumber === 'function') return val.toNumber()
  return null
}
