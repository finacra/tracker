'use client'

import { useMemo } from 'react'
import { getCountryConfig, getDefaultCountryConfig, type CountryConfig } from '@/lib/config/countries'

/**
 * React hook to get country configuration
 * @param countryCode - ISO 3166-1 alpha-2 country code (e.g., 'IN', 'AE', 'US')
 * @returns Country configuration or default (India) if country code is invalid/missing
 */
export function useCountryConfig(countryCode: string | null | undefined): {
  config: CountryConfig
  isLoading: boolean
} {
  const config = useMemo(() => {
    if (!countryCode) {
      return getDefaultCountryConfig()
    }
    
    const countryConfig = getCountryConfig(countryCode)
    return countryConfig || getDefaultCountryConfig()
  }, [countryCode])

  return {
    config,
    isLoading: false // Config is static, no loading needed
  }
}
