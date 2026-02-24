/**
 * GCC Base Validator
 * Common validation patterns for GCC countries (Saudi, Oman, Qatar, Bahrain)
 */

import { BaseValidator, ValidationResult } from './base'
import type { CountryConfig } from '../index'

export class GCCBaseValidator implements BaseValidator {
  constructor(
    protected config: CountryConfig,
    protected countryName: string
  ) {}

  validateRegistrationId(cr: string): ValidationResult {
    if (!cr || cr.trim().length === 0) {
      return {
        isValid: false,
        error: `Commercial Registration (CR) is required for ${this.countryName}`
      }
    }

    // Commercial Registration format varies by GCC country
    // Common format: 6-15 alphanumeric characters
    // Examples: 1234567, CR-123456, 123456789012345
    const crPattern = /^[A-Z0-9-]{6,20}$/

    const normalized = cr.trim().toUpperCase().replace(/\s+/g, '')

    if (!crPattern.test(normalized)) {
      return {
        isValid: false,
        error: `Invalid Commercial Registration format for ${this.countryName}. Expected: 6-20 alphanumeric characters`,
        normalized
      }
    }

    return {
      isValid: true,
      normalized
    }
  }

  validateTaxId(vatNumber: string): ValidationResult {
    if (!vatNumber || vatNumber.trim().length === 0) {
      return {
        isValid: false,
        error: 'VAT Registration Number is required'
      }
    }

    // GCC VAT numbers: typically 15 digits
    // Format varies slightly by country
    const vatPattern = /^[0-9]{10,15}$/

    const normalized = vatNumber.trim().replace(/\s+/g, '')

    if (!vatPattern.test(normalized)) {
      return {
        isValid: false,
        error: 'Invalid VAT Registration Number format. Expected: 10-15 digits',
        normalized
      }
    }

    return {
      isValid: true,
      normalized
    }
  }

  validatePostalCode(postalCode: string): ValidationResult {
    // GCC countries may or may not use postal codes
    // Some use P.O. Box numbers
    if (!postalCode || postalCode.trim().length === 0) {
      return {
        isValid: false,
        error: 'Postal Code is required'
      }
    }

    // Accept various formats
    const postalPattern = /^[0-9A-Z\s-]{3,10}$/i

    const normalized = postalCode.trim().toUpperCase()

    if (!postalPattern.test(normalized)) {
      return {
        isValid: false,
        error: 'Invalid Postal Code format',
        normalized
      }
    }

    return {
      isValid: true,
      normalized
    }
  }
}
