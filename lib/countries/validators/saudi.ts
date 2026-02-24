/**
 * Saudi Arabia Validator
 */

import { GCCBaseValidator, ValidationResult } from './gcc-base'
import type { CountryConfig } from '../index'

export class SaudiValidator extends GCCBaseValidator {
  constructor(config: CountryConfig) {
    super(config, 'Saudi Arabia')
  }

  validateRegistrationId(cr: string): ValidationResult {
    // Saudi Commercial Registration: 10 digits
    // Format: 1234567890
    if (!cr || cr.trim().length === 0) {
      return {
        isValid: false,
        error: 'Commercial Registration (CR) is required'
      }
    }

    const crPattern = /^[0-9]{10}$/

    const normalized = cr.trim().replace(/\s+/g, '')

    if (!crPattern.test(normalized)) {
      return {
        isValid: false,
        error: 'Invalid Commercial Registration format. Expected: 10 digits',
        normalized
      }
    }

    return {
      isValid: true,
      normalized
    }
  }
}
