/**
 * Base Validator Interfaces
 * Defines the structure for country-specific validators
 */

export interface ValidationResult {
  isValid: boolean
  error?: string
  normalized?: string
  metadata?: Record<string, any>
}

export interface BaseValidator {
  /**
   * Validate registration ID (CIN, Trade License, EIN, etc.)
   */
  validateRegistrationId(id: string): ValidationResult

  /**
   * Validate tax ID (PAN, GST, VAT, etc.)
   */
  validateTaxId(id: string): ValidationResult

  /**
   * Validate director ID (DIN, etc.) - optional, not all countries require this
   */
  validateDirectorId?(id: string): ValidationResult

  /**
   * Validate postal code - optional, format varies by country
   */
  validatePostalCode?(code: string): ValidationResult

  /**
   * Validate state/province - optional, not all countries use this
   */
  validateState?(state: string): ValidationResult
}

/**
 * Extended validator interface for countries with additional validation needs
 */
export interface ExtendedValidator extends BaseValidator {
  /**
   * Validate additional country-specific fields
   */
  validateCustomField?(fieldName: string, value: string): ValidationResult

  /**
   * Get expected format for a field
   */
  getExpectedFormat?(fieldName: string): string | null

  /**
   * Get validation pattern (regex) for a field
   */
  getValidationPattern?(fieldName: string): RegExp | null
}
