'use client'

import { useMemo } from 'react'
import { CountryRegistry, type CountryConfig } from '@/lib/countries'
// Backward compatibility: also export from old location
import { getCountryConfig, getDefaultCountryConfig } from '@/lib/config/countries'

/**
 * React hook to get country configuration
 * @param countryCode - ISO 3166-1 alpha-2 country code (e.g., 'IN', 'AE', 'US')
 * @returns Country configuration or default (India) if country code is invalid/missing
 * 
 * Uses new CountryRegistry but falls back to old system for backward compatibility
 */
export function useCountryConfig(countryCode: string | null | undefined): {
  config: CountryConfig
  isLoading: boolean
} {
  const config = useMemo(() => {
    if (!countryCode) {
      // Try new registry first, fallback to old system
      return CountryRegistry.get('IN') || getDefaultCountryConfig()
    }
    
    // Try new registry first
    const countryConfig = CountryRegistry.get(countryCode)
    if (countryConfig) {
      return countryConfig
    }
    
    // Fallback to old system for backward compatibility
    return getCountryConfig(countryCode) || getDefaultCountryConfig()
  }, [countryCode])

  return {
    config,
    isLoading: false // Config is static, no loading needed
  }
}
