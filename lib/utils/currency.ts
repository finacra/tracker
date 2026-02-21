/**
 * Currency Formatting Utilities
 * Country-aware currency formatting
 */

import { getCountryConfig, getDefaultCountryConfig } from '@/lib/config/countries'

/**
 * Format currency amount with country-specific symbol and locale
 * @param amount - Amount to format
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @param options - Formatting options
 * @returns Formatted currency string (e.g., "₹1,00,000" or "$100,000")
 */
export function formatCurrency(
  amount: number,
  countryCode: string = 'IN',
  options?: {
    decimals?: number
    showSymbol?: boolean
  }
): string {
  const config = getCountryConfig(countryCode) || getDefaultCountryConfig()
  const { decimals = 0, showSymbol = true } = options || {}
  
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
  
  // Format number with locale
  const formattedNumber = amount.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
  
  if (!showSymbol) {
    return formattedNumber
  }
  
  // Add currency symbol
  return `${config.currency.symbol}${formattedNumber}`
}

/**
 * Get currency symbol for a country
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns Currency symbol (e.g., "₹", "$", "د.إ")
 */
export function getCurrencySymbol(countryCode: string = 'IN'): string {
  const config = getCountryConfig(countryCode) || getDefaultCountryConfig()
  return config.currency.symbol
}

/**
 * Get ISO currency code for a country
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns ISO 4217 currency code (e.g., "INR", "USD", "AED")
 */
export function getCurrencyCode(countryCode: string = 'IN'): string {
  const config = getCountryConfig(countryCode) || getDefaultCountryConfig()
  return config.currency.code
}

/**
 * Parse currency string back to number
 * Removes currency symbols, commas, and other formatting
 * @param amountStr - Currency string (e.g., "₹1,00,000" or "$100,000")
 * @param countryCode - ISO 3166-1 alpha-2 country code (for symbol removal)
 * @returns Parsed number or null if invalid
 */
export function parseCurrencyAmount(
  amountStr: string,
  countryCode: string = 'IN'
): number | null {
  if (!amountStr) return null
  
  const config = getCountryConfig(countryCode) || getDefaultCountryConfig()
  
  // Remove currency symbol
  let cleaned = amountStr.replace(config.currency.symbol, '')
  
  // Remove all non-digit characters except decimal point and minus sign
  cleaned = cleaned.replace(/[^\d.-]/g, '')
  
  // Handle Indian number format (lakhs, crores) - not implemented yet, would need special handling
  // For now, just parse as standard number
  
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? null : parsed
}
