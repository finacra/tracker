/**
 * Country Factory
 * Factory pattern for creating country-specific modules (validators, API clients, etc.)
 */

import { CountryRegistry } from './index'
import type { CountryConfig } from './index'
import type { BaseValidator, ValidationResult } from './validators/base'

// Re-export validator interfaces
export type { BaseValidator, ValidationResult } from './validators/base'

export interface CountryAPIClient {
  verifyRegistrationId(id: string): Promise<VerificationResult>
  verifyDirectorId?(id: string): Promise<VerificationResult>
  getCompanyDetails?(id: string): Promise<CompanyDetails | null>
  hasAPISupport(): boolean
}

export interface VerificationResult {
  verified: boolean
  requiresManualVerification?: boolean
  message?: string
  validationResult?: ValidationResult
  verificationPortal?: string
  formatValid?: boolean
  companyDetails?: CompanyDetails
}

export interface CompanyDetails {
  name?: string
  status?: string
  incorporationDate?: string
  [key: string]: any
}

export class CountryFactory {
  /**
   * Get validator for a country
   * Returns country-specific validator with detailed validation patterns
   */
  static getValidator(countryCode: string): BaseValidator {
    const config = CountryRegistry.get(countryCode)
    if (!config) {
      throw new Error(`Country ${countryCode} not supported`)
    }

    // Return country-specific validators
    switch (countryCode) {
      case 'IN': {
        const { IndiaValidator } = require('./validators/india')
        return new IndiaValidator(config)
      }
      case 'AE': {
        const { UAEValidator } = require('./validators/uae')
        return new UAEValidator(config)
      }
      case 'SA': {
        const { SaudiValidator } = require('./validators/saudi')
        return new SaudiValidator(config)
      }
      case 'OM': {
        const { OmanValidator } = require('./validators/oman')
        return new OmanValidator(config)
      }
      case 'QA': {
        const { QatarValidator } = require('./validators/qatar')
        return new QatarValidator(config)
      }
      case 'BH': {
        const { BahrainValidator } = require('./validators/bahrain')
        return new BahrainValidator(config)
      }
      case 'US': {
        const { USAValidator } = require('./validators/usa')
        return new USAValidator(config)
      }
      default:
        // Fallback to basic validator
        return new BasicCountryValidator(config)
    }
  }

  /**
   * Get API client for a country
   * Only India has API support currently
   */
  static getAPIClient(countryCode: string): CountryAPIClient {
    const config = CountryRegistry.get(countryCode)
    if (!config) {
      throw new Error(`Country ${countryCode} not supported`)
    }

    // Only India has API support
    if (countryCode === 'IN') {
      // Import dynamically to avoid circular dependencies
      try {
        const { IndiaAPIClient } = require('./api/india')
        return new IndiaAPIClient()
      } catch {
        // Fallback if module not found
        return new FormatOnlyAPIClient(config)
      }
    }

    // All other countries use format validation only
    return new FormatOnlyAPIClient(config)
  }

  /**
   * Get penalty formatter for a country
   */
  static getPenaltyFormatter(countryCode: string = 'IN') {
    const config = CountryRegistry.get(countryCode) || CountryRegistry.get('IN')
    if (!config) {
      // Fallback to INR if no config found
      return {
        format: (amount: number) => {
          return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
        },
        getSymbol: () => '₹',
        getCode: () => 'INR'
      }
    }
    // Will be implemented in penalty formatters module
    // For now, return a basic formatter
    return {
      format: (amount: number) => {
        return `${config.currency.symbol}${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
      },
      getSymbol: () => config.currency.symbol,
      getCode: () => config.currency.code
    }
  }
}

/**
 * Basic validator implementation
 * Uses format validation based on country config
 */
class BasicCountryValidator implements BaseValidator {
  constructor(private config: CountryConfig) {}

  validateRegistrationId(id: string): ValidationResult {
    if (!id || id.trim().length === 0) {
      return { isValid: false, error: `${this.config.labels.registrationId} is required` }
    }
    // Basic validation - country-specific patterns will be added later
    return { isValid: true, normalized: id.trim().toUpperCase() }
  }

  validateTaxId(id: string): ValidationResult {
    if (!id || id.trim().length === 0) {
      return { isValid: false, error: `${this.config.labels.taxId} is required` }
    }
    return { isValid: true, normalized: id.trim().toUpperCase() }
  }

  validateDirectorId(id: string): ValidationResult {
    if (!this.config.labels.directorId) {
      return { isValid: true } // Not required for this country
    }
    if (!id || id.trim().length === 0) {
      return { isValid: false, error: `${this.config.labels.directorId} is required` }
    }
    return { isValid: true, normalized: id.trim().toUpperCase() }
  }

  validatePostalCode(code: string): ValidationResult {
    if (!code || code.trim().length === 0) {
      return { isValid: false, error: `${this.config.labels.postalCode} is required` }
    }
    return { isValid: true, normalized: code.trim() }
  }
}

/**
 * Format-only API client for countries without API support
 */
class FormatOnlyAPIClient implements CountryAPIClient {
  constructor(private config: CountryConfig) {}

  hasAPISupport(): boolean {
    return false
  }

  async verifyRegistrationId(id: string): Promise<VerificationResult> {
    // Basic format validation - avoid circular dependency by using BasicCountryValidator directly
    const basicValidator = new BasicCountryValidator(this.config)
    const validationResult = basicValidator.validateRegistrationId(id)

    return {
      verified: false,
      requiresManualVerification: true,
      message: `Please verify ${this.config.labels.registrationId} manually via official portal`,
      validationResult,
      formatValid: validationResult.isValid,
      verificationPortal: this.getVerificationPortal('registration')
    }
  }

  async verifyDirectorId(id: string): Promise<VerificationResult> {
    if (!this.config.labels.directorId) {
      return {
        verified: false,
        requiresManualVerification: true,
        message: 'Director verification not applicable for this country',
        formatValid: true
      }
    }

    // Basic format validation - avoid circular dependency
    const basicValidator = new BasicCountryValidator(this.config)
    const validationResult = basicValidator.validateDirectorId(id)

    return {
      verified: false,
      requiresManualVerification: true,
      message: `Please verify ${this.config.labels.directorId} manually via official portal`,
      validationResult,
      formatValid: validationResult.isValid
    }
  }

  async getCompanyDetails(id: string): Promise<CompanyDetails | null> {
    return null // No API available
  }

  private getVerificationPortal(fieldType: string): string {
    // Portal links will be stored in database later
    // For now, return generic links based on country
    const portals: Record<string, string> = {
      'AE': 'https://www.ded.ae/',
      'SA': 'https://mc.gov.sa/',
      'OM': 'https://www.moc.gov.om/',
      'QA': 'https://www.moci.gov.qa/',
      'BH': 'https://www.moic.gov.bh/',
      'US': 'https://www.irs.gov/businesses/small-businesses-self-employed/employer-id-numbers'
    }
    return portals[this.config.code] || ''
  }
}
