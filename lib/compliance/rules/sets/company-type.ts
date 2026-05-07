/**
 * Company-Type Rules — Specific to entity type (PTC, PLC, LLP, OPC, Section 8, etc.)
 *
 * These are RoC filings and governance requirements that vary by company type.
 * The Companies Act applies to PTC/PLC/OPC/Section8. LLP Act applies to LLPs.
 */

import type { ComplianceRule } from '../types'

export const COMPANY_TYPE_RULES: ComplianceRule[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // Companies Act (PTC, PLC, OPC, Section 8)
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'aoc4-annual',
    name: 'AOC-4 — Annual Financial Statements Filing',
    category: 'RoC',
    act: 'Companies Act, 2013',
    section: 'Section 137',
    authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'annual',
    dueDateFormula: 'months_after_fy_end:7,day:30', // 30th October for March FY (30 days after AGM)
    dueDescription: 'Within 30 days of AGM (7 months from FY end)',
    penalty: '₹100/day per default (company) + ₹100/day per director (max ₹10L each). Additional ₹1,000/day after first default.',
    isCritical: true,
    documentsRequired: ['Audited Financial Statements', 'Board Report', 'Auditor Report', 'Digital Signature'],
    sourceUrl: 'https://www.mca.gov.in/MinistryV2/efaboratoryforms.html',
    conditions: {
      companyTypes: ['PTC', 'PLC', 'OPC', 'Section8'],
    },
    effectiveFrom: '2014-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'OPC files within 180 days of FY end. Section 8 companies can use simplified AOC-4.',
    applicabilityReason: 'All companies under Companies Act must file annual financial statements with RoC',
  },

  {
    id: 'mgt7-annual',
    name: 'MGT-7 / MGT-7A — Annual Return',
    category: 'RoC',
    act: 'Companies Act, 2013',
    section: 'Section 92',
    authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'annual',
    dueDateFormula: 'months_after_fy_end:8,day:29', // 60 days after AGM
    dueDescription: 'Within 60 days of AGM',
    penalty: '₹100/day per default (company + every officer). Additional penalty for continued default.',
    isCritical: true,
    documentsRequired: ['Annual Return form', 'List of shareholders', 'Digital Signature'],
    sourceUrl: 'https://www.mca.gov.in/MinistryV2/efaboratoryforms.html',
    conditions: {
      companyTypes: ['PTC', 'PLC', 'OPC', 'Section8'],
    },
    effectiveFrom: '2014-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'OPC and Small Companies file MGT-7A (abridged). PLC files full MGT-7.',
    applicabilityReason: 'All companies under Companies Act must file annual return with RoC',
  },

  {
    id: 'agm-annual',
    name: 'Annual General Meeting (AGM)',
    category: 'RoC',
    act: 'Companies Act, 2013',
    section: 'Section 96',
    authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'annual',
    dueDateFormula: 'months_after_fy_end:6,day:30',
    dueDescription: 'Within 6 months from close of financial year (by 30th September for March FY)',
    penalty: '₹1,00,000 on company + ₹5,000 on every defaulting officer. Tribunal may order meeting.',
    isCritical: true,
    documentsRequired: ['AGM Notice (21 days prior)', 'Directors Report', 'Audited Accounts', 'Minutes'],
    sourceUrl: 'https://www.mca.gov.in/MinistryV2/companiesact2013.html',
    conditions: {
      companyTypes: ['PTC', 'PLC', 'Section8'],
      excludeCompanyTypes: ['OPC'], // OPC exempt from AGM
    },
    effectiveFrom: '2014-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Gap between two AGMs cannot exceed 15 months. First AGM within 9 months of FY end.',
    applicabilityReason: 'All companies (except OPC) must hold AGM within 6 months of FY end',
  },

  {
    id: 'board-meeting-min',
    name: 'Board Meetings — Minimum 4 per year',
    category: 'RoC',
    act: 'Companies Act, 2013',
    section: 'Section 173',
    authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'quarterly',
    dueDateFormula: 'quarterly:jun30,sep30,dec31,mar31',
    dueDescription: 'At least one meeting per quarter, gap ≤ 120 days',
    penalty: '₹25,000 on company + ₹5,000 on every director who fails to comply. Imprisonment up to 1 year for repeat offence.',
    isCritical: true,
    documentsRequired: ['Board Meeting Notice (7 days prior)', 'Agenda', 'Minutes', 'Attendance Register'],
    sourceUrl: 'https://www.mca.gov.in/MinistryV2/companiesact2013.html',
    conditions: {
      companyTypes: ['PTC', 'PLC', 'Section8'],
    },
    effectiveFrom: '2014-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'OPC: only 1 board meeting per half-year. Small company: 2 meetings per year (gap ≤ 90 days). Startup: 1 per half-year for first 5 years.',
    applicabilityReason: 'Companies must hold minimum board meetings per quarter',
  },

  {
    id: 'statutory-auditor',
    name: 'Appointment of Statutory Auditor',
    category: 'RoC',
    act: 'Companies Act, 2013',
    section: 'Section 139',
    authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'event-based',
    dueDateFormula: 'event-based:within_30days_of_incorporation',
    dueDescription: 'Within 30 days of incorporation (first auditor); at AGM for subsequent',
    penalty: '₹25,000–₹5,00,000 on company. ₹10,000–₹1,00,000 on every officer.',
    isCritical: true,
    documentsRequired: ['Form ADT-1 (within 15 days of appointment)', 'Auditor consent letter'],
    sourceUrl: 'https://www.mca.gov.in/MinistryV2/companiesact2013.html',
    conditions: {
      companyTypes: ['PTC', 'PLC', 'OPC', 'Section8'],
    },
    effectiveFrom: '2014-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Term: 5 years (individual), 2 terms of 5 years (firm). Rotation mandatory for listed companies.',
    applicabilityReason: 'Every company must appoint a statutory auditor',
  },

  {
    id: 'adt1-auditor-appointment',
    name: 'ADT-1 — Auditor Appointment Intimation',
    category: 'RoC',
    act: 'Companies Act, 2013',
    section: 'Section 139(1)',
    authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'event-based',
    dueDateFormula: 'event-based:within_15days_of_agm',
    dueDescription: 'Within 15 days of AGM where auditor is appointed/reappointed',
    penalty: '₹25,000–₹5,00,000 on company.',
    isCritical: false,
    documentsRequired: ['Form ADT-1', 'Auditor written consent', 'Eligibility certificate'],
    sourceUrl: 'https://www.mca.gov.in/MinistryV2/efaboratoryforms.html',
    conditions: {
      companyTypes: ['PTC', 'PLC', 'OPC', 'Section8'],
    },
    effectiveFrom: '2014-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'Intimation of auditor appointment must be filed with RoC',
  },

  {
    id: 'msme1-half-yearly',
    name: 'MSME-1 — Half-Yearly Return of Outstanding Payments to MSMEs',
    category: 'RoC',
    act: 'Companies Act, 2013',
    section: 'Section 405 read with MSMED Act, 2006 Section 9',
    authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'half-yearly',
    dueDateFormula: 'half_yearly:apr30,oct31',
    dueDescription: '30th April (Oct–Mar half) and 31st October (Apr–Sep half)',
    penalty: 'Late filing penalty applies. Non-disclosure of MSME dues is a serious default.',
    isCritical: false,
    documentsRequired: ['Form MSME-1', 'List of MSME suppliers with outstanding amounts'],
    sourceUrl: 'https://www.mca.gov.in/',
    conditions: {
      companyTypes: ['PTC', 'PLC', 'OPC', 'Section8'],
    },
    effectiveFrom: '2019-01-22',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Only required if company has outstanding payments to MSME suppliers exceeding 45 days. Per Section 43B(h) of IT Act, payments to MSME vendors beyond 45 days are disallowed as expense (30% disallowance in tax audit). Must pay before 31st March at minimum.',
    applicabilityReason: 'Companies must report outstanding payments to MSME suppliers',
  },

  {
    id: 'dpt3-annual',
    name: 'DPT-3 — Return of Deposits and Loans',
    category: 'RoC',
    act: 'Companies Act, 2013',
    section: 'Rule 16A of Companies (Acceptance of Deposits) Rules, 2014',
    authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'annual',
    // Anchored to FY-end so period_key carries the COVERED FY ("FY2025-26"
    // for the row due 30 Jun 2026). 3 months after FY end = 30 June (Indian
    // FY ends Mar 31). Was `fixed:jun30` which set period_key to a
    // calendar month and broke FY-bucketing in the UI.
    dueDateFormula: 'months_after_fy_end:3,day:30',
    dueDescription: '30th June every year (for previous FY)',
    penalty: '₹10,000–₹50,000 on company. ₹2,000–₹5,000 on every officer in default.',
    isCritical: true,
    documentsRequired: ['Form DPT-3', 'Details of loans/deposits received', 'Auditor certificate'],
    sourceUrl: 'https://www.mca.gov.in/',
    conditions: {
      companyTypes: ['PTC', 'PLC', 'OPC', 'Section8'],
    },
    effectiveFrom: '2019-01-22',
    lastVerified: '2026-04-06',
    verifiedBy: 'System',
    notes: 'Covers loans, deposits, and transactions not considered deposits. Even nil return is recommended.',
    applicabilityReason: 'All companies under Companies Act must file DPT-3 for loans and deposits',
  },

  {
    id: 'inc20a-commencement',
    name: 'INC-20A — Declaration of Commencement of Business',
    category: 'RoC',
    act: 'Companies Act, 2013',
    section: 'Section 10A',
    authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'one-time',
    dueDateFormula: 'days_after_incorp:180',
    dueDescription: 'Within 180 days of incorporation',
    penalty: 'Company name removed from Register. ₹50,000 on company + ₹1,000/day on directors.',
    isCritical: true,
    documentsRequired: ['Form INC-20A', 'Bank statement showing share subscription receipt', 'Registered office verification'],
    sourceUrl: 'https://www.mca.gov.in/',
    conditions: {
      companyTypes: ['PTC', 'PLC', 'OPC', 'Section8'],
    },
    effectiveFrom: '2018-11-02',
    lastVerified: '2026-04-06',
    verifiedBy: 'System',
    notes: 'Only for companies incorporated after 02-Nov-2018. Must deposit subscribed capital + open bank account first.',
    applicabilityReason: 'Companies must declare commencement of business within 180 days of incorporation',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // LLP-Specific
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'llp-form11-annual',
    name: 'LLP Form 11 — Annual Return',
    category: 'RoC',
    act: 'Limited Liability Partnership Act, 2008',
    section: 'Section 25(4)',
    authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'annual',
    dueDateFormula: 'fixed:may30',
    dueDescription: '30th May every year (within 60 days of FY end)',
    penalty: '₹100/day per partner. LLP can be struck off for non-compliance.',
    isCritical: true,
    documentsRequired: ['Form 11', 'Partner details', 'Digital Signature'],
    sourceUrl: 'https://www.mca.gov.in/MinistryV2/llpfilingforms.html',
    conditions: {
      companyTypes: ['LLP'],
    },
    effectiveFrom: '2009-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'Every LLP must file annual return (Form 11) with RoC',
  },

  {
    id: 'llp-form8-annual',
    name: 'LLP Form 8 — Statement of Account & Solvency',
    category: 'RoC',
    act: 'Limited Liability Partnership Act, 2008',
    section: 'Section 34(3)',
    authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'annual',
    dueDateFormula: 'months_after_fy_end:7,day:30',
    dueDescription: '30th October (within 30 days of AGM, 7 months from FY end)',
    penalty: '₹100/day per designated partner. LLP can be struck off.',
    isCritical: true,
    documentsRequired: ['Form 8', 'Statement of Account', 'Solvency Statement', 'Digital Signature of Designated Partners'],
    sourceUrl: 'https://www.mca.gov.in/MinistryV2/llpfilingforms.html',
    conditions: {
      companyTypes: ['LLP'],
    },
    effectiveFrom: '2009-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'LLPs with turnover > ₹40L or contribution > ₹25L must get accounts audited.',
    applicabilityReason: 'Every LLP must file Statement of Account & Solvency with RoC',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PLC-Specific (additional governance for Public Limited Companies)
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'plc-secretarial-audit',
    name: 'Secretarial Audit Report (MR-3)',
    category: 'RoC',
    act: 'Companies Act, 2013',
    section: 'Section 204',
    authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'annual',
    dueDateFormula: 'months_after_fy_end:6,day:30',
    dueDescription: 'Annexed to Board Report for AGM',
    penalty: '₹1,00,000–₹5,00,000 on company. ₹50,000–₹2,00,000 on every officer.',
    isCritical: true,
    documentsRequired: ['Form MR-3 (Secretarial Audit Report)', 'CS Certificate'],
    sourceUrl: 'https://www.mca.gov.in/MinistryV2/companiesact2013.html',
    conditions: {
      companyTypes: ['PLC'],
    },
    effectiveFrom: '2014-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Also mandatory for PTC with paid-up capital ≥ ₹50Cr or turnover ≥ ₹250Cr. Handled in conditional rules.',
    applicabilityReason: 'Every listed company and public company must undergo secretarial audit',
  },

  {
    id: 'plc-company-secretary',
    name: 'Appointment of Company Secretary',
    category: 'RoC',
    act: 'Companies Act, 2013',
    section: 'Section 203',
    authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'one-time',
    dueDateFormula: 'event-based:when_threshold_met',
    dueDescription: 'Mandatory when paid-up capital ≥ ₹5Cr (PTC) or for all PLCs',
    penalty: '₹1,00,000–₹5,00,000 on company per day of default.',
    isCritical: true,
    documentsRequired: ['DIR-12 (for change in KMP)', 'CS membership certificate'],
    sourceUrl: 'https://www.mca.gov.in/MinistryV2/companiesact2013.html',
    conditions: {
      companyTypes: ['PLC'],
    },
    effectiveFrom: '2014-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'For PTC, mandatory only if paid-up capital ≥ ₹5Cr. This rule covers PLCs where it is always mandatory.',
    applicabilityReason: 'Public Limited Companies must appoint a full-time Company Secretary',
  },
]
