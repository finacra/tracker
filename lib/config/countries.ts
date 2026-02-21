/**
 * Country Configuration System
 * Centralized configuration for all supported countries
 */

export interface CountryConfig {
  code: string
  name: string
  region: 'APAC' | 'GCC' | 'NA' | 'EU'
  currency: {
    code: string
    symbol: string
  }
  financialYear: {
    startMonth: number // 1-12 (e.g., 4 for April, 1 for January)
    type: 'FY' | 'CY'
  }
  dateFormat: string
  timezone: string
  labels: {
    taxId: string
    registrationId: string
    directorId?: string
    state?: string // 'State' for US, 'Emirate' for UAE, 'Province' for Saudi
    postalCode: string // 'PIN Code' for India, 'Postal Code' for others
  }
  onboarding: {
    documentTypes: string[]
    entityTypes: string[]
    industryCategories: string[]
    verificationServices?: {
      registration?: boolean // CIN verification for India
      director?: boolean // DIN verification for India
    }
  }
  compliance: {
    defaultCategories: string[]
  }
}

export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  IN: {
    code: 'IN',
    name: 'India',
    region: 'APAC',
    currency: { code: 'INR', symbol: '₹' },
    financialYear: { startMonth: 4, type: 'FY' },
    dateFormat: 'DD/MM/YYYY',
    timezone: 'Asia/Kolkata',
    labels: {
      taxId: 'PAN',
      registrationId: 'CIN',
      directorId: 'DIN',
      state: 'State',
      postalCode: 'PIN Code'
    },
    onboarding: {
      documentTypes: [
        'Certificate of Incorporation',
        'MOA (Memorandum of Association)',
        'AOA (Articles of Association)',
        'Rental Deed',
        'DIN Certificate',
        'PAN',
        'TAN'
      ],
      entityTypes: [
        'Private Limited',
        'Public Limited',
        'LLP',
        'Partnership',
        'Sole Proprietorship'
      ],
      industryCategories: [
        'Startups & MSMEs',
        'Large Enterprises',
        'NGOs & Section 8 Companies',
        'Healthcare & Education',
        'Real Estate & Construction',
        'IT & Technology Services',
        'Retail & Manufacturing',
        'Food & Hospitality',
        'Other'
      ],
      verificationServices: {
        registration: true, // CIN verification
        director: true // DIN verification
      }
    },
    compliance: {
      defaultCategories: ['Income Tax', 'GST', 'Payroll', 'RoC', 'Renewals', 'Others']
    }
  },
  AE: {
    code: 'AE',
    name: 'United Arab Emirates',
    region: 'GCC',
    currency: { code: 'AED', symbol: 'د.إ' },
    financialYear: { startMonth: 1, type: 'CY' },
    dateFormat: 'DD/MM/YYYY',
    timezone: 'Asia/Dubai',
    labels: {
      taxId: 'Tax Registration Number',
      registrationId: 'Trade License Number',
      state: 'Emirate',
      postalCode: 'Postal Code'
    },
    onboarding: {
      documentTypes: [
        'Trade License',
        'Memorandum of Association',
        'Share Certificate',
        'VAT Certificate',
        'Commercial Registration'
      ],
      entityTypes: [
        'LLC',
        'Public Joint Stock Company',
        'Private Joint Stock Company',
        'Branch Office',
        'Representative Office'
      ],
      industryCategories: [
        'Trading',
        'Services',
        'Manufacturing',
        'Real Estate',
        'Hospitality',
        'Other'
      ],
      verificationServices: {}
    },
    compliance: {
      defaultCategories: ['VAT', 'Corporate Tax', 'Payroll', 'Trade License Renewal', 'Others']
    }
  },
  SA: {
    code: 'SA',
    name: 'Saudi Arabia',
    region: 'GCC',
    currency: { code: 'SAR', symbol: '﷼' },
    financialYear: { startMonth: 1, type: 'CY' },
    dateFormat: 'DD/MM/YYYY',
    timezone: 'Asia/Riyadh',
    labels: {
      taxId: 'Tax Identification Number',
      registrationId: 'Commercial Registration',
      state: 'Province',
      postalCode: 'Postal Code'
    },
    onboarding: {
      documentTypes: [
        'Commercial Registration',
        'Memorandum of Association',
        'Share Certificate',
        'VAT Certificate'
      ],
      entityTypes: [
        'Limited Liability Company',
        'Joint Stock Company',
        'Partnership',
        'Branch Office'
      ],
      industryCategories: [
        'Trading',
        'Services',
        'Manufacturing',
        'Real Estate',
        'Hospitality',
        'Other'
      ],
      verificationServices: {}
    },
    compliance: {
      defaultCategories: ['VAT', 'Corporate Tax', 'Payroll', 'Commercial Registration Renewal', 'Others']
    }
  },
  OM: {
    code: 'OM',
    name: 'Oman',
    region: 'GCC',
    currency: { code: 'OMR', symbol: 'ر.ع.' },
    financialYear: { startMonth: 1, type: 'CY' },
    dateFormat: 'DD/MM/YYYY',
    timezone: 'Asia/Muscat',
    labels: {
      taxId: 'Tax Card Number',
      registrationId: 'Commercial Registration',
      state: 'Governorate',
      postalCode: 'Postal Code'
    },
    onboarding: {
      documentTypes: [
        'Commercial Registration',
        'Memorandum of Association',
        'Share Certificate',
        'VAT Certificate'
      ],
      entityTypes: [
        'Limited Liability Company',
        'Joint Stock Company',
        'Partnership',
        'Branch Office'
      ],
      industryCategories: [
        'Trading',
        'Services',
        'Manufacturing',
        'Real Estate',
        'Hospitality',
        'Other'
      ],
      verificationServices: {}
    },
    compliance: {
      defaultCategories: ['VAT', 'Corporate Tax', 'Payroll', 'Commercial Registration Renewal', 'Others']
    }
  },
  QA: {
    code: 'QA',
    name: 'Qatar',
    region: 'GCC',
    currency: { code: 'QAR', symbol: 'ر.ق' },
    financialYear: { startMonth: 1, type: 'CY' },
    dateFormat: 'DD/MM/YYYY',
    timezone: 'Asia/Qatar',
    labels: {
      taxId: 'Tax Identification Number',
      registrationId: 'Commercial Registration',
      state: 'Municipality',
      postalCode: 'Postal Code'
    },
    onboarding: {
      documentTypes: [
        'Commercial Registration',
        'Memorandum of Association',
        'Share Certificate',
        'VAT Certificate'
      ],
      entityTypes: [
        'Limited Liability Company',
        'Joint Stock Company',
        'Partnership',
        'Branch Office'
      ],
      industryCategories: [
        'Trading',
        'Services',
        'Manufacturing',
        'Real Estate',
        'Hospitality',
        'Other'
      ],
      verificationServices: {}
    },
    compliance: {
      defaultCategories: ['VAT', 'Corporate Tax', 'Payroll', 'Commercial Registration Renewal', 'Others']
    }
  },
  BH: {
    code: 'BH',
    name: 'Bahrain',
    region: 'GCC',
    currency: { code: 'BHD', symbol: '.د.ب' },
    financialYear: { startMonth: 1, type: 'CY' },
    dateFormat: 'DD/MM/YYYY',
    timezone: 'Asia/Bahrain',
    labels: {
      taxId: 'Tax Identification Number',
      registrationId: 'Commercial Registration',
      state: 'Governorate',
      postalCode: 'Postal Code'
    },
    onboarding: {
      documentTypes: [
        'Commercial Registration',
        'Memorandum of Association',
        'Share Certificate',
        'VAT Certificate'
      ],
      entityTypes: [
        'Limited Liability Company',
        'Joint Stock Company',
        'Partnership',
        'Branch Office'
      ],
      industryCategories: [
        'Trading',
        'Services',
        'Manufacturing',
        'Real Estate',
        'Hospitality',
        'Other'
      ],
      verificationServices: {}
    },
    compliance: {
      defaultCategories: ['VAT', 'Corporate Tax', 'Payroll', 'Commercial Registration Renewal', 'Others']
    }
  },
  US: {
    code: 'US',
    name: 'United States',
    region: 'NA',
    currency: { code: 'USD', symbol: '$' },
    financialYear: { startMonth: 1, type: 'CY' },
    dateFormat: 'MM/DD/YYYY',
    timezone: 'America/New_York',
    labels: {
      taxId: 'EIN',
      registrationId: 'State Registration Number',
      state: 'State',
      postalCode: 'ZIP Code'
    },
    onboarding: {
      documentTypes: [
        'Certificate of Incorporation',
        'Articles of Incorporation',
        'Operating Agreement',
        'EIN Certificate',
        'State Registration'
      ],
      entityTypes: [
        'LLC',
        'Corporation (C-Corp)',
        'Corporation (S-Corp)',
        'Partnership',
        'Sole Proprietorship'
      ],
      industryCategories: [
        'Technology',
        'Healthcare',
        'Finance',
        'Retail',
        'Manufacturing',
        'Services',
        'Real Estate',
        'Other'
      ],
      verificationServices: {}
    },
    compliance: {
      defaultCategories: ['Federal Tax', 'State Tax', 'Payroll', 'Business License', 'Others']
    }
  }
}

/**
 * Get country configuration by country code
 */
export function getCountryConfig(countryCode: string): CountryConfig | null {
  if (!countryCode) return null
  return COUNTRY_CONFIGS[countryCode.toUpperCase()] || null
}

/**
 * Get default country configuration (India)
 */
export function getDefaultCountryConfig(): CountryConfig {
  return COUNTRY_CONFIGS['IN']
}

/**
 * Get all countries in a specific region
 */
export function getCountriesByRegion(region: 'APAC' | 'GCC' | 'NA' | 'EU'): CountryConfig[] {
  return Object.values(COUNTRY_CONFIGS).filter(config => config.region === region)
}

/**
 * Check if a country code is supported
 */
export function isCountrySupported(countryCode: string): boolean {
  return countryCode.toUpperCase() in COUNTRY_CONFIGS
}

/**
 * Get all supported country codes
 */
export function getSupportedCountryCodes(): string[] {
  return Object.keys(COUNTRY_CONFIGS)
}
