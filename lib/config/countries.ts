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
  regulatory?: {
    authorities?: {
      tax?: string
      corporate?: string
      labor?: string
      registration?: string
      indirectTax?: string      // NEW: CBIC for India
      laborInsurance?: string   // NEW: ESIC for India
      securities?: string        // NEW: SEBI for India
      customs?: string           // NEW: For future use
    }
    commonForms?: string[]
    documentPatterns?: {
      tax?: string[]
      corporate?: string[]
      labor?: string[]
      notices?: string[]        // NEW: Notice patterns
    }
    noticeTypes?: {              // NEW: Structured notice metadata
      [key: string]: {
        type: string
        formCode: string
        section?: string
        category: string         // Maps to existing categories
        priority: 'low' | 'medium' | 'high'
        description: string
      }
    }
    legalSections?: {            // NEW: Legal section references
      [key: string]: {
        act: string
        section: string
        description: string
        relevance: string
      }
    }
    formFrequencies?: {          // NEW: Filing frequency metadata
      [formName: string]: 'monthly' | 'quarterly' | 'annual' | 'one-time'
    }
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
    },
    regulatory: {
      authorities: {
        tax: 'Central Board of Direct Taxes (CBDT) / Income Tax Department',
        indirectTax: 'Central Board of Indirect Taxes and Customs (CBIC)',
        corporate: 'Ministry of Corporate Affairs (MCA) / Registrar of Companies (RoC)',
        labor: 'Employees\' Provident Fund Organisation (EPFO)',
        laborInsurance: 'Employees\' State Insurance Corporation (ESIC)',
        securities: 'Securities and Exchange Board of India (SEBI)',
        registration: 'Registrar of Companies (RoC)'
      },
      commonForms: [
        // GST Forms
        'GSTR-1', 'GSTR-3B', 'GSTR-4', 'GSTR-5', 'GSTR-5A', 'GSTR-6', 'GSTR-7', 'GSTR-8', 'GSTR-9', 'GSTR-9C', 'CMP-08', 'ITC-04', 'IFF',
        // Income Tax Forms
        'ITR-1', 'ITR-2', 'ITR-3', 'ITR-4', 'ITR-5', 'ITR-6', 'ITR-7', 'Form 24Q', 'Form 26Q', 'Form 27Q', 'Form 27EQ',
        // MCA/RoC Forms
        'AOC-4', 'MGT-7', 'MGT-7A', 'DIR-3 KYC', 'DIR-12', 'PAS-3', 'BEN-2', 'INC-22A', 'ADT-01', 'CRA-2', 'LLP Form 8', 'LLP Form 11',
        // EPFO Forms
        'ECR', 'Form 5A', 'Form 2', 'Form 10C', 'Form 10D', 'Form 19'
      ],
      documentPatterns: {
        tax: [
          'gstr', 'gstr-1', 'gstr-3b', 'gstr-4', 'gstr-5', 'gstr-5a', 'gstr-6', 'gstr-7', 'gstr-8', 'gstr-9', 'gstr-9c',
          'itr', 'itr-1', 'itr-2', 'itr-3', 'itr-4', 'itr-5', 'itr-6', 'itr-7',
          'form 24q', 'form 26q', 'form 27q', 'form 27eq', 'tds', 'tcs',
          'cmp-08', 'itc-04', 'iff'
        ],
        corporate: [
          'mgt', 'mgt-7', 'mgt-7a', 'aoc', 'aoc-4', 'roc',
          'dir-3', 'dir-12', 'pas-3', 'ben-2', 'inc-22a', 'adt-01', 'cra-2',
          'llp form 8', 'llp form 11', 'form 11', 'form 8'
        ],
        labor: [
          'epf', 'epfo', 'esi', 'esic', 'pf', 'labour', 'labor',
          'ecr', 'form 5a', 'form 2', 'form 10c', 'form 10d', 'form 19'
        ],
        notices: [
          'drc-01', 'drc-03', 'drc-06', 'drc-07', 'drc-01a', 'drc-01c',
          'asmt-10', 'asmt-13',
          'section 142', 'section 143', 'section 156', 'section 139', 'section 148', 'section 144', 'section 154', 'section 245',
          'reg-17', 'reg-19', 'cmp-05'
        ]
      },
      noticeTypes: {
        'DRC-01': {
          type: 'Show Cause Notice (SCN)',
          formCode: 'DRC-01',
          section: 'Section 73/74',
          category: 'Others',
          priority: 'high',
          description: 'Demand for unpaid/short-paid tax or wrong ITC claim'
        },
        'DRC-07': {
          type: 'Demand Notice',
          formCode: 'DRC-07',
          section: 'Section 73/74',
          category: 'Others',
          priority: 'high',
          description: 'Summary of order demanding payment of GST dues'
        },
        'ASMT-10': {
          type: 'Scrutiny Notice',
          formCode: 'ASMT-10',
          section: 'Section 65',
          category: 'Others',
          priority: 'high',
          description: 'Notice for scrutiny of returns'
        },
        'ASMT-13': {
          type: 'Assessment Order',
          formCode: 'ASMT-13',
          section: 'Section 63',
          category: 'Others',
          priority: 'high',
          description: 'Assessment order on failure to furnish return'
        },
        'CMP-05': {
          type: 'Compliance Notice',
          formCode: 'CMP-05',
          category: 'Others',
          priority: 'medium',
          description: 'Show cause for denial of composition scheme'
        },
        'REG-17': {
          type: 'Registration Cancellation SCN',
          formCode: 'REG-17',
          section: 'Section 29',
          category: 'Renewals',
          priority: 'high',
          description: 'Show cause notice for GST registration cancellation'
        },
        'REG-19': {
          type: 'Registration Cancellation Order',
          formCode: 'REG-19',
          section: 'Section 29',
          category: 'Renewals',
          priority: 'high',
          description: 'Order cancelling GST registration'
        },
        'Section 142(1)': {
          type: 'Inquiry Notice',
          formCode: 'Section 142(1)',
          section: 'Section 142(1)',
          category: 'Others',
          priority: 'medium',
          description: 'Request for information/documents before assessment'
        },
        'Section 143(2)': {
          type: 'Scrutiny Notice',
          formCode: 'Section 143(2)',
          section: 'Section 143(2)',
          category: 'Others',
          priority: 'high',
          description: 'Detailed scrutiny of filed return (within 6 months of filing)'
        },
        'Section 156': {
          type: 'Demand Notice',
          formCode: 'Section 156',
          section: 'Section 156',
          category: 'Others',
          priority: 'high',
          description: 'Demand for payment of tax, penalty, or fine'
        },
        'Section 139(9)': {
          type: 'Defective Return Notice',
          formCode: 'Section 139(9)',
          section: 'Section 139(9)',
          category: 'Others',
          priority: 'medium',
          description: 'Filed return has errors or missing information'
        }
      },
      legalSections: {
        'GST_Section_73': {
          act: 'CGST Act, 2017',
          section: 'Section 73',
          description: 'Determination of tax not paid/short paid (non-fraud cases)',
          relevance: 'SCN issuance, demand notice — 42-month time limit'
        },
        'GST_Section_74': {
          act: 'CGST Act, 2017',
          section: 'Section 74',
          description: 'Determination of tax in fraud/willful misstatement cases',
          relevance: 'Higher penalties, extended time limits'
        },
        'GST_Section_50': {
          act: 'CGST Act, 2017',
          section: 'Section 50',
          description: 'Interest on delayed payment of tax',
          relevance: 'Interest calculations'
        },
        'GST_Section_122': {
          act: 'CGST Act, 2017',
          section: 'Section 122',
          description: 'Penalties for various offences',
          relevance: 'Penalty provisions'
        },
        'GST_Section_29': {
          act: 'CGST Act, 2017',
          section: 'Section 29',
          description: 'Cancellation of GST registration',
          relevance: 'De-registration'
        },
        'Companies_Section_92': {
          act: 'Companies Act, 2013',
          section: 'Section 92',
          description: 'Annual return (MGT-7)',
          relevance: 'Annual return filing obligation'
        },
        'Companies_Section_137': {
          act: 'Companies Act, 2013',
          section: 'Section 137',
          description: 'Filing of financial statements (AOC-4)',
          relevance: 'Financial statement filing'
        },
        'Companies_Section_12': {
          act: 'Companies Act, 2013',
          section: 'Section 12(9)',
          description: 'ACTIVE Non-Compliant status',
          relevance: 'Company marked as ACTIVE Non-Compliant for failing to file INC-22A'
        },
        'IncomeTax_Section_142': {
          act: 'Income Tax Act, 1961',
          section: 'Section 142(1)',
          description: 'Inquiry before assessment',
          relevance: 'Pre-assessment notice'
        },
        'IncomeTax_Section_143_1': {
          act: 'Income Tax Act, 1961',
          section: 'Section 143(1)',
          description: 'Summary/intimation assessment',
          relevance: 'Automated processing notice'
        },
        'IncomeTax_Section_143_2': {
          act: 'Income Tax Act, 1961',
          section: 'Section 143(2)',
          description: 'Scrutiny assessment',
          relevance: 'Detailed scrutiny'
        },
        'IncomeTax_Section_156': {
          act: 'Income Tax Act, 1961',
          section: 'Section 156',
          description: 'Notice of demand',
          relevance: 'Demand for tax/penalty payment'
        },
        'IncomeTax_Section_139_9': {
          act: 'Income Tax Act, 1961',
          section: 'Section 139(9)',
          description: 'Defective return',
          relevance: 'Defective return notice'
        },
        'IncomeTax_Section_154': {
          act: 'Income Tax Act, 1961',
          section: 'Section 154',
          description: 'Rectification of mistake',
          relevance: 'Rectification request for erroneous demands'
        }
      },
      formFrequencies: {
        // GST Forms
        'GSTR-1': 'monthly',
        'GSTR-3B': 'monthly',
        'GSTR-4': 'quarterly',
        'GSTR-5': 'monthly',
        'GSTR-5A': 'monthly',
        'GSTR-6': 'monthly',
        'GSTR-7': 'monthly',
        'GSTR-8': 'monthly',
        'GSTR-9': 'annual',
        'GSTR-9C': 'annual',
        'CMP-08': 'quarterly',
        'ITC-04': 'quarterly',
        'IFF': 'monthly',
        // Income Tax Forms
        'ITR-1': 'annual',
        'ITR-2': 'annual',
        'ITR-3': 'annual',
        'ITR-4': 'annual',
        'ITR-5': 'annual',
        'ITR-6': 'annual',
        'ITR-7': 'annual',
        'Form 24Q': 'quarterly',
        'Form 26Q': 'quarterly',
        'Form 27Q': 'quarterly',
        'Form 27EQ': 'quarterly',
        // MCA Forms
        'AOC-4': 'annual',
        'MGT-7': 'annual',
        'MGT-7A': 'annual',
        'DIR-3 KYC': 'annual',
        'DIR-12': 'one-time',
        'PAS-3': 'one-time',
        'BEN-2': 'one-time',
        'INC-22A': 'one-time',
        'ADT-01': 'one-time',
        'CRA-2': 'one-time',
        'LLP Form 8': 'annual',
        'LLP Form 11': 'annual',
        // EPFO Forms
        'ECR': 'monthly',
        'Form 5A': 'one-time',
        'Form 2': 'one-time',
        'Form 10C': 'one-time',
        'Form 10D': 'one-time',
        'Form 19': 'one-time'
      }
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
    },
    regulatory: {
      authorities: {
        tax: 'Federal Tax Authority (FTA)',
        corporate: 'Ministry of Economy & Tourism',
        registration: 'Department of Economic Development (DED)',
        labor: 'Ministry of Human Resources & Emiratisation (MOHRE)'
      },
      commonForms: [
        'VAT Return (VAT 201)', 'Corporate Tax Return', 'Trade License Renewal',
        'FTA Audit File (FAF)', 'Excise Tax Return', 'Tax Registration Form',
        'Transfer Pricing Disclosure'
      ],
      documentPatterns: {
        tax: ['vat', 'vat 201', 'vat201', 'corporate tax', 'ct return', 'excise tax', 'faf'],
        corporate: ['trade license', 'commercial registration', 'ded'],
        labor: ['payroll', 'wps', 'wages protection']
      },
      formFrequencies: {
        'VAT Return (VAT 201)': 'quarterly',
        'Corporate Tax Return': 'annual',
        'Trade License Renewal': 'annual',
        'FTA Audit File (FAF)': 'one-time',
        'Excise Tax Return': 'monthly',
        'Tax Registration Form': 'one-time',
        'Transfer Pricing Disclosure': 'annual'
      }
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
    },
    regulatory: {
      authorities: {
        tax: 'ZATCA (Zakat, Tax and Customs Authority)',
        corporate: 'Ministry of Commerce',
        registration: 'Ministry of Commerce',
        labor: 'Ministry of Human Resources and Social Development (MHRSD)'
      },
      commonForms: [
        'VAT Return', 'Zakat Return', 'Income Tax Return', 'WHT Return',
        'Commercial Registration (CR)', 'E-Invoice (Fatoora)'
      ],
      documentPatterns: {
        tax: ['vat', 'zakat', 'tax return', 'wht', 'withholding tax', 'fatoora', 'e-invoice'],
        corporate: ['commercial registration', 'cr', 'trade license'],
        labor: ['payroll', 'gosi', 'wps', 'wages protection']
      },
      formFrequencies: {
        'VAT Return': 'quarterly',
        'Zakat Return': 'annual',
        'Income Tax Return': 'annual',
        'WHT Return': 'monthly',
        'Commercial Registration (CR)': 'annual',
        'E-Invoice (Fatoora)': 'monthly'
      }
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
    },
    regulatory: {
      authorities: {
        tax: 'Tax Authority (OTA)',
        corporate: 'Ministry of Commerce, Industry and Investment Promotion (MoCIIP)',
        registration: 'Ministry of Commerce, Industry and Investment Promotion (MoCIIP)'
      },
      commonForms: [
        'VAT Return', 'Corporate Tax Return', 'Commercial Registration (CR)',
        'Excise Tax Return', 'E-Invoice (Fawtara)'
      ],
      documentPatterns: {
        tax: ['vat', 'tax return', 'corporate tax', 'excise tax', 'fawtara', 'e-invoice'],
        corporate: ['commercial registration', 'cr', 'trade license', 'mociip'],
        labor: ['payroll', 'social insurance']
      },
      formFrequencies: {
        'VAT Return': 'quarterly',
        'Corporate Tax Return': 'annual',
        'Commercial Registration (CR)': 'annual',
        'Excise Tax Return': 'monthly',
        'E-Invoice (Fawtara)': 'monthly'
      }
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
    },
    regulatory: {
      authorities: {
        tax: 'General Tax Authority (GTA)',
        corporate: 'Ministry of Commerce and Industry (MoCI)',
        registration: 'Ministry of Commerce and Industry (MoCI)',
        labor: 'Ministry of Labor'
      },
      commonForms: [
        'Income Tax Return', 'WHT Return', 'WHT Contract Declaration',
        'Excise Tax Return', 'Zakat Return', 'Commercial Registration',
        'Simplified Tax Return'
      ],
      documentPatterns: {
        tax: ['income tax', 'tax return', 'wht', 'withholding tax', 'excise tax', 'zakat', 'dhareeba'],
        corporate: ['commercial registration', 'trade license', 'moci'],
        labor: ['payroll', 'qatarization', 'wps', 'wages protection']
      },
      formFrequencies: {
        'Income Tax Return': 'annual',
        'WHT Return': 'monthly',
        'WHT Contract Declaration': 'one-time',
        'Excise Tax Return': 'monthly',
        'Zakat Return': 'annual',
        'Commercial Registration': 'annual',
        'Simplified Tax Return': 'annual'
      }
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
    },
    regulatory: {
      authorities: {
        tax: 'National Bureau for Revenue (NBR)',
        corporate: 'Ministry of Industry, Commerce and Tourism (MOICT)',
        registration: 'Ministry of Industry, Commerce and Tourism (MOICT)',
        labor: 'Labour Market Regulatory Authority (LMRA)',
        laborInsurance: 'Social Insurance Organization (SIO)'
      },
      commonForms: [
        'VAT Return', 'VAT Registration', 'Corporate Tax Return',
        'Commercial Registration (CR)', 'Sijilat Registration'
      ],
      documentPatterns: {
        tax: ['vat', 'tax return', 'corporate tax', 'nbr'],
        corporate: ['commercial registration', 'cr', 'trade license', 'sijilat', 'moict'],
        labor: ['payroll', 'lmra', 'sio', 'social insurance']
      },
      formFrequencies: {
        'VAT Return': 'quarterly',
        'VAT Registration': 'one-time',
        'Corporate Tax Return': 'annual',
        'Commercial Registration (CR)': 'annual',
        'Sijilat Registration': 'one-time'
      }
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
    },
    regulatory: {
      authorities: {
        tax: 'Internal Revenue Service (IRS)',
        corporate: 'Secretary of State (SOS)',
        registration: 'Secretary of State (SOS)',
        labor: 'Department of Labor (DOL)',
        laborInsurance: 'Social Security Administration (SSA)'
      },
      commonForms: [
        'Form 1120', 'Form 1120-S', 'Form 1120-F', 'Form 1065', 'Form 1040',
        'Form 941', 'Form 940', 'Form W-2', 'Form 1099-NEC', 'Form 1099-MISC',
        'Form 5500', 'Form 5472', 'Form 8832', 'Form SS-4',
        'State Tax Return', 'State Sales Tax Return', 'Business License',
        'Annual Report', 'Franchise Tax Return'
      ],
      documentPatterns: {
        tax: [
          'form 1120', 'form 1120-s', 'form 1120-f', 'form 1065', 'form 1040',
          'form 941', 'form 940', 'irs', 'tax return', 'state tax',
          'franchise tax', 'sales tax', 'sui'
        ],
        corporate: [
          'state registration', 'business license', 'ein', 'secretary of state',
          'sos', 'annual report', 'statement of information', 'articles of incorporation'
        ],
        labor: [
          'payroll', 'w-2', 'w-4', 'form 5500', '1099-nec', '1099-misc',
          'futa', 'unemployment', 'social security'
        ],
        notices: [
          'cp2000', 'cp14', 'cp501', 'cp503', 'cp504', 'cp11', 'cp12',
          'notice of deficiency', 'letter 5071c', 'letter 5747c', 'ftb 4502',
          'ftb 4601', 'ftb 4684', 'ftb 5818', 'dtf-160', 'dtf-948', 'dtf-948-o'
        ]
      },
      noticeTypes: {
        'CP2000': {
          type: 'Underreported Income',
          formCode: 'CP2000',
          category: 'Others',
          priority: 'high',
          description: 'Proposed adjustment for income mismatch'
        },
        'CP14': {
          type: 'Balance Due',
          formCode: 'CP14',
          category: 'Others',
          priority: 'high',
          description: 'Initial notice of unpaid tax balance'
        },
        'FTB 5818': {
          type: 'Notice of Tax Return Change',
          formCode: 'FTB 5818',
          category: 'Others',
          priority: 'high',
          description: 'Notice with specific alphanumerical codes indicating exact adjustments'
        },
        'DTF-160': {
          type: 'Account Adjustment Notice',
          formCode: 'DTF-160',
          category: 'Others',
          priority: 'high',
          description: 'Refund offsets, informing taxpayer that refund was seized to pay another debt'
        }
      },
      formFrequencies: {
        'Form 1120': 'annual',
        'Form 1120-S': 'annual',
        'Form 1120-F': 'annual',
        'Form 1065': 'annual',
        'Form 1040': 'annual',
        'Form 941': 'quarterly',
        'Form 940': 'annual',
        'Form W-2': 'annual',
        'Form 1099-NEC': 'annual',
        'Form 1099-MISC': 'annual',
        'Form 5500': 'annual',
        'Form 5472': 'annual',
        'Form 8832': 'one-time',
        'Form SS-4': 'one-time',
        'State Tax Return': 'annual',
        'State Sales Tax Return': 'monthly',
        'Business License': 'annual',
        'Annual Report': 'annual',
        'Franchise Tax Return': 'annual'
      }
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
