'use client'

import { useCountryConfig } from './useCountryConfig'
import type { CountryConfig } from '@/lib/config/countries'

interface Company {
  id: string
  name: string
  type: string
  year: string
  country_code?: string
  region?: string
}

/**
 * React hook to get country configuration for current company
 * @param currentCompany - Current company object (may be null)
 * @returns Country code and configuration, defaults to India if company is null or country_code is missing
 */
export function useCompanyCountry(currentCompany: Company | null): {
  countryCode: string
  countryConfig: CountryConfig
} {
  const countryCode = currentCompany?.country_code || 'IN'
  const { config } = useCountryConfig(countryCode)

  return {
    countryCode,
    countryConfig: config
  }
}
