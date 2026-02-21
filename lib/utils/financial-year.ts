/**
 * Financial Year Utilities
 * Country-aware financial year calculations
 */

import { getCountryConfig, getDefaultCountryConfig } from '@/lib/config/countries'

/**
 * Get current financial year based on country configuration
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @param yearType - Optional override for FY/CY (uses country config if not provided)
 * @returns Financial year string (e.g., "FY 2024-25" or "CY 2024")
 */
export function getCurrentFinancialYear(
  countryCode: string = 'IN',
  yearType?: 'FY' | 'CY'
): string {
  const config = getCountryConfig(countryCode) || getDefaultCountryConfig()
  const now = new Date()
  const currentYear = now.getFullYear()
  
  const fyType = yearType || config.financialYear.type
  const startMonth = config.financialYear.startMonth - 1 // Convert to 0-indexed (0-11)
  
  if (fyType === 'CY') {
    // Calendar Year: January to December
    return `CY ${currentYear}`
  }
  
  // Financial Year: Based on start month
  const currentMonth = now.getMonth() // 0-11 (Jan = 0)
  
  if (currentMonth < startMonth) {
    // Before FY start: previous year to current year
    const fyStart = currentYear - 1
    return `FY ${fyStart}-${currentYear.toString().slice(-2)}`
  } else {
    // After FY start: current year to next year
    return `FY ${currentYear}-${(currentYear + 1).toString().slice(-2)}`
  }
}

/**
 * Parse financial year string robustly
 * @param fyStr - Financial year string (e.g., "FY 2024-25" or "CY 2024")
 * @returns Parsed financial year object or null if invalid
 */
export function parseFinancialYear(
  fyStr: string | null | undefined
): { startYear: number; endYear: number; type: 'FY' | 'CY' } | null {
  if (!fyStr) return null
  
  // Handle Calendar Year format: "CY 2024"
  const cyMatch = fyStr.match(/^CY\s*(\d{4})$/i)
  if (cyMatch) {
    const year = parseInt(cyMatch[1], 10)
    return { startYear: year, endYear: year, type: 'CY' }
  }
  
  // Handle Financial Year format: "FY 2024-25" or "FY 2024-2025"
  const fyMatch = fyStr.match(/^FY\s*(\d{4})\s*[-–]\s*(\d{2,4})$/i)
  if (fyMatch) {
    const startYear = parseInt(fyMatch[1], 10)
    const endPart = fyMatch[2]
    let endYear: number
    
    if (endPart.length === 2) {
      // Two-digit year: "FY 2024-25" -> endYear = 2025
      const century = Math.floor(startYear / 100) * 100
      endYear = century + parseInt(endPart, 10)
      // Handle century rollover (e.g., FY 2099-00 should be 2100, not 2099)
      if (endYear < startYear) {
        endYear += 100
      }
    } else {
      // Four-digit year: "FY 2024-2025"
      endYear = parseInt(endPart, 10)
    }
    
    return { startYear, endYear, type: 'FY' }
  }
  
  return null
}

/**
 * Get months included in a financial year based on country configuration
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @param fyStr - Financial year string (e.g., "FY 2024-25" or "CY 2024")
 * @returns Array of month names in order
 */
export function getFinancialYearMonths(
  countryCode: string = 'IN',
  fyStr: string
): string[] {
  const parsed = parseFinancialYear(fyStr)
  if (!parsed) return []
  
  const config = getCountryConfig(countryCode) || getDefaultCountryConfig()
  const allMonths = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  
  if (parsed.type === 'CY') {
    // Calendar Year: All 12 months in order
    return allMonths
  }
  
  // Financial Year: Start from the configured start month
  const startMonthIndex = config.financialYear.startMonth - 1 // Convert to 0-indexed
  const monthsBeforeStart = allMonths.slice(0, startMonthIndex)
  const monthsFromStart = allMonths.slice(startMonthIndex)
  
  return [...monthsFromStart, ...monthsBeforeStart]
}

/**
 * Check if a date falls within a financial year
 * @param date - Date to check
 * @param fyStr - Financial year string (e.g., "FY 2024-25" or "CY 2024")
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns True if date is within the financial year
 */
export function isInFinancialYear(
  date: Date,
  fyStr: string,
  countryCode: string = 'IN'
): boolean {
  const parsed = parseFinancialYear(fyStr)
  if (!parsed) return false
  
  const config = getCountryConfig(countryCode) || getDefaultCountryConfig()
  const reqYear = date.getUTCFullYear()
  const reqMonth = date.getUTCMonth() // 0-11
  
  if (parsed.type === 'CY') {
    // Calendar Year: January to December of the same year
    return reqYear === parsed.startYear
  }
  
  // Financial Year: Based on country's start month
  const startMonthIndex = config.financialYear.startMonth - 1 // Convert to 0-indexed
  
  if (reqMonth >= startMonthIndex) {
    // Month is in the start year (e.g., Apr-Dec for India)
    return reqYear === parsed.startYear
  } else {
    // Month is in the end year (e.g., Jan-Mar for India)
    return reqYear === parsed.endYear
  }
}

/**
 * Get start date of a financial year
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @param fyStr - Financial year string (e.g., "FY 2024-25" or "CY 2024")
 * @returns Start date of the financial year or null if invalid
 */
export function getFinancialYearStartDate(
  countryCode: string = 'IN',
  fyStr: string
): Date | null {
  const parsed = parseFinancialYear(fyStr)
  if (!parsed) return null
  
  const config = getCountryConfig(countryCode) || getDefaultCountryConfig()
  
  if (parsed.type === 'CY') {
    // Calendar Year: January 1st
    return new Date(Date.UTC(parsed.startYear, 0, 1))
  }
  
  // Financial Year: Start month, 1st day
  const startMonthIndex = config.financialYear.startMonth - 1 // Convert to 0-indexed
  return new Date(Date.UTC(parsed.startYear, startMonthIndex, 1))
}

/**
 * Get end date of a financial year
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @param fyStr - Financial year string (e.g., "FY 2024-25" or "CY 2024")
 * @returns End date of the financial year (last day) or null if invalid
 */
export function getFinancialYearEndDate(
  countryCode: string = 'IN',
  fyStr: string
): Date | null {
  const parsed = parseFinancialYear(fyStr)
  if (!parsed) return null
  
  const config = getCountryConfig(countryCode) || getDefaultCountryConfig()
  
  if (parsed.type === 'CY') {
    // Calendar Year: December 31st
    return new Date(Date.UTC(parsed.startYear, 11, 31, 23, 59, 59, 999))
  }
  
  // Financial Year: Last day of month before start month
  const startMonthIndex = config.financialYear.startMonth - 1 // Convert to 0-indexed
  const endMonthIndex = startMonthIndex === 0 ? 11 : startMonthIndex - 1
  const endYear = parsed.endYear
  
  // Get last day of the end month
  const lastDay = new Date(Date.UTC(endYear, endMonthIndex + 1, 0)).getDate()
  return new Date(Date.UTC(endYear, endMonthIndex, lastDay, 23, 59, 59, 999))
}
