/**
 * CSV Template Generator and Parser for Bulk Compliance Template Upload
 */

// ============================================
// CONSTANTS - Allowed Values
// ============================================

export const CATEGORIES = [
  'Income Tax',
  'GST',
  'Labour Law',
  'RoC',
  'LLP Act',
  'Prof. Tax',
  'Renewals',
  'Other'
] as const

export const COMPLIANCE_TYPES = [
  'one-time',
  'monthly',
  'quarterly',
  'annual'
] as const

export const ENTITY_TYPES = [
  'Private Limited Company',
  'Public Limited Company',
  'LLP',
  'Partnership Firm',
  'Sole Proprietorship',
  'NGO / Section 8',
  'Trust / Society',
  'OPC (One Person Company)',
  'Foreign Company'
] as const

export const INDUSTRIES = [
  'IT & Technology Services',
  'Healthcare',
  'Education',
  'Finance',
  'Food Manufacturing',
  'Food & Hospitality',
  'Construction',
  'Real Estate',
  'Manufacturing',
  'Retail & Trading',
  'Professional Services',
  'Ecommerce',
  'Other'
] as const

export const INDUSTRY_CATEGORIES = [
  'Startups & MSMEs',
  'Large Enterprises',
  'NGOs & Section 8 Companies',
  'Healthcare & Education',
  'Real Estate & Construction',
  'IT & Technology Services',
  'Retail & Manufacturing',
  'Ecommerce & D2C',
  'Other'
] as const

// ============================================
// CSV COLUMN DEFINITIONS
// ============================================

export interface CSVTemplateRow {
  category: string
  requirement: string
  description: string
  compliance_type: string
  entity_types: string // comma-separated
  industries: string // comma-separated
  industry_categories: string // comma-separated
  due_date_offset: string // number for monthly (day of month)
  due_month: string // number 1-12 for quarterly/annual
  due_day: string // number 1-31 for quarterly/annual
  due_date: string // YYYY-MM-DD for one-time
  penalty: string
  penalty_type: string // daily, flat, interest, percentage
  penalty_rate: string // number
  penalty_cap: string // number
  required_documents: string // comma-separated
  possible_legal_action: string
  is_critical: string // true/false
  is_active: string // true/false
}

export const CSV_COLUMNS: (keyof CSVTemplateRow)[] = [
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
  'penalty',
  'penalty_type',
  'penalty_rate',
  'penalty_cap',
  'required_documents',
  'possible_legal_action',
  'is_critical',
  'is_active'
]

export const CSV_COLUMN_HEADERS: Record<keyof CSVTemplateRow, string> = {
  category: 'Category *',
  requirement: 'Requirement Name *',
  description: 'Description',
  compliance_type: 'Compliance Type *',
  entity_types: 'Entity Types * (comma-separated)',
  industries: 'Industries * (comma-separated)',
  industry_categories: 'Industry Categories * (comma-separated)',
  due_date_offset: 'Due Date Offset (for monthly: day 1-28)',
  due_month: 'Due Month (1-12 for quarterly/annual)',
  due_day: 'Due Day (1-31 for quarterly/annual)',
  due_date: 'Due Date (YYYY-MM-DD for one-time)',
  penalty: 'Penalty Description',
  penalty_type: 'Penalty Type (daily/flat/interest/percentage)',
  penalty_rate: 'Penalty Rate (number)',
  penalty_cap: 'Penalty Cap (number)',
  required_documents: 'Required Documents (comma-separated)',
  possible_legal_action: 'Possible Legal Action',
  is_critical: 'Is Critical (true/false)',
  is_active: 'Is Active (true/false)'
}

// ============================================
// EXAMPLE ROWS
// ============================================

export const EXAMPLE_ROWS: CSVTemplateRow[] = [
  {
    category: 'GST',
    requirement: 'GSTR-3B - Monthly Summary Return',
    description: 'Monthly GST summary return with tax payment',
    compliance_type: 'monthly',
    entity_types: 'Private Limited Company,LLP,Partnership Firm',
    industries: 'IT & Technology Services,Manufacturing,Retail & Trading,Ecommerce',
    industry_categories: 'Startups & MSMEs,Large Enterprises',
    due_date_offset: '20',
    due_month: '',
    due_day: '',
    due_date: '',
    penalty: '50/day (NIL: 20/day)',
    penalty_type: 'daily',
    penalty_rate: '50',
    penalty_cap: '',
    required_documents: 'GSTR-3B Filed Copy,Payment Challan',
    possible_legal_action: 'Interest u/s 50 + Late fee u/s 47',
    is_critical: 'true',
    is_active: 'true'
  },
  {
    category: 'Income Tax',
    requirement: 'TDS Return - Form 24Q/26Q',
    description: 'Quarterly TDS return for salary and non-salary deductions',
    compliance_type: 'quarterly',
    entity_types: 'Private Limited Company,Public Limited Company,LLP',
    industries: 'IT & Technology Services,Healthcare,Finance,Professional Services',
    industry_categories: 'Startups & MSMEs,Large Enterprises',
    due_date_offset: '',
    due_month: '1',
    due_day: '31',
    due_date: '',
    penalty: '200/day (max Rs. 1 Lakh)',
    penalty_type: 'daily',
    penalty_rate: '200',
    penalty_cap: '100000',
    required_documents: 'Form 24Q,Form 26Q,TDS Certificates',
    possible_legal_action: 'Penalty u/s 271H',
    is_critical: 'true',
    is_active: 'true'
  },
  {
    category: 'RoC',
    requirement: 'AOC-4 - Filing of Financial Statements',
    description: 'Annual filing of company financial statements with RoC',
    compliance_type: 'annual',
    entity_types: 'Private Limited Company,Public Limited Company,OPC (One Person Company)',
    industries: 'IT & Technology Services,Healthcare,Education,Finance,Manufacturing,Retail & Trading,Ecommerce',
    industry_categories: 'Startups & MSMEs,Large Enterprises',
    due_date_offset: '',
    due_month: '11',
    due_day: '30',
    due_date: '',
    penalty: '100/day (max Rs. 5 Lakh)',
    penalty_type: 'daily',
    penalty_rate: '100',
    penalty_cap: '500000',
    required_documents: 'AOC-4 Form,Financial Statements,Audit Report,Board Resolution',
    possible_legal_action: 'Prosecution u/s 137',
    is_critical: 'true',
    is_active: 'true'
  },
  {
    category: 'RoC',
    requirement: 'Company Registration - New Incorporation',
    description: 'One-time company registration with RoC',
    compliance_type: 'one-time',
    entity_types: 'Private Limited Company,Public Limited Company,OPC (One Person Company)',
    industries: 'IT & Technology Services,Healthcare,Education,Finance,Manufacturing,Ecommerce',
    industry_categories: 'Startups & MSMEs',
    due_date_offset: '',
    due_month: '',
    due_day: '',
    due_date: '2025-03-31',
    penalty: '',
    penalty_type: '',
    penalty_rate: '',
    penalty_cap: '',
    required_documents: 'MOA,AOA,DIR-2,INC-9,Declaration',
    possible_legal_action: '',
    is_critical: 'false',
    is_active: 'true'
  },
  // FLAT PENALTY EXAMPLE
  {
    category: 'RoC',
    requirement: 'MSME Form I - Half-yearly Return',
    description: 'Return of outstanding dues to MSME suppliers exceeding 45 days',
    compliance_type: 'quarterly',
    entity_types: 'Private Limited Company,Public Limited Company',
    industries: 'Manufacturing,Retail & Trading,Ecommerce',
    industry_categories: 'Startups & MSMEs,Large Enterprises',
    due_date_offset: '',
    due_month: '4',
    due_day: '30',
    due_date: '',
    penalty: 'Rs. 25,000 to Rs. 3,00,000 (flat)',
    penalty_type: 'flat',
    penalty_rate: '25000',
    penalty_cap: '300000',
    required_documents: 'MSME Form I,Supplier Details,Payment Records',
    possible_legal_action: 'Penalty u/s 405',
    is_critical: 'true',
    is_active: 'true'
  },
  // INTEREST PENALTY EXAMPLE
  {
    category: 'Labour Law',
    requirement: 'PF ECR - Monthly PF Payment & Return',
    description: 'Provident Fund payment and Electronic Challan cum Return filing',
    compliance_type: 'monthly',
    entity_types: 'Private Limited Company,Public Limited Company,LLP,Partnership Firm',
    industries: 'IT & Technology Services,Healthcare,Manufacturing,Retail & Trading,Ecommerce',
    industry_categories: 'Startups & MSMEs,Large Enterprises',
    due_date_offset: '15',
    due_month: '',
    due_day: '',
    due_date: '',
    penalty: '12% p.a. interest + 5%-25% penal damages',
    penalty_type: 'interest',
    penalty_rate: '12',
    penalty_cap: '',
    required_documents: 'PF ECR,Payment Challan,Employee Details',
    possible_legal_action: 'Prosecution under EPF Act',
    is_critical: 'true',
    is_active: 'true'
  },
  // PERCENTAGE PENALTY EXAMPLE
  {
    category: 'Income Tax',
    requirement: 'Tax Audit Report - Form 3CA/3CB/3CD',
    description: 'Annual tax audit report for businesses with turnover above threshold',
    compliance_type: 'annual',
    entity_types: 'Private Limited Company,Public Limited Company,LLP,Partnership Firm',
    industries: 'IT & Technology Services,Healthcare,Finance,Manufacturing,Retail & Trading,Ecommerce',
    industry_categories: 'Large Enterprises',
    due_date_offset: '',
    due_month: '10',
    due_day: '31',
    due_date: '',
    penalty: '0.5% of turnover (max Rs. 1,50,000)',
    penalty_type: 'percentage',
    penalty_rate: '0.5',
    penalty_cap: '150000',
    required_documents: 'Form 3CA,Form 3CB,Form 3CD,Audit Report',
    possible_legal_action: 'Penalty u/s 271B',
    is_critical: 'true',
    is_active: 'true'
  },
  // ANOTHER INTEREST EXAMPLE - ESI
  {
    category: 'Labour Law',
    requirement: 'ESI Challan - Monthly ESI Payment',
    description: 'Employee State Insurance contribution payment',
    compliance_type: 'monthly',
    entity_types: 'Private Limited Company,Public Limited Company,LLP,Partnership Firm',
    industries: 'IT & Technology Services,Healthcare,Manufacturing,Retail & Trading',
    industry_categories: 'Startups & MSMEs,Large Enterprises',
    due_date_offset: '15',
    due_month: '',
    due_day: '',
    due_date: '',
    penalty: '12% p.a. simple interest on delayed payment',
    penalty_type: 'interest',
    penalty_rate: '12',
    penalty_cap: '',
    required_documents: 'ESI Challan,Payment Receipt,Employee List',
    possible_legal_action: 'Prosecution under ESI Act',
    is_critical: 'true',
    is_active: 'true'
  }
]

// ============================================
// CSV GENERATION
// ============================================

/**
 * Generate CSV template with headers and example rows
 */
export function generateCSVTemplate(includeExamples: boolean = true): string {
  const headers = CSV_COLUMNS.map(col => CSV_COLUMN_HEADERS[col])
  const rows: string[][] = [headers]

  if (includeExamples) {
    EXAMPLE_ROWS.forEach(row => {
      rows.push(CSV_COLUMNS.map(col => escapeCSVValue(row[col])))
    })
  }

  return rows.map(row => row.join(',')).join('\n')
}

/**
 * Escape a value for CSV (handle commas, quotes, newlines)
 */
function escapeCSVValue(value: string): string {
  if (!value) return ''
  
  // If the value contains comma, quote, or newline, wrap in quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Download CSV template as a file
 */
export function downloadCSVTemplate(): void {
  const csv = generateCSVTemplate(true)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', 'compliance_templates_upload.csv')
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// ============================================
// CSV PARSING
// ============================================

/**
 * Parse CSV string into array of template rows
 */
export function parseCSV(csvContent: string): CSVTemplateRow[] {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim())
  
  if (lines.length < 2) {
    return []
  }

  // Skip header row
  const dataLines = lines.slice(1)
  
  return dataLines.map(line => {
    const values = parseCSVLine(line)
    const row: Partial<CSVTemplateRow> = {}
    
    CSV_COLUMNS.forEach((col, idx) => {
      row[col] = values[idx] || ''
    })
    
    return row as CSVTemplateRow
  })
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"'
        i++ // Skip next quote
      } else if (char === '"') {
        inQuotes = false
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
  }
  
  result.push(current.trim())
  return result
}

// ============================================
// CONVERSION TO TEMPLATE OBJECT
// ============================================

export interface ParsedTemplate {
  category: string
  requirement: string
  description: string
  compliance_type: 'one-time' | 'monthly' | 'quarterly' | 'annual'
  entity_types: string[]
  industries: string[]
  industry_categories: string[]
  due_date_offset: number | null
  due_month: number | null
  due_day: number | null
  due_date: string | null
  penalty: string | null
  penalty_config: Record<string, unknown> | null
  required_documents: string[]
  possible_legal_action: string | null
  is_critical: boolean
  is_active: boolean
}

/**
 * Convert CSV row to ParsedTemplate object
 */
export function csvRowToTemplate(row: CSVTemplateRow): ParsedTemplate {
  // Parse comma-separated arrays
  const parseArray = (value: string): string[] => {
    if (!value) return []
    return value.split(',').map(v => v.trim()).filter(v => v)
  }

  // Parse number or null
  const parseNumber = (value: string): number | null => {
    if (!value) return null
    const num = parseInt(value, 10)
    return isNaN(num) ? null : num
  }

  // Parse boolean
  const parseBoolean = (value: string): boolean => {
    return value.toLowerCase() === 'true' || value === '1'
  }

  // Build penalty_config from penalty fields
  let penalty_config: Record<string, unknown> | null = null
  if (row.penalty_type && row.penalty_rate) {
    const rate = parseFloat(row.penalty_rate)
    const cap = row.penalty_cap ? parseFloat(row.penalty_cap) : undefined
    
    if (!isNaN(rate)) {
      penalty_config = {
        type: row.penalty_type,
        rate: rate
      }
      if (cap && !isNaN(cap)) {
        penalty_config.cap = cap
      }
    }
  }

  return {
    category: row.category,
    requirement: row.requirement,
    description: row.description || '',
    compliance_type: row.compliance_type as 'one-time' | 'monthly' | 'quarterly' | 'annual',
    entity_types: parseArray(row.entity_types),
    industries: parseArray(row.industries),
    industry_categories: parseArray(row.industry_categories),
    due_date_offset: parseNumber(row.due_date_offset),
    due_month: parseNumber(row.due_month),
    due_day: parseNumber(row.due_day),
    due_date: row.due_date || null,
    penalty: row.penalty || null,
    penalty_config,
    required_documents: parseArray(row.required_documents),
    possible_legal_action: row.possible_legal_action || null,
    is_critical: parseBoolean(row.is_critical),
    is_active: parseBoolean(row.is_active)
  }
}
