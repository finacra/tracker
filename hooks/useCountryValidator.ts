'use client'

import { useMemo } from 'react'
import { CountryFactory, type BaseValidator } from '@/lib/countries/factory'
import { CountryRegistry } from '@/lib/countries'

/**
 * React hook to get country-specific validator
 * @param countryCode - ISO 3166-1 alpha-2 country code (e.g., 'IN', 'AE', 'US')
 * @returns Validator instance for the country
 */
export function useCountryValidator(countryCode: string | null | undefined): BaseValidator | null {
  return useMemo(() => {
    if (!countryCode) {
      return null
    }
    
    try {
      return CountryFactory.getValidator(countryCode)
    } catch (error) {
      console.error(`Failed to get validator for country ${countryCode}:`, error)
      return null
    }
  }, [countryCode])
}

/**
 * React hook to check if country has API verification support
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns Boolean indicating if API verification is available
 */
export function useCountryAPISupport(countryCode: string | null | undefined): boolean {
  return useMemo(() => {
    if (!countryCode) {
      return false
    }
    
    try {
      const apiClient = CountryFactory.getAPIClient(countryCode)
      return apiClient.hasAPISupport()
    } catch (error) {
      return false
    }
  }, [countryCode])
}
