/**
 * Conditional Rules — Threshold-based compliances
 *
 * These are the rules that depend on employee count, turnover, net worth, etc.
 * This is the MOST CRITICAL file — the old CA missed these conditions.
 *
 * Each rule has explicit `conditions` with thresholds so the engine can
 * correctly include/exclude based on company attributes.
 */

import type { ComplianceRule } from '../types'

export const CONDITIONAL_RULES: ComplianceRule[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // EMPLOYEE-BASED THRESHOLDS
  // ═══════════════════════════════════════════════════════════════════════

  // ── PF (≥ 20 employees) ─────────────────────────────────────────────

  {
    id: 'pf-registration',
    name: 'PF Registration (EPFO)',
    category: 'Payroll',
    act: 'Employees\' Provident Funds and Miscellaneous Provisions Act, 1952',
    section: 'Section 1(3)',
    authority: 'EPFO',
    frequency: 'one-time',
    dueDateFormula: 'event-based:within_30days_of_threshold',
    dueDescription: 'Within 1 month of employing 20+ employees',
    penalty: 'Imprisonment up to 3 years + fine up to ₹10,000. Damages @ 5-25% of arrears.',
    isCritical: true,
    documentsRequired: ['Form 5A (Establishment Registration)', 'Employee details', 'PAN of establishment'],
    sourceUrl: 'https://www.epfindia.gov.in/',
    conditions: {
      minEmployees: 20,
    },
    effectiveFrom: '1952-11-04',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Once registered, PF applies even if employee count drops below 20. Voluntary registration allowed for < 20.',
    applicabilityReason: 'PF registration mandatory for establishments with 20+ employees',
  },

  {
    id: 'pf-ecr-monthly',
    name: 'PF ECR — Monthly Payment & Return',
    category: 'Payroll',
    act: 'Employees\' Provident Funds and Miscellaneous Provisions Act, 1952',
    section: 'Section 6 read with Para 38',
    authority: 'EPFO',
    frequency: 'monthly',
    dueDateFormula: 'day:15,offset:+1month',
    dueDescription: '15th of the following month',
    penalty: 'Damages: 5% to 25% of arrears depending on delay. Interest @ 12% p.a.',
    isCritical: true,
    documentsRequired: ['ECR (Electronic Challan cum Return)', 'Challan'],
    sourceUrl: 'https://unifiedportal-epfo.epfindia.gov.in/',
    conditions: {
      minEmployees: 20,
    },
    effectiveFrom: '1952-11-04',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Employer contributes 12% of basic + DA. Employee contributes 12%. Admin charges: 0.50%.',
    applicabilityReason: 'Monthly PF payment and ECR filing for establishments with 20+ employees',
  },

  // ── ESI (≥ 10 employees with wages ≤ ₹21,000/month) ────────────────

  {
    id: 'esi-registration',
    name: 'ESI Registration (ESIC)',
    category: 'Payroll',
    act: 'Employees\' State Insurance Act, 1948',
    section: 'Section 2(12)',
    authority: 'ESIC',
    frequency: 'one-time',
    dueDateFormula: 'event-based:within_15days_of_threshold',
    dueDescription: 'Within 15 days of employing 10+ employees',
    penalty: 'Imprisonment up to 2 years + fine up to ₹5,000. Recovery of unpaid contribution with interest.',
    isCritical: true,
    documentsRequired: ['Form 01 (Employer Registration)', 'Employee details', 'Bank details'],
    sourceUrl: 'https://www.esic.gov.in/',
    conditions: {
      minEmployees: 10,
    },
    effectiveFrom: '1948-04-19',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Applicable to employees with wages ≤ ₹21,000/month. Some states have different thresholds.',
    applicabilityReason: 'ESI registration mandatory for establishments with 10+ employees',
  },

  {
    id: 'esi-payment-monthly',
    name: 'ESI Contribution — Monthly Payment',
    category: 'Payroll',
    act: 'Employees\' State Insurance Act, 1948',
    section: 'Section 39',
    authority: 'ESIC',
    frequency: 'monthly',
    dueDateFormula: 'day:15,offset:+1month',
    dueDescription: '15th of the following month',
    penalty: 'Simple interest @ 12% p.a. on delayed payment. Damages up to 25% of contribution.',
    isCritical: true,
    documentsRequired: ['Challan', 'Employee contribution details'],
    sourceUrl: 'https://www.esic.gov.in/',
    conditions: {
      minEmployees: 10,
    },
    effectiveFrom: '1948-04-19',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Employer: 3.25% of wages. Employee: 0.75% of wages. Total: 4%.',
    applicabilityReason: 'Monthly ESI contribution for establishments with 10+ employees',
  },

  {
    id: 'esi-return-half-yearly',
    name: 'ESI Half-Yearly Return',
    category: 'Payroll',
    act: 'Employees\' State Insurance Act, 1948',
    section: 'Regulation 26',
    authority: 'ESIC',
    frequency: 'half-yearly',
    dueDateFormula: 'half_yearly:may12,nov12',
    dueDescription: '12th May (Oct–Mar) and 12th November (Apr–Sep)',
    penalty: 'Non-filing penalty and possible prosecution.',
    isCritical: false,
    documentsRequired: ['Form 6 (Register of Employees)', 'Contribution details'],
    sourceUrl: 'https://www.esic.gov.in/',
    conditions: {
      minEmployees: 10,
    },
    effectiveFrom: '1948-04-19',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'ESI half-yearly return for establishments with 10+ employees',
  },

  // ── POSH (≥ 10 employees) ──────────────────────────────────────────

  {
    id: 'posh-icc-constitution',
    name: 'POSH — Internal Complaints Committee Constitution',
    category: 'Labour Law',
    act: 'Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013',
    section: 'Section 4',
    authority: 'Ministry of Women and Child Development',
    frequency: 'one-time',
    dueDateFormula: 'event-based:when_threshold_met',
    dueDescription: 'Must constitute ICC when 10+ employees',
    penalty: '₹50,000 fine. Repeated violation: cancellation of business license.',
    isCritical: true,
    documentsRequired: ['ICC Constitution Order', 'Member details (presiding officer must be woman)', 'External member from NGO/association'],
    sourceUrl: 'https://wcd.nic.in/act/sexual-harassment-women-workplace',
    conditions: {
      minEmployees: 10,
    },
    effectiveFrom: '2013-12-09',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'Every workplace with 10+ employees must constitute Internal Complaints Committee',
  },

  {
    id: 'posh-annual-report',
    name: 'POSH — Annual Report to District Officer',
    category: 'Labour Law',
    act: 'Sexual Harassment of Women at Workplace Act, 2013',
    section: 'Section 21',
    authority: 'District Officer',
    frequency: 'annual',
    dueDateFormula: 'fixed:jan31',
    dueDescription: 'January 31 every year (for previous calendar year)',
    penalty: 'Non-compliance can lead to cancellation of license/registration.',
    isCritical: false,
    documentsRequired: ['Annual POSH Report', 'Number of complaints filed/resolved', 'Action taken details'],
    sourceUrl: 'https://wcd.nic.in/act/sexual-harassment-women-workplace',
    conditions: {
      minEmployees: 10,
    },
    effectiveFrom: '2013-12-09',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'Establishments with ICC must file annual POSH report',
  },

  // ── Gratuity (≥ 5 employees) ──────────────────────────────────────

  {
    id: 'gratuity-applicability',
    name: 'Payment of Gratuity — Applicability & Registration',
    category: 'Labour Law',
    act: 'Payment of Gratuity Act, 1972',
    section: 'Section 1(3)',
    authority: 'Controlling Authority (Labour Department)',
    frequency: 'one-time',
    dueDateFormula: 'event-based:when_threshold_met',
    dueDescription: 'Applicable once establishment has 10+ employees on any day in preceding 12 months',
    penalty: 'Imprisonment 6 months to 2 years + fine. Payment of gratuity + interest.',
    isCritical: true,
    documentsRequired: ['Form A (Notice of Opening)', 'Employee register'],
    sourceUrl: 'https://labour.gov.in/sites/default/files/ThePaymentofGratuityAct1972.pdf',
    conditions: {
      minEmployees: 10,
    },
    effectiveFrom: '1972-09-16',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Once applicable, continues even if employee count falls below 10. Max gratuity: ₹25,00,000.',
    applicabilityReason: 'Gratuity applicable to establishments with 10+ employees',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TURNOVER-BASED THRESHOLDS
  // ═══════════════════════════════════════════════════════════════════════

  // ── Tax Audit (Turnover > ₹1Cr for business / ₹50L for profession) ─

  {
    id: 'tax-audit-44ab',
    name: 'Tax Audit (Form 3CA/3CB + 3CD)',
    category: 'Income Tax',
    act: 'Income Tax Act, 1961',
    section: 'Section 44AB',
    authority: 'Income Tax Department',
    frequency: 'annual',
    dueDateFormula: 'months_after_fy_end:6,day:30', // 30th September
    dueDescription: '30th September of the assessment year',
    penalty: '₹1,50,000 or 0.5% of turnover (whichever is lower) u/s 271B',
    isCritical: true,
    documentsRequired: ['Form 3CA/3CB (Audit Report)', 'Form 3CD (Statement of Particulars)', 'Audited Financial Statements'],
    sourceUrl: 'https://incometaxindia.gov.in/',
    conditions: {
      minTurnoverLakhs: 100, // ₹1 Crore for business
    },
    effectiveFrom: '1984-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Threshold is ₹10Cr if cash receipts/payments ≤ 5% of total. Professionals: ₹50L. Companies always need audit under Companies Act regardless.',
    applicabilityReason: 'Tax audit mandatory for businesses with turnover exceeding ₹1 Crore',
  },

  // ── GST E-Invoicing (Turnover > ₹5Cr) ─────────────────────────────

  {
    id: 'gst-e-invoicing',
    name: 'GST E-Invoicing — Mandatory',
    category: 'GST',
    act: 'Central Goods and Services Tax Act, 2017',
    section: 'Rule 48(4) of CGST Rules',
    authority: 'GSTN / CBIC',
    frequency: 'event-based',
    dueDateFormula: 'event-based:per_invoice',
    dueDescription: 'Every B2B invoice must be reported on IRP (Invoice Registration Portal)',
    penalty: '₹25,000 per invoice (100% of tax amount). ₹10,000 minimum per invoice.',
    isCritical: true,
    documentsRequired: ['E-invoice JSON', 'IRN (Invoice Reference Number)'],
    sourceUrl: 'https://einvoice1.gst.gov.in/',
    conditions: {
      isGstRegistered: true,
      minTurnoverLakhs: 500, // ₹5 Crore (as of Aug 2023)
    },
    effectiveFrom: '2023-08-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Threshold reduced progressively: ₹500Cr (Oct 2020) → ₹5Cr (Aug 2023). Further reduction expected.',
    applicabilityReason: 'E-invoicing mandatory for GST-registered businesses with turnover > ₹5Cr',
  },

  // ── GST Audit (Turnover > ₹5Cr) ────────────────────────────────────

  {
    id: 'gstr9c-reconciliation',
    name: 'GSTR-9C — GST Reconciliation Statement',
    category: 'GST',
    act: 'Central Goods and Services Tax Act, 2017',
    section: 'Section 35(5) read with Section 44',
    authority: 'GSTN / CBIC',
    frequency: 'annual',
    dueDateFormula: 'fixed:dec31',
    dueDescription: '31st December of the following financial year',
    penalty: '₹200/day (₹100 CGST + ₹100 SGST), max 0.25% of turnover',
    isCritical: false,
    documentsRequired: ['GSTR-9C (self-certified reconciliation)', 'Audited financial statements'],
    sourceUrl: 'https://www.gst.gov.in/',
    conditions: {
      isGstRegistered: true,
      minTurnoverLakhs: 500, // ₹5 Crore
    },
    effectiveFrom: '2017-07-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'From FY 2020-21, GSTR-9C is self-certified (no CA certification required).',
    applicabilityReason: 'GSTR-9C mandatory for GST-registered businesses with turnover > ₹5Cr',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GST-REGISTERED (Boolean flag)
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'gstr1-monthly',
    name: 'GSTR-1 — Monthly Outward Supplies Return',
    category: 'GST',
    act: 'Central Goods and Services Tax Act, 2017',
    section: 'Section 37',
    authority: 'GSTN / CBIC',
    frequency: 'monthly',
    dueDateFormula: 'day:11,offset:+1month',
    dueDescription: '11th of the following month',
    penalty: '₹50/day (₹25 CGST + ₹25 SGST), max ₹5,000. Late fee doubles for nil return to ₹20/day.',
    isCritical: true,
    documentsRequired: ['Sales invoices', 'Credit/debit notes', 'Export invoices'],
    sourceUrl: 'https://www.gst.gov.in/',
    conditions: {
      isGstRegistered: true,
    },
    effectiveFrom: '2017-07-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Taxpayers with turnover ≤ ₹5Cr can opt for QRMP scheme (quarterly GSTR-1 + monthly IFF).',
    applicabilityReason: 'Every GST-registered person must file GSTR-1 for outward supplies',
  },

  {
    id: 'gstr3b-monthly',
    name: 'GSTR-3B — Monthly Summary Return & Tax Payment',
    category: 'GST',
    act: 'Central Goods and Services Tax Act, 2017',
    section: 'Section 39',
    authority: 'GSTN / CBIC',
    frequency: 'monthly',
    dueDateFormula: 'day:20,offset:+1month',
    dueDescription: '20th of the following month',
    penalty: '₹50/day (₹25 CGST + ₹25 SGST), max ₹5,000. Interest @ 18% p.a. on tax paid late.',
    isCritical: true,
    documentsRequired: ['Summary of outward/inward supplies', 'ITC details', 'Tax payment challan'],
    sourceUrl: 'https://www.gst.gov.in/',
    conditions: {
      isGstRegistered: true,
    },
    effectiveFrom: '2017-07-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'QRMP taxpayers file quarterly with monthly PMT-06 challan.',
    applicabilityReason: 'Every GST-registered person must file GSTR-3B monthly',
  },

  {
    id: 'gstr9-annual',
    name: 'GSTR-9 — Annual GST Return',
    category: 'GST',
    act: 'Central Goods and Services Tax Act, 2017',
    section: 'Section 44',
    authority: 'GSTN / CBIC',
    frequency: 'annual',
    dueDateFormula: 'fixed:dec31',
    dueDescription: '31st December of the following financial year',
    penalty: '₹200/day (₹100 CGST + ₹100 SGST), max 0.25% of turnover in the state/UT',
    isCritical: true,
    documentsRequired: ['GSTR-9 form', 'Monthly/quarterly return data', 'ITC reconciliation'],
    sourceUrl: 'https://www.gst.gov.in/',
    conditions: {
      isGstRegistered: true,
    },
    effectiveFrom: '2017-07-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Exempted for taxpayers with turnover ≤ ₹2Cr (optional). This rule applies to all GST-registered; engine should skip if turnover < 200L when data is available.',
    applicabilityReason: 'Every GST-registered person must file GSTR-9 annual return',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // NET WORTH / CSR THRESHOLDS
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'csr-applicability',
    name: 'CSR — Corporate Social Responsibility',
    category: 'RoC',
    act: 'Companies Act, 2013',
    section: 'Section 135',
    authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'annual',
    dueDateFormula: 'months_after_fy_end:6,day:30',
    dueDescription: 'CSR spending in the FY. Report in Board Report by AGM.',
    penalty: 'Unspent amount must be transferred to Fund specified in Schedule VII within 6 months of FY end. ₹50,000–₹25,00,000 on company. ₹50,000–₹5,00,000 on officer.',
    isCritical: true,
    documentsRequired: ['CSR Policy', 'CSR Committee Minutes', 'CSR Annual Report (Annexure to Board Report)', 'Form CSR-2'],
    sourceUrl: 'https://www.mca.gov.in/MinistryV2/csrdirective.html',
    conditions: {
      minNetWorthCrores: 500, // OR turnover ≥ ₹1000Cr OR net profit ≥ ₹5Cr
    },
    effectiveFrom: '2014-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Triggered if ANY of: net worth ≥ ₹500Cr, turnover ≥ ₹1000Cr, or net profit ≥ ₹5Cr in preceding FY. Must spend 2% of avg net profit of 3 preceding FYs.',
    applicabilityReason: 'CSR mandatory for companies with net worth ≥ ₹500Cr (also applies if turnover ≥ ₹1000Cr or net profit ≥ ₹5Cr)',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // LISTED COMPANY REQUIREMENTS
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'sebi-listing-quarterly',
    name: 'SEBI — Quarterly Financial Results',
    category: 'SEBI',
    act: 'SEBI (Listing Obligations and Disclosure Requirements) Regulations, 2015',
    section: 'Regulation 33',
    authority: 'SEBI',
    frequency: 'quarterly',
    dueDateFormula: 'quarterly:may15,aug14,nov14,feb14',
    dueDescription: 'Within 45 days of quarter end (60 days for last quarter with audited results)',
    penalty: 'Fine up to ₹25Cr. Trading halt for non-compliance.',
    isCritical: true,
    documentsRequired: ['Quarterly Financial Results', 'Limited Review Report from Auditor', 'Board Resolution'],
    sourceUrl: 'https://www.sebi.gov.in/legal/regulations/feb-2023/securities-and-exchange-board-of-india-listing-obligations-and-disclosure-requirements-regulations-2015-last-amended-on-february-07-2023-_68710.html',
    conditions: {
      isListed: true,
    },
    effectiveFrom: '2015-12-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'Listed companies must file quarterly results with stock exchange under SEBI LODR',
  },

  {
    id: 'sebi-corporate-governance',
    name: 'SEBI — Quarterly Corporate Governance Report',
    category: 'SEBI',
    act: 'SEBI (LODR) Regulations, 2015',
    section: 'Regulation 27',
    authority: 'SEBI',
    frequency: 'quarterly',
    dueDateFormula: 'quarterly:apr21,jul21,oct21,jan21',
    dueDescription: 'Within 21 days of quarter end',
    penalty: 'Fine + potential trading suspension.',
    isCritical: true,
    documentsRequired: ['Corporate Governance Report', 'Compliance Certificate from CS'],
    sourceUrl: 'https://www.sebi.gov.in/',
    conditions: {
      isListed: true,
    },
    effectiveFrom: '2015-12-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'Listed companies must file quarterly corporate governance report',
  },

  {
    id: 'sebi-shareholding-quarterly',
    name: 'SEBI — Quarterly Shareholding Pattern',
    category: 'SEBI',
    act: 'SEBI (LODR) Regulations, 2015',
    section: 'Regulation 31',
    authority: 'SEBI',
    frequency: 'quarterly',
    dueDateFormula: 'quarterly:apr21,jul21,oct21,jan21',
    dueDescription: 'Within 21 days of quarter end',
    penalty: 'Fine up to ₹25Cr.',
    isCritical: false,
    documentsRequired: ['Shareholding Pattern in prescribed format'],
    sourceUrl: 'https://www.sebi.gov.in/',
    conditions: {
      isListed: true,
    },
    effectiveFrom: '2015-12-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'Listed companies must disclose shareholding pattern quarterly',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // IMPORT/EXPORT
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'iec-registration',
    name: 'IEC (Import Export Code) — Registration',
    category: 'Others',
    act: 'Foreign Trade (Development & Regulation) Act, 1992',
    section: 'Section 7',
    authority: 'DGFT (Directorate General of Foreign Trade)',
    frequency: 'one-time',
    dueDateFormula: 'event-based:before_first_transaction',
    dueDescription: 'Before first import/export transaction',
    penalty: 'Import/export without IEC is illegal. Goods can be confiscated.',
    isCritical: true,
    documentsRequired: ['Form ANF-2A', 'PAN', 'Bank certificate', 'Address proof'],
    sourceUrl: 'https://www.dgft.gov.in/',
    conditions: {
      hasImportsExports: true,
    },
    effectiveFrom: '1992-08-07',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'IEC mandatory for all import/export businesses',
  },

  {
    id: 'iec-annual-update',
    name: 'IEC — Annual Update (April–June)',
    category: 'Renewals',
    act: 'Foreign Trade Policy 2023',
    section: 'Para 2.05(d)',
    authority: 'DGFT',
    frequency: 'annual',
    dueDateFormula: 'fixed:jun30',
    dueDescription: 'Between April and June every year',
    penalty: 'IEC deactivated if not updated. Cannot import/export.',
    isCritical: true,
    documentsRequired: ['Updated IEC details on DGFT portal'],
    sourceUrl: 'https://www.dgft.gov.in/',
    conditions: {
      hasImportsExports: true,
    },
    effectiveFrom: '2023-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'IEC holders must update their IEC annually between April–June',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DPIIT STARTUP
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'startup-self-certification',
    name: 'Startup India — Self-Certification Compliance',
    category: 'Others',
    act: 'Startup India Action Plan',
    section: 'DPIIT Notification dated 19 Feb 2019',
    authority: 'DPIIT',
    frequency: 'annual',
    dueDateFormula: 'months_after_fy_end:3,day:30',
    dueDescription: 'Self-certify compliance with 6 labour and 3 environmental laws',
    penalty: 'Loss of startup benefits. No inspection exemption.',
    isCritical: false,
    documentsRequired: ['Self-certification form on Startup India portal'],
    sourceUrl: 'https://www.startupindia.gov.in/',
    conditions: {
      isStartupDpiit: true,
    },
    effectiveFrom: '2019-02-19',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Recognized startups get 3-year exemption from labour law inspections if they self-certify.',
    applicabilityReason: 'DPIIT-recognized startups must self-certify compliance annually to maintain benefits',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // MSME
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'udyam-registration',
    name: 'Udyam Registration (MSME)',
    category: 'Others',
    act: 'MSMED Act, 2006',
    section: 'Section 8 read with Notification dt. 26 Jun 2020',
    authority: 'Ministry of MSME',
    frequency: 'one-time',
    dueDateFormula: 'event-based:voluntary',
    dueDescription: 'Voluntary but required to avail MSME benefits',
    penalty: 'No penalty for non-registration, but loses all MSME benefits (priority lending, subsidies, delayed payment protection).',
    isCritical: false,
    documentsRequired: ['Aadhaar of proprietor/partner/director', 'PAN', 'GSTIN (if registered)'],
    sourceUrl: 'https://udyamregistration.gov.in/',
    conditions: {
      isMsme: true,
    },
    effectiveFrom: '2020-07-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Micro: Investment ≤ ₹1Cr & Turnover ≤ ₹5Cr. Small: Investment ≤ ₹10Cr & Turnover ≤ ₹50Cr. Medium: Investment ≤ ₹50Cr & Turnover ≤ ₹250Cr.',
    applicabilityReason: 'MSMEs should register on Udyam for government benefits and protections',
  },
]
