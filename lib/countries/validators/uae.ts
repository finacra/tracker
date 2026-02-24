/**
 * UAE Validator
 * Implements validation for UAE-specific fields: Trade License, Emirates ID
 */

import { BaseValidator, ValidationResult } from './base'
import type { CountryConfig } from '../index'

export class UAEValidator implements BaseValidator {
  constructor(private config: CountryConfig) {}

  validateRegistrationId(tradeLicense: string): ValidationResult {
    if (!tradeLicense || tradeLicense.trim().length === 0) {
      return {
        isValid: false,
        error: 'Trade License Number is required'
      }
    }

    // UAE Trade License format varies by emirate
    // Common formats: 6-10 alphanumeric characters
    // Examples: 1234567, TL-123456, 1234567890
    const tradeLicensePattern = /^[A-Z0-9-]{6,15}$/

    const normalized = tradeLicense.trim().toUpperCase().replace(/\s+/g, '')

    if (!tradeLicensePattern.test(normalized)) {
      return {
        isValid: false,
        error: 'Invalid Trade License format. Expected: 6-15 alphanumeric characters',
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

    // UAE VAT number format: 15 digits (Tax Registration Number)
    // Format: 100000000000003 (example)
    const vatPattern = /^[0-9]{15}$/

    const normalized = vatNumber.trim().replace(/\s+/g, '')

    if (!vatPattern.test(normalized)) {
      return {
        isValid: false,
        error: 'Invalid VAT Registration Number format. Expected: 15 digits',
        normalized
      }
    }

    return {
      isValid: true,
      normalized
    }
  }

  validatePostalCode(pobox: string): ValidationResult {
    // UAE uses P.O. Box numbers, not traditional postal codes
    // Format: P.O. Box 12345 or just numbers
    if (!pobox || pobox.trim().length === 0) {
      return {
        isValid: false,
        error: 'P.O. Box is required'
      }
    }

    // Accept various formats: 12345, P.O. Box 12345, PO Box 12345
    const poboxPattern = /^(P\.?O\.?\s*Box\s*)?[0-9]{1,6}$/i

    const normalized = pobox.trim()

    if (!poboxPattern.test(normalized)) {
      return {
        isValid: false,
        error: 'Invalid P.O. Box format',
        normalized
      }
    }

    return {
      isValid: true,
      normalized
    }
  }

  /**
   * Validate Emirates ID
   * Format: 15 digits (784-YYYY-NNNNNNN-C)
   */
  validateEmiratesID(emiratesId: string): ValidationResult {
    if (!emiratesId || emiratesId.trim().length === 0) {
      return {
        isValid: false,
        error: 'Emirates ID is required'
      }
    }

    // Emirates ID format: 784-YYYY-NNNNNNN-C (with or without dashes)
    // 784 = Country code for UAE
    // YYYY = Year of birth
    // NNNNNNN = 7-digit serial number
    // C = Check digit
    const emiratesIdPattern = /^784[-\s]?[0-9]{4}[-\s]?[0-9]{7}[-\s]?[0-9]{1}$/

    const normalized = emiratesId.trim().replace(/[-\s]/g, '')

    if (!emiratesIdPattern.test(emiratesId.replace(/[-\s]/g, ''))) {
      return {
        isValid: false,
        error: 'Invalid Emirates ID format. Expected: 784-YYYY-NNNNNNN-C',
        normalized
      }
    }

    return {
      isValid: true,
      normalized
    }
  }
}
