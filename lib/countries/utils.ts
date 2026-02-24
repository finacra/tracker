/**
 * Country Utility Functions
 * Helper functions for country-related operations
 */

import { CountryRegistry } from './index'
import type { CountryConfig } from './index'
import { CountryFactory } from './factory'

/**
 * Get verification portal link for a country and field type
 */
export function getVerificationPortalLink(
  countryCode: string,
  fieldType: 'registration' | 'director' | 'tax'
): string {
  const portals: Record<string, Record<string, string>> = {
    'AE': {
      registration: 'https://www.ded.ae/',
      director: 'https://www.ded.ae/',
      tax: 'https://www.tax.gov.ae/'
    },
    'SA': {
      registration: 'https://mc.gov.sa/',
      director: 'https://mc.gov.sa/',
      tax: 'https://zatca.gov.sa/'
    },
    'OM': {
      registration: 'https://www.moc.gov.om/',
      director: 'https://www.moc.gov.om/',
      tax: 'https://tms.taxoman.gov.om/'
    },
    'QA': {
      registration: 'https://www.moci.gov.qa/',
      director: 'https://www.moci.gov.qa/',
      tax: 'https://dhareeba.gov.qa/'
    },
    'BH': {
      registration: 'https://www.moic.gov.bh/',
      director: 'https://www.moic.gov.bh/',
      tax: 'https://www.nbr.gov.bh/'
    },
    'US': {
      registration: 'https://www.irs.gov/businesses/small-businesses-self-employed/employer-id-numbers',
      director: 'https://www.irs.gov/',
      tax: 'https://www.irs.gov/'
    }
  }

  return portals[countryCode]?.[fieldType] || ''
}

/**
 * Check if a country requires manual verification
 */
export function requiresManualVerification(countryCode: string): boolean {
  if (!countryCode) {
    return true // Default to manual verification if no country code
  }
  try {
    const apiClient = CountryFactory.getAPIClient(countryCode)
    return !apiClient?.hasAPISupport()
  } catch {
    return true // Assume manual verification if API client not available
  }
}

/**
 * Get all active countries grouped by region
 */
export function getCountriesByRegion(): Record<string, CountryConfig[]> {
  const countries = CountryRegistry.getActive()
  const grouped: Record<string, CountryConfig[]> = {}
  
  countries.forEach(country => {
    if (!grouped[country.region]) {
      grouped[country.region] = []
    }
    grouped[country.region].push(country)
  })
  
  return grouped
}

/**
 * Format currency amount for a country
 */
export function formatCurrencyForCountry(
  amount: number,
  countryCode: string = 'IN'
): string {
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
      locale = 'en-AE'
      break
    default:
      locale = 'en-IN'
  }
  
  if (!country) {
    // Fallback to INR if country not found
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }
  
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: country.currency.code,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Get field label for a country
 */
export function getFieldLabel(
  countryCode: string,
  fieldType: 'registrationId' | 'taxId' | 'directorId' | 'postalCode' | 'state'
): string {
  const country = CountryRegistry.get(countryCode) || CountryRegistry.get('IN')
  if (!country) {
    return fieldType
  }
  return country.labels[fieldType] || fieldType
}
