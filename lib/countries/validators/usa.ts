/**
 * USA Validator
 * Implements validation for USA-specific fields: EIN, State Registration
 */

import { BaseValidator, ValidationResult } from './base'
import type { CountryConfig } from '../index'

export class USAValidator implements BaseValidator {
  constructor(private config: CountryConfig) {}

  validateRegistrationId(ein: string): ValidationResult {
    if (!ein || ein.trim().length === 0) {
      return {
        isValid: false,
        error: 'EIN (Employer Identification Number) is required'
      }
    }

    // EIN format: 12-3456789 or 12-3456789 (with or without dash)
    // Format: [NN] [-] [NNNNNNN]
    // NN = 2 digits (prefix)
    // NNNNNNN = 7 digits (suffix)
    const einPattern = /^[0-9]{2}[-\s]?[0-9]{7}$/

    const normalized = ein.trim().replace(/[-\s]/g, '')

    if (!einPattern.test(ein)) {
      return {
        isValid: false,
        error: 'Invalid EIN format. Expected format: 12-3456789',
        normalized: normalized.length === 9 ? normalized : ein.trim()
      }
    }

    // Format with dash for display
    const formatted = normalized.length === 9 
      ? `${normalized.slice(0, 2)}-${normalized.slice(2)}`
      : ein.trim()

    return {
      isValid: true,
      normalized: formatted
    }
  }

  validateTaxId(ein: string): ValidationResult {
    // EIN is used for both registration and tax ID in USA
    return this.validateRegistrationId(ein)
  }

  validatePostalCode(zipCode: string): ValidationResult {
    if (!zipCode || zipCode.trim().length === 0) {
      return {
        isValid: false,
        error: 'ZIP Code is required'
      }
    }

    // ZIP code formats:
    // 5 digits: 12345
    // 9 digits (ZIP+4): 12345-6789
    const zipPattern = /^[0-9]{5}(-[0-9]{4})?$/

    const normalized = zipCode.trim()

    if (!zipPattern.test(normalized)) {
      return {
        isValid: false,
        error: 'Invalid ZIP Code format. Expected: 12345 or 12345-6789',
        normalized
      }
    }

    return {
      isValid: true,
      normalized
    }
  }

  validateState(state: string): ValidationResult {
    if (!state || state.trim().length === 0) {
      return {
        isValid: false,
        error: 'State is required'
      }
    }

    // US states: 2-letter abbreviation or full name
    const stateAbbreviations = [
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
    ]

    const normalized = state.trim().toUpperCase()

    if (stateAbbreviations.includes(normalized) || normalized.length > 2) {
      return {
        isValid: true,
        normalized
      }
    }

    return {
      isValid: false,
      error: 'Invalid US State. Use 2-letter abbreviation or full state name',
      normalized
    }
  }
}
