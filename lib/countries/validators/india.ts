/**
 * India Validator
 * Implements validation for India-specific fields: CIN, DIN, PAN, GST
 */

import { BaseValidator, ValidationResult } from './base'
import type { CountryConfig } from '../index'

export class IndiaValidator implements BaseValidator {
  constructor(private config: CountryConfig) {}

  validateRegistrationId(cin: string): ValidationResult {
    if (!cin || cin.trim().length === 0) {
      return {
        isValid: false,
        error: 'CIN (Corporate Identification Number) is required'
      }
    }

    // CIN format: U12345AB2024ABC123456
    // Format: [C] [LL] [NNNNN] [LL] [YYYY] [LLL] [NNNNNN]
    // C = Company type (U, L, C, etc.)
    // LL = State code (2 letters)
    // NNNNN = Year of incorporation (5 digits)
    // LL = Entity type (2 letters)
    // YYYY = Year (4 digits)
    // LLL = Serial number (3 letters)
    // NNNNNN = Registration number (6 digits)
    const cinPattern = /^[ULC][A-Z]{2}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/

    const normalized = cin.trim().toUpperCase().replace(/\s+/g, '')

    if (!cinPattern.test(normalized)) {
      return {
        isValid: false,
        error: 'Invalid CIN format. Expected format: U12345AB2024ABC123456',
        normalized
      }
    }

    return {
      isValid: true,
      normalized
    }
  }

  validateTaxId(pan: string): ValidationResult {
    if (!pan || pan.trim().length === 0) {
      return {
        isValid: false,
        error: 'PAN (Permanent Account Number) is required'
      }
    }

    // PAN format: ABCDE1234F
    // Format: [AAAAA] [NNNN] [A]
    // AAAAA = 5 uppercase letters (first 3 are alphabetic series, 4th is status, 5th is first letter of surname)
    // NNNN = 4 digits
    // A = 1 uppercase letter (check digit)
    const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/

    const normalized = pan.trim().toUpperCase().replace(/\s+/g, '')

    if (!panPattern.test(normalized)) {
      return {
        isValid: false,
        error: 'Invalid PAN format. Expected format: ABCDE1234F',
        normalized
      }
    }

    return {
      isValid: true,
      normalized
    }
  }

  validateDirectorId(din: string): ValidationResult {
    if (!din || din.trim().length === 0) {
      return {
        isValid: false,
        error: 'DIN (Director Identification Number) is required'
      }
    }

    // DIN format: 1234567890123456 (16 digits)
    const dinPattern = /^[0-9]{16}$/

    const normalized = din.trim().replace(/\s+/g, '')

    if (!dinPattern.test(normalized)) {
      return {
        isValid: false,
        error: 'Invalid DIN format. Expected format: 16 digits',
        normalized
      }
    }

    return {
      isValid: true,
      normalized
    }
  }

  validatePostalCode(pin: string): ValidationResult {
    if (!pin || pin.trim().length === 0) {
      return {
        isValid: false,
        error: 'PIN Code is required'
      }
    }

    // Indian PIN code: 6 digits
    const pinPattern = /^[0-9]{6}$/

    const normalized = pin.trim().replace(/\s+/g, '')

    if (!pinPattern.test(normalized)) {
      return {
        isValid: false,
        error: 'Invalid PIN Code format. Expected format: 6 digits',
        normalized
      }
    }

    return {
      isValid: true,
      normalized
    }
  }

  /**
   * Validate GSTIN (GST Identification Number)
   * Format: 15 characters - 2 state code + 10 PAN + 3 entity + 1 check digit
   */
  validateGSTIN(gstin: string): ValidationResult {
    if (!gstin || gstin.trim().length === 0) {
      return {
        isValid: false,
        error: 'GSTIN is required'
      }
    }

    // GSTIN format: 27AADCB2230M1Z5
    // Format: [SS] [PAN] [XXX] [C]
    // SS = State code (2 digits)
    // PAN = 10 characters (PAN format)
    // XXX = Entity number (3 alphanumeric)
    // C = Check digit (1 alphanumeric)
    const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/

    const normalized = gstin.trim().toUpperCase().replace(/\s+/g, '')

    if (!gstinPattern.test(normalized)) {
      return {
        isValid: false,
        error: 'Invalid GSTIN format. Expected format: 15 alphanumeric characters',
        normalized
      }
    }

    return {
      isValid: true,
      normalized
    }
  }
}
