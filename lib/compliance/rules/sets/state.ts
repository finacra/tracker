/**
 * State-Specific Rules — Professional Tax, Shops & Establishment, Labour Welfare Fund
 *
 * These rules vary by state. We encode the major ones that apply to most businesses
 * in each state. The rules engine filters by company's registered state.
 *
 * States covered: Maharashtra, Karnataka, Tamil Nadu, Andhra Pradesh, Telangana,
 * West Bengal, Gujarat, Kerala, Madhya Pradesh, Odisha, Delhi
 */

import type { ComplianceRule } from '../types'

export const STATE_RULES: ComplianceRule[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // PROFESSIONAL TAX (PT)
  // Each state has different rates, thresholds, and filing frequencies
  // ═══════════════════════════════════════════════════════════════════════

  // ── Maharashtra ─────────────────────────────────────────────────────

  {
    id: 'pt-maharashtra-monthly',
    name: 'Professional Tax — Maharashtra (Monthly Payment)',
    category: 'State Compliance',
    act: 'Maharashtra State Tax on Professions, Trades, Callings and Employments Act, 1975',
    section: 'Section 6',
    authority: 'Maharashtra GST Department',
    frequency: 'monthly',
    dueDateFormula: 'day:last,offset:current_month',
    dueDescription: 'Last day of each month',
    penalty: '₹5/day late fee. 2% per month interest on unpaid amount.',
    isCritical: false,
    documentsRequired: ['PT Challan', 'Employee salary details'],
    sourceUrl: 'https://mahagst.gov.in/',
    conditions: {
      states: ['Maharashtra'],
    },
    effectiveFrom: '1975-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Max PT: ₹2,500/year per employee (₹200/month for salary > ₹10,000). Employer also pays ₹2,500/year.',
    applicabilityReason: 'Professional Tax mandatory for all employers and employees in Maharashtra',
  },

  {
    id: 'pt-maharashtra-annual-return',
    name: 'Professional Tax — Maharashtra (Annual Return)',
    category: 'State Compliance',
    act: 'Maharashtra State Tax on Professions Act, 1975',
    section: 'Rule 11',
    authority: 'Maharashtra GST Department',
    frequency: 'annual',
    dueDateFormula: 'fixed:mar31',
    dueDescription: '31st March every year',
    penalty: 'Late fee and interest as per Act.',
    isCritical: false,
    documentsRequired: ['Annual PT Return', 'Monthly payment challans'],
    sourceUrl: 'https://mahagst.gov.in/',
    conditions: {
      states: ['Maharashtra'],
    },
    effectiveFrom: '1975-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'Annual PT return mandatory for all employers in Maharashtra',
  },

  // ── Karnataka ───────────────────────────────────────────────────────

  {
    id: 'pt-karnataka-monthly',
    name: 'Professional Tax — Karnataka (Monthly Payment)',
    category: 'State Compliance',
    act: 'Karnataka Tax on Professions, Trades, Callings and Employments Act, 1976',
    section: 'Section 6',
    authority: 'Commercial Tax Department, Karnataka',
    frequency: 'monthly',
    dueDateFormula: 'day:20,offset:+1month',
    dueDescription: '20th of the following month',
    penalty: '₹250 or 1.25% per month of unpaid tax (whichever is higher).',
    isCritical: false,
    documentsRequired: ['PT Challan', 'Employee salary slabs'],
    sourceUrl: 'https://ctax.karnataka.gov.in/',
    conditions: {
      states: ['Karnataka'],
    },
    effectiveFrom: '1976-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Max PT: ₹2,500/year per employee. Employer enrollment mandatory when hiring.',
    applicabilityReason: 'Professional Tax mandatory for all employers in Karnataka',
  },

  // ── Tamil Nadu ──────────────────────────────────────────────────────

  {
    id: 'pt-tamilnadu-half-yearly',
    name: 'Professional Tax — Tamil Nadu (Half-Yearly Payment)',
    category: 'State Compliance',
    act: 'Tamil Nadu Tax on Professions, Trades, Callings and Employments Act, 1992',
    section: 'Section 6',
    authority: 'Municipal Authority / Panchayat',
    frequency: 'half-yearly',
    dueDateFormula: 'half_yearly:sep30,mar31',
    dueDescription: '30th September (Apr–Sep) and 31st March (Oct–Mar)',
    penalty: '2% per month on unpaid amount.',
    isCritical: false,
    documentsRequired: ['PT Payment challan'],
    sourceUrl: 'https://tnurbanepay.tn.gov.in/',
    conditions: {
      states: ['Tamil Nadu'],
    },
    effectiveFrom: '1992-01-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Max PT: ₹2,500/year. Paid to local municipality. Half-yearly for companies.',
    applicabilityReason: 'Professional Tax mandatory for all employers in Tamil Nadu',
  },

  // ── Telangana ───────────────────────────────────────────────────────

  {
    id: 'pt-telangana-monthly',
    name: 'Professional Tax — Telangana (Monthly Payment)',
    category: 'State Compliance',
    act: 'Telangana Tax on Professions, Trades, Callings and Employments Act, 1987',
    section: 'Section 6',
    authority: 'Commercial Tax Department, Telangana',
    frequency: 'monthly',
    dueDateFormula: 'day:10,offset:+1month',
    dueDescription: '10th of the following month',
    penalty: '2% per month simple interest. Penalty equal to tax amount for willful default.',
    isCritical: false,
    documentsRequired: ['PT Challan', 'Employee salary details'],
    sourceUrl: 'https://professionaltax.telangana.gov.in/',
    conditions: {
      states: ['Telangana'],
    },
    effectiveFrom: '1987-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Max PT: ₹2,500/year per employee.',
    applicabilityReason: 'Professional Tax mandatory for all employers in Telangana',
  },

  // ── Andhra Pradesh ──────────────────────────────────────────────────

  {
    id: 'pt-andhra-monthly',
    name: 'Professional Tax — Andhra Pradesh (Monthly Payment)',
    category: 'State Compliance',
    act: 'Andhra Pradesh Tax on Professions, Trades, Callings and Employments Act, 1987',
    section: 'Section 6',
    authority: 'Commercial Tax Department, AP',
    frequency: 'monthly',
    dueDateFormula: 'day:10,offset:+1month',
    dueDescription: '10th of the following month',
    penalty: '2% per month simple interest.',
    isCritical: false,
    documentsRequired: ['PT Challan', 'Employee salary details'],
    sourceUrl: 'https://tax.aponline.gov.in/',
    conditions: {
      states: ['Andhra Pradesh'],
    },
    effectiveFrom: '1987-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'Professional Tax mandatory for all employers in Andhra Pradesh',
  },

  // ── West Bengal ─────────────────────────────────────────────────────

  {
    id: 'pt-westbengal-monthly',
    name: 'Professional Tax — West Bengal (Monthly Payment)',
    category: 'State Compliance',
    act: 'West Bengal State Tax on Professions, Trades, Callings and Employments Act, 1979',
    section: 'Section 4',
    authority: 'Directorate of Commercial Taxes, WB',
    frequency: 'monthly',
    dueDateFormula: 'day:21,offset:+1month',
    dueDescription: '21st of the following month',
    penalty: '₹50/day late fee. 12% p.a. interest.',
    isCritical: false,
    documentsRequired: ['Form III (Return cum Challan)'],
    sourceUrl: 'https://wbprofessiontax.gov.in/',
    conditions: {
      states: ['West Bengal'],
    },
    effectiveFrom: '1979-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Max PT: ₹2,500/year per employee. Employer enrollment mandatory.',
    applicabilityReason: 'Professional Tax mandatory for all employers in West Bengal',
  },

  // ── Gujarat ─────────────────────────────────────────────────────────

  {
    id: 'pt-gujarat-monthly',
    name: 'Professional Tax — Gujarat (Monthly Payment)',
    category: 'State Compliance',
    act: 'Gujarat State Tax on Professions, Trades, Callings and Employments Act, 1976',
    section: 'Section 5',
    authority: 'Gujarat Commercial Tax',
    frequency: 'monthly',
    dueDateFormula: 'day:15,offset:+1month',
    dueDescription: '15th of the following month',
    penalty: '₹5/day late fee.',
    isCritical: false,
    documentsRequired: ['PT Challan'],
    sourceUrl: 'https://commercialtax.gujarat.gov.in/',
    conditions: {
      states: ['Gujarat'],
    },
    effectiveFrom: '1976-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Max PT: ₹2,500/year per employee.',
    applicabilityReason: 'Professional Tax mandatory for all employers in Gujarat',
  },

  // ── Kerala ──────────────────────────────────────────────────────────

  {
    id: 'pt-kerala-half-yearly',
    name: 'Professional Tax — Kerala (Half-Yearly Payment)',
    category: 'State Compliance',
    act: 'Kerala Municipality Act, 1994',
    section: 'Section 254',
    authority: 'Local Self Government (Municipality / Panchayat)',
    frequency: 'half-yearly',
    dueDateFormula: 'half_yearly:sep30,mar31',
    dueDescription: 'Before 30th September and 31st March',
    penalty: '2% per month interest.',
    isCritical: false,
    documentsRequired: ['PT Payment to local body'],
    sourceUrl: 'https://lsgkerala.gov.in/',
    conditions: {
      states: ['Kerala'],
    },
    effectiveFrom: '1994-01-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Max PT: ₹2,500/year. Paid to local self-government.',
    applicabilityReason: 'Professional Tax mandatory for all employers in Kerala',
  },

  // ── Madhya Pradesh ──────────────────────────────────────────────────

  {
    id: 'pt-madhyapradesh-monthly',
    name: 'Professional Tax — Madhya Pradesh (Monthly Payment)',
    category: 'State Compliance',
    act: 'Madhya Pradesh Vritti Kar Adhiniyam, 1995',
    section: 'Section 5',
    authority: 'Commercial Tax Department, MP',
    frequency: 'monthly',
    dueDateFormula: 'day:10,offset:+1month',
    dueDescription: '10th of the following month',
    penalty: '1.5% per month interest.',
    isCritical: false,
    documentsRequired: ['PT Challan'],
    sourceUrl: 'https://mptax.mp.gov.in/',
    conditions: {
      states: ['Madhya Pradesh'],
    },
    effectiveFrom: '1995-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Max PT: ₹2,500/year per employee.',
    applicabilityReason: 'Professional Tax mandatory for all employers in Madhya Pradesh',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SHOPS & ESTABLISHMENT ACT
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'shops-est-maharashtra',
    name: 'Shops & Establishment Registration — Maharashtra',
    category: 'Labour Law',
    act: 'Maharashtra Shops and Establishments (Regulation of Employment and Conditions of Service) Act, 2017',
    section: 'Section 7',
    authority: 'Labour Department, Maharashtra',
    frequency: 'one-time',
    dueDateFormula: 'event-based:within_30days_of_start',
    dueDescription: 'Within 30 days of commencing business',
    penalty: 'Fine up to ₹25,000 for first offence. ₹50,000 for subsequent.',
    isCritical: true,
    documentsRequired: ['Application Form', 'PAN', 'Address proof', 'Employer details'],
    sourceUrl: 'https://mahakamgar.maharashtra.gov.in/',
    conditions: {
      states: ['Maharashtra'],
    },
    effectiveFrom: '2017-12-21',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'New 2017 Act: registration is permanent (no renewal needed). Digital registration via Portal.',
    applicabilityReason: 'Every shop/commercial establishment in Maharashtra must register',
  },

  {
    id: 'shops-est-karnataka',
    name: 'Shops & Establishment Registration — Karnataka',
    category: 'Labour Law',
    act: 'Karnataka Shops and Commercial Establishments Act, 1961',
    section: 'Section 6',
    authority: 'Labour Department, Karnataka',
    frequency: 'one-time',
    dueDateFormula: 'event-based:within_30days_of_start',
    dueDescription: 'Within 30 days of commencing business',
    penalty: 'Fine up to ₹10,000.',
    isCritical: true,
    documentsRequired: ['Form A', 'PAN', 'Proof of premises'],
    sourceUrl: 'https://labour.karnataka.gov.in/',
    conditions: {
      states: ['Karnataka'],
    },
    effectiveFrom: '1961-01-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Renewal required annually in some jurisdictions under old Act.',
    applicabilityReason: 'Every commercial establishment in Karnataka must register',
  },

  {
    id: 'shops-est-delhi',
    name: 'Shops & Establishment Registration — Delhi',
    category: 'Labour Law',
    act: 'Delhi Shops and Establishments Act, 1954',
    section: 'Section 5',
    authority: 'Labour Department, Delhi',
    frequency: 'one-time',
    dueDateFormula: 'event-based:within_30days_of_start',
    dueDescription: 'Within 30 days of commencing business',
    penalty: '₹25,000 for first offence.',
    isCritical: true,
    documentsRequired: ['Application Form', 'ID proof', 'Address proof'],
    sourceUrl: 'https://labour.delhi.gov.in/',
    conditions: {
      states: ['Delhi'],
    },
    effectiveFrom: '1954-01-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'Every commercial establishment in Delhi must register',
  },

  {
    id: 'shops-est-tamilnadu',
    name: 'Shops & Establishment Registration — Tamil Nadu',
    category: 'Labour Law',
    act: 'Tamil Nadu Shops and Establishments Act, 1947',
    section: 'Section 6',
    authority: 'Labour Department, Tamil Nadu',
    frequency: 'one-time',
    dueDateFormula: 'event-based:within_30days_of_start',
    dueDescription: 'Within 30 days of commencing business',
    penalty: 'Fine up to ₹500 per offence.',
    isCritical: false,
    documentsRequired: ['Form A', 'ID proof', 'Address proof'],
    sourceUrl: 'https://labour.tn.gov.in/',
    conditions: {
      states: ['Tamil Nadu'],
    },
    effectiveFrom: '1947-01-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Registration must be renewed annually.',
    applicabilityReason: 'Every commercial establishment in Tamil Nadu must register',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // LABOUR WELFARE FUND (LWF)
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'lwf-maharashtra',
    name: 'Labour Welfare Fund — Maharashtra (Half-Yearly)',
    category: 'Labour Law',
    act: 'Maharashtra Labour Welfare Fund Act, 1953',
    section: 'Section 6B',
    authority: 'Labour Welfare Board, Maharashtra',
    frequency: 'half-yearly',
    dueDateFormula: 'half_yearly:jan15,jul15',
    dueDescription: '15th January (Jul–Dec) and 15th July (Jan–Jun)',
    penalty: 'Simple interest + penalty up to 5x the contribution.',
    isCritical: false,
    documentsRequired: ['LWF Contribution details', 'Employee list'],
    sourceUrl: 'https://mahakamgar.maharashtra.gov.in/',
    conditions: {
      states: ['Maharashtra'],
    },
    effectiveFrom: '1953-01-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Employee: ₹6/half-year. Employer: ₹18/half-year. Per employee.',
    applicabilityReason: 'All establishments in Maharashtra with employees must contribute to LWF',
  },

  {
    id: 'lwf-karnataka',
    name: 'Labour Welfare Fund — Karnataka (Annual)',
    category: 'Labour Law',
    act: 'Karnataka Labour Welfare Fund Act, 1965',
    section: 'Section 6',
    authority: 'Labour Welfare Board, Karnataka',
    frequency: 'annual',
    dueDateFormula: 'fixed:jan15',
    dueDescription: '15th January every year',
    penalty: 'Interest and penalty as per Act.',
    isCritical: false,
    documentsRequired: ['LWF Contribution details'],
    sourceUrl: 'https://labour.karnataka.gov.in/',
    conditions: {
      states: ['Karnataka'],
    },
    effectiveFrom: '1965-01-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Employee: ₹20/year. Employer: ₹40/year. Per employee.',
    applicabilityReason: 'All establishments in Karnataka with employees must contribute to LWF',
  },

  {
    id: 'lwf-tamilnadu',
    name: 'Labour Welfare Fund — Tamil Nadu (Annual)',
    category: 'Labour Law',
    act: 'Tamil Nadu Labour Welfare Fund Act, 1972',
    section: 'Section 3',
    authority: 'Labour Welfare Board, TN',
    frequency: 'annual',
    dueDateFormula: 'fixed:jan31',
    dueDescription: 'January every year',
    penalty: 'Interest and penalty.',
    isCritical: false,
    documentsRequired: ['LWF Return', 'Contribution details'],
    sourceUrl: 'https://labour.tn.gov.in/',
    conditions: {
      states: ['Tamil Nadu'],
    },
    effectiveFrom: '1972-01-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Employee: ₹20/year. Employer: ₹40/year.',
    applicabilityReason: 'All establishments in Tamil Nadu with employees must contribute to LWF',
  },

  {
    id: 'lwf-delhi',
    name: 'Labour Welfare Fund — Delhi (Half-Yearly)',
    category: 'Labour Law',
    act: 'Delhi Labour Welfare Fund Act, 1996',
    section: 'Section 6',
    authority: 'Labour Welfare Board, Delhi',
    frequency: 'half-yearly',
    dueDateFormula: 'half_yearly:jan31,jul31',
    dueDescription: 'January and July',
    penalty: 'Interest and penalty.',
    isCritical: false,
    documentsRequired: ['LWF Contribution details'],
    sourceUrl: 'https://labour.delhi.gov.in/',
    conditions: {
      states: ['Delhi'],
    },
    effectiveFrom: '1996-01-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Employee: ₹0.75/month. Employer: ₹3/month.',
    applicabilityReason: 'All establishments in Delhi with employees must contribute to LWF',
  },

  {
    id: 'lwf-andhra',
    name: 'Labour Welfare Fund — Andhra Pradesh (Annual)',
    category: 'Labour Law',
    act: 'Andhra Pradesh Labour Welfare Fund Act, 1987',
    section: 'Section 6',
    authority: 'Labour Welfare Board, AP',
    frequency: 'annual',
    dueDateFormula: 'fixed:jan31',
    dueDescription: 'January every year',
    penalty: 'Interest and penalty.',
    isCritical: false,
    documentsRequired: ['LWF Contribution details'],
    sourceUrl: 'https://labour.ap.gov.in/',
    conditions: {
      states: ['Andhra Pradesh'],
    },
    effectiveFrom: '1987-01-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'All establishments in Andhra Pradesh with employees must contribute to LWF',
  },
]
