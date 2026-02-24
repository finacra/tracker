/**
 * Country Registry
 * Central registry for all country configurations and modules
 */

import type { CountryConfig } from '@/lib/config/countries'
import { COUNTRY_CONFIGS } from '@/lib/config/countries'

export class CountryRegistry {
  private static countries: Map<string, CountryConfig> = new Map()

  /**
   * Register a country configuration
   */
  static register(countryCode: string, config: CountryConfig): void {
    this.countries.set(countryCode.toUpperCase(), config)
  }

  /**
   * Get country configuration by code
   */
  static get(countryCode: string): CountryConfig | null {
    if (!countryCode) return null
    return this.countries.get(countryCode.toUpperCase()) || null
  }

  /**
   * Get all registered countries
   */
  static getAll(): CountryConfig[] {
    return Array.from(this.countries.values())
  }

  /**
   * Get active countries only
   */
  static getActive(): CountryConfig[] {
    // For now, all countries in COUNTRY_CONFIGS are active
    // In future, this can filter by isActive flag from database
    return this.getAll()
  }

  /**
   * Get countries by region
   */
  static getByRegion(region: 'APAC' | 'GCC' | 'NA' | 'EU'): CountryConfig[] {
    return this.getAll().filter(c => c.region === region)
  }

  /**
   * Check if country is registered
   */
  static has(countryCode: string): boolean {
    return this.countries.has(countryCode.toUpperCase())
  }
}

// Initialize registry with existing country configs
Object.entries(COUNTRY_CONFIGS).forEach(([code, config]) => {
  CountryRegistry.register(code, config)
})

// Re-export for convenience
export type { CountryConfig } from '@/lib/config/countries'
export { getCountryConfig, getDefaultCountryConfig, getCountriesByRegion, isCountrySupported } from '@/lib/config/countries'

// Export factory and related modules
export { CountryFactory } from './factory'
export type { BaseValidator, ValidationResult, CountryAPIClient } from './factory'
export * from './utils'
