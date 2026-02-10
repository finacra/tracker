/**
 * Validation Rules for Bulk Compliance Template Upload
 */

import {
  CSVTemplateRow,
  CATEGORIES,
  COMPLIANCE_TYPES,
  ENTITY_TYPES,
  INDUSTRIES,
  INDUSTRY_CATEGORIES
} from './csv-template'

// ============================================
// VALIDATION RESULT TYPES
// ============================================

export interface CellValidation {
  row: number
  column: string
  columnIndex: number
  valid: boolean
  message?: string
}

export interface RowValidation {
  row: number
  valid: boolean
  errors: CellValidation[]
}

export interface ValidationResult {
  valid: boolean
  totalRows: number
  validRows: number
  invalidRows: number
  errors: CellValidation[]
  rowValidations: RowValidation[]
}

// ============================================
// FIELD VALIDATORS
// ============================================

type FieldValidator = (value: string, row: CSVTemplateRow) => { valid: boolean; message?: string }

const validators: Record<keyof CSVTemplateRow, FieldValidator> = {
  category: (value) => {
    if (!value) return { valid: false, message: 'Category is required' }
    if (!CATEGORIES.includes(value as typeof CATEGORIES[number])) {
      return { valid: false, message: `Invalid category. Allowed: ${CATEGORIES.join(', ')}` }
    }
    return { valid: true }
  },

  requirement: (value) => {
    if (!value) return { valid: false, message: 'Requirement name is required' }
    if (value.length < 3) return { valid: false, message: 'Requirement name must be at least 3 characters' }
    if (value.length > 200) return { valid: false, message: 'Requirement name must be less than 200 characters' }
    return { valid: true }
  },

  description: () => {
    // Description is optional
    return { valid: true }
  },

  compliance_type: (value) => {
    if (!value) return { valid: false, message: 'Compliance type is required' }
    if (!COMPLIANCE_TYPES.includes(value as typeof COMPLIANCE_TYPES[number])) {
      return { valid: false, message: `Invalid type. Allowed: ${COMPLIANCE_TYPES.join(', ')}` }
    }
    return { valid: true }
  },

  entity_types: (value) => {
    if (!value) return { valid: false, message: 'At least one entity type is required' }
    const types = value.split(',').map(t => t.trim())
    const invalid = types.filter(t => !ENTITY_TYPES.includes(t as typeof ENTITY_TYPES[number]))
    if (invalid.length > 0) {
      return { valid: false, message: `Invalid entity types: ${invalid.join(', ')}` }
    }
    return { valid: true }
  },

  industries: (value) => {
    if (!value) return { valid: false, message: 'At least one industry is required' }
    const industries = value.split(',').map(t => t.trim())
    const invalid = industries.filter(t => !INDUSTRIES.includes(t as typeof INDUSTRIES[number]))
    if (invalid.length > 0) {
      return { valid: false, message: `Invalid industries: ${invalid.join(', ')}` }
    }
    return { valid: true }
  },

  industry_categories: (value) => {
    if (!value) return { valid: false, message: 'At least one industry category is required' }
    const categories = value.split(',').map(t => t.trim())
    const invalid = categories.filter(t => !INDUSTRY_CATEGORIES.includes(t as typeof INDUSTRY_CATEGORIES[number]))
    if (invalid.length > 0) {
      return { valid: false, message: `Invalid categories: ${invalid.join(', ')}` }
    }
    return { valid: true }
  },

  due_date_offset: (value, row) => {
    if (row.compliance_type === 'monthly') {
      if (!value) return { valid: false, message: 'Due date offset required for monthly compliance' }
      const num = parseInt(value, 10)
      if (isNaN(num) || num < 1 || num > 28) {
        return { valid: false, message: 'Due date offset must be 1-28 for monthly' }
      }
    }
    return { valid: true }
  },

  due_month: (value, row) => {
    if (row.compliance_type === 'quarterly' || row.compliance_type === 'annual') {
      if (!value) return { valid: false, message: 'Due month required for quarterly/annual compliance' }
      const num = parseInt(value, 10)
      if (isNaN(num) || num < 1 || num > 12) {
        return { valid: false, message: 'Due month must be 1-12' }
      }
    }
    return { valid: true }
  },

  due_day: (value, row) => {
    if (row.compliance_type === 'quarterly' || row.compliance_type === 'annual') {
      if (!value) return { valid: false, message: 'Due day required for quarterly/annual compliance' }
      const num = parseInt(value, 10)
      if (isNaN(num) || num < 1 || num > 31) {
        return { valid: false, message: 'Due day must be 1-31' }
      }
    }
    return { valid: true }
  },

  due_date: (value, row) => {
    if (row.compliance_type === 'one-time') {
      if (!value) return { valid: false, message: 'Due date required for one-time compliance' }
      // Validate date format YYYY-MM-DD
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(value)) {
        return { valid: false, message: 'Due date must be in YYYY-MM-DD format' }
      }
      const date = new Date(value)
      if (isNaN(date.getTime())) {
        return { valid: false, message: 'Invalid date' }
      }
    }
    return { valid: true }
  },

  year_type: (value, row) => {
    // Year type is optional, but if provided for quarterly compliance, must be FY or CY
    if (row.compliance_type === 'quarterly' && value) {
      const upper = value.toUpperCase().trim()
      if (upper !== 'FY' && upper !== 'CY') {
        return { valid: false, message: 'Year type must be FY (Financial Year) or CY (Calendar Year)' }
      }
    }
    return { valid: true }
  },

  penalty: () => {
    // Penalty description is optional
    return { valid: true }
  },

  penalty_type: (value) => {
    if (value && !['daily', 'flat', 'interest', 'percentage'].includes(value)) {
      return { valid: false, message: 'Penalty type must be: daily, flat, interest, or percentage' }
    }
    return { valid: true }
  },

  penalty_rate: (value, row) => {
    if (row.penalty_type && value) {
      const num = parseFloat(value)
      if (isNaN(num) || num < 0) {
        return { valid: false, message: 'Penalty rate must be a positive number' }
      }
    }
    return { valid: true }
  },

  penalty_cap: (value) => {
    if (value) {
      const num = parseFloat(value)
      if (isNaN(num) || num < 0) {
        return { valid: false, message: 'Penalty cap must be a positive number' }
      }
    }
    return { valid: true }
  },

  required_documents: () => {
    // Optional comma-separated list
    return { valid: true }
  },

  possible_legal_action: () => {
    // Optional text
    return { valid: true }
  },

  is_critical: (value) => {
    if (value && !['true', 'false', '1', '0', ''].includes(value.toLowerCase())) {
      return { valid: false, message: 'Is critical must be true or false' }
    }
    return { valid: true }
  },

  is_active: (value) => {
    if (value && !['true', 'false', '1', '0', ''].includes(value.toLowerCase())) {
      return { valid: false, message: 'Is active must be true or false' }
    }
    return { valid: true }
  }
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate a single cell
 */
export function validateCell(
  column: keyof CSVTemplateRow,
  value: string,
  row: CSVTemplateRow,
  rowIndex: number,
  columnIndex: number
): CellValidation {
  const validator = validators[column]
  const result = validator(value, row)
  
  return {
    row: rowIndex,
    column,
    columnIndex,
    valid: result.valid,
    message: result.message
  }
}

/**
 * Validate a complete row
 */
export function validateRow(row: CSVTemplateRow, rowIndex: number): RowValidation {
  const columns = Object.keys(validators) as (keyof CSVTemplateRow)[]
  const errors: CellValidation[] = []
  
  columns.forEach((column, columnIndex) => {
    const validation = validateCell(column, row[column], row, rowIndex, columnIndex)
    if (!validation.valid) {
      errors.push(validation)
    }
  })
  
  return {
    row: rowIndex,
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate all rows
 */
export function validateAll(rows: CSVTemplateRow[]): ValidationResult {
  const rowValidations: RowValidation[] = []
  const allErrors: CellValidation[] = []
  
  rows.forEach((row, index) => {
    const validation = validateRow(row, index)
    rowValidations.push(validation)
    allErrors.push(...validation.errors)
  })
  
  const validRows = rowValidations.filter(v => v.valid).length
  
  return {
    valid: allErrors.length === 0,
    totalRows: rows.length,
    validRows,
    invalidRows: rows.length - validRows,
    errors: allErrors,
    rowValidations
  }
}

/**
 * Get column index by name
 */
export function getColumnIndex(column: keyof CSVTemplateRow): number {
  const columns: (keyof CSVTemplateRow)[] = [
    'category',
    'requirement',
    'description',
    'compliance_type',
    'entity_types',
    'industries',
    'industry_categories',
    'due_date_offset',
    'due_month',
    'due_day',
    'due_date',
    'year_type',
    'penalty',
    'penalty_type',
    'penalty_rate',
    'penalty_cap',
    'required_documents',
    'possible_legal_action',
    'is_critical',
    'is_active'
  ]
  return columns.indexOf(column)
}

/**
 * Get column name by index
 */
export function getColumnName(index: number): keyof CSVTemplateRow | null {
  const columns: (keyof CSVTemplateRow)[] = [
    'category',
    'requirement',
    'description',
    'compliance_type',
    'entity_types',
    'industries',
    'industry_categories',
    'due_date_offset',
    'due_month',
    'due_day',
    'due_date',
    'year_type',
    'penalty',
    'penalty_type',
    'penalty_rate',
    'penalty_cap',
    'required_documents',
    'possible_legal_action',
    'is_critical',
    'is_active'
  ]
  return columns[index] || null
}
