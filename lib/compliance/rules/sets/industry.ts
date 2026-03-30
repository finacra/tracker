/**
 * Industry-Specific Rules — Based on NIC Division / Section
 *
 * These rules apply to companies in specific industries identified by their
 * NIC (National Industrial Classification) code.
 *
 * NIC Sections: A-U (single letter)
 * NIC Divisions: 01-99 (two digits)
 * NIC Codes: 5-digit specific codes
 *
 * Key industries covered:
 * - Manufacturing (Section C, Divisions 10-33)
 * - Food & Beverage (Divisions 10, 11, 56)
 * - IT/Software (Division 62, 63)
 * - Construction (Section F, Divisions 41-43)
 * - Financial Services (Section K, Divisions 64-66)
 * - Healthcare (Division 86)
 * - Education (Division 85)
 * - Transport (Section H, Divisions 49-53)
 * - Hospitality (Section I, Divisions 55-56)
 */

import type { ComplianceRule } from '../types'

export const INDUSTRY_RULES: ComplianceRule[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // MANUFACTURING (Section C — Divisions 10-33)
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'factory-license',
    name: 'Factory License & Registration',
    category: 'Industry-Specific',
    act: 'Factories Act, 1948',
    section: 'Section 6',
    authority: 'Chief Inspector of Factories (State)',
    frequency: 'annual',
    dueDateFormula: 'fixed:dec31',
    dueDescription: 'Renewal before 31st December every year (or as per state)',
    penalty: 'Imprisonment up to 2 years or fine up to ₹2,00,000 or both. Operating without license is criminal offence.',
    isCritical: true,
    documentsRequired: ['Form 2 (Application)', 'Factory Plan', 'NOC from Fire/Pollution', 'Stability Certificate'],
    sourceUrl: 'https://labour.gov.in/sites/default/files/TheFactoriesAct1948.pdf',
    conditions: {
      nicSections: ['C'], // Manufacturing
    },
    effectiveFrom: '1948-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Applicable to premises with 10+ workers (with power) or 20+ workers (without power). Registration under Section 6, License under Section 7.',
    applicabilityReason: 'Manufacturing establishments must obtain and renew factory license under Factories Act',
  },

  {
    id: 'factory-annual-return',
    name: 'Factory Annual Return',
    category: 'Industry-Specific',
    act: 'Factories Act, 1948',
    section: 'Section 110',
    authority: 'Chief Inspector of Factories (State)',
    frequency: 'annual',
    dueDateFormula: 'fixed:feb01',
    dueDescription: 'Within 30 days of year-end (1st February for calendar year)',
    penalty: 'Fine up to ₹2,00,000.',
    isCritical: false,
    documentsRequired: ['Form 21 (Annual Return)', 'Employment data', 'Leave/absence records'],
    sourceUrl: 'https://labour.gov.in/',
    conditions: {
      nicSections: ['C'],
    },
    effectiveFrom: '1948-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'All registered factories must file annual return',
  },

  {
    id: 'pollution-consent-manufacturing',
    name: 'Consent to Operate (CTO) — Pollution Control Board',
    category: 'Industry-Specific',
    act: 'Water (Prevention and Control of Pollution) Act, 1974 & Air (Prevention and Control of Pollution) Act, 1981',
    section: 'Section 25 (Water Act) / Section 21 (Air Act)',
    authority: 'State Pollution Control Board (SPCB)',
    frequency: 'annual',
    dueDateFormula: 'event-based:renewal_before_expiry',
    dueDescription: 'Before existing consent expires (typically annual or 5-yearly based on category)',
    penalty: 'Imprisonment up to 6 years + fine. Closure order by SPCB.',
    isCritical: true,
    documentsRequired: ['Form IV (Application)', 'Environmental Clearance', 'Emission/effluent test reports', 'Waste management plan'],
    sourceUrl: 'https://cpcb.nic.in/',
    conditions: {
      nicSections: ['C'], // Manufacturing
    },
    effectiveFrom: '1974-03-23',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Red/Orange/Green/White categories have different consent validity. Red: annual renewal. Green: 5 years.',
    applicabilityReason: 'Manufacturing units must obtain Consent to Operate from SPCB for water and air pollution',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // FOOD & BEVERAGE (Divisions 10, 11, 56)
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'fssai-license',
    name: 'FSSAI Food License / Registration',
    category: 'Industry-Specific',
    act: 'Food Safety and Standards Act, 2006',
    section: 'Section 31',
    authority: 'FSSAI (Food Safety and Standards Authority of India)',
    frequency: 'annual',
    dueDateFormula: 'event-based:renewal_before_expiry',
    dueDescription: 'Renewal 30 days before license expiry (1–5 year validity)',
    penalty: '₹2,00,000 to ₹5,00,000 fine. Imprisonment up to 6 months. License cancellation.',
    isCritical: true,
    documentsRequired: ['Form A/B', 'Food Safety Management Plan', 'NOC from Municipal Authority', 'Water test report', 'Medical fitness certificates'],
    sourceUrl: 'https://www.fssai.gov.in/',
    conditions: {
      nicDivisions: ['10', '11', '56'], // Food manufacturing, beverages, food service
    },
    effectiveFrom: '2006-08-23',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Registration for turnover < ₹12L. State License: ₹12L–₹20Cr. Central License: > ₹20Cr or multiple states.',
    applicabilityReason: 'All food businesses must have FSSAI registration/license',
  },

  {
    id: 'fssai-annual-return',
    name: 'FSSAI Annual Return',
    category: 'Industry-Specific',
    act: 'Food Safety and Standards Act, 2006',
    section: 'FSS (Licensing and Registration) Regulation 2011, Regulation 2.1.13',
    authority: 'FSSAI',
    frequency: 'annual',
    dueDateFormula: 'fixed:may31',
    dueDescription: '31st May every year (for previous FY)',
    penalty: 'Up to ₹5,00,000 fine per violation.',
    isCritical: false,
    documentsRequired: ['Form D-1 (Annual Return)', 'Product-wise production/sales data'],
    sourceUrl: 'https://foscos.fssai.gov.in/',
    conditions: {
      nicDivisions: ['10', '11', '56'],
    },
    effectiveFrom: '2011-08-05',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'FSSAI license holders must file annual return',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CONSTRUCTION (Section F — Divisions 41-43)
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'bocw-registration',
    name: 'BOCW Registration (Building & Other Construction Workers)',
    category: 'Industry-Specific',
    act: 'Building and Other Construction Workers (Regulation of Employment and Conditions of Service) Act, 1996',
    section: 'Section 7',
    authority: 'State Labour Department',
    frequency: 'event-based',
    dueDateFormula: 'event-based:before_construction_start',
    dueDescription: 'Before commencement of construction (if 10+ workers and project cost > ₹10L)',
    penalty: 'Imprisonment up to 3 months or fine up to ₹2,000 or both.',
    isCritical: true,
    documentsRequired: ['Form I (Application for Registration)', 'Project details', 'Workforce estimate'],
    sourceUrl: 'https://labour.gov.in/',
    conditions: {
      nicDivisions: ['41', '42', '43'], // Construction
    },
    effectiveFrom: '1996-06-19',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Applies to construction projects employing 10+ workers. Cost threshold: ₹10 lakhs. BOCW cess: 1% of construction cost.',
    applicabilityReason: 'Construction companies must register under BOCW Act',
  },

  {
    id: 'bocw-cess',
    name: 'BOCW Cess — 1% of Construction Cost',
    category: 'Industry-Specific',
    act: 'Building and Other Construction Workers Welfare Cess Act, 1996',
    section: 'Section 3',
    authority: 'State Labour Department',
    frequency: 'event-based',
    dueDateFormula: 'event-based:within_30days_of_completion',
    dueDescription: 'Within 30 days of completion of construction or as per state rules',
    penalty: 'Interest at not exceeding 2% per month. Recovery as arrears of land revenue.',
    isCritical: false,
    documentsRequired: ['Cess Payment Challan', 'Project cost certificate'],
    sourceUrl: 'https://labour.gov.in/',
    conditions: {
      nicDivisions: ['41', '42', '43'],
    },
    effectiveFrom: '1996-06-19',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'Construction projects must pay 1% BOCW cess',
  },

  {
    id: 'rera-registration',
    name: 'RERA Registration — Real Estate Projects',
    category: 'Industry-Specific',
    act: 'Real Estate (Regulation and Development) Act, 2016',
    section: 'Section 3',
    authority: 'State RERA Authority',
    frequency: 'event-based',
    dueDateFormula: 'event-based:before_marketing',
    dueDescription: 'Before advertising / selling / marketing any real estate project',
    penalty: 'Up to 10% of estimated project cost. Imprisonment up to 3 years for continued non-compliance.',
    isCritical: true,
    documentsRequired: ['Form A', 'Project layout plan', 'Approved building plan', 'Promoter details', 'Encumbrance certificate'],
    sourceUrl: 'https://rera.gov.in/',
    conditions: {
      nicDivisions: ['41'], // Building construction / real estate
    },
    effectiveFrom: '2017-05-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Exempted for projects < 500 sq.m. or < 8 apartments. Each state has its own RERA portal.',
    applicabilityReason: 'Real estate developers must register projects under RERA before marketing',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // FINANCIAL SERVICES (Section K — Divisions 64-66)
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'rbi-nbfc-compliance',
    name: 'RBI — NBFC Annual Compliance Return',
    category: 'Industry-Specific',
    act: 'Reserve Bank of India Act, 1934',
    section: 'Chapter IIIB — Sections 45-IA to 45-IC',
    authority: 'Reserve Bank of India (RBI)',
    frequency: 'annual',
    dueDateFormula: 'months_after_fy_end:3,day:30',
    dueDescription: 'Within 3 months of financial year end (30th June)',
    penalty: 'Cancellation of Certificate of Registration. Fine and imprisonment.',
    isCritical: true,
    documentsRequired: ['NBS-7 (Quarterly)', 'Annual Return on Deposits', 'Auditor Certificate', 'Corporate Governance Report'],
    sourceUrl: 'https://www.rbi.org.in/',
    conditions: {
      nicDivisions: ['64', '65', '66'], // Financial and insurance activities
    },
    effectiveFrom: '1934-04-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'NBFCs must also file quarterly NBS-7 returns. Scale-based regulation applies from 2023.',
    applicabilityReason: 'NBFCs and financial service companies must comply with RBI reporting',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // HEALTHCARE (Division 86)
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'ceh-registration',
    name: 'Clinical Establishment Registration',
    category: 'Industry-Specific',
    act: 'Clinical Establishments (Registration and Regulation) Act, 2010',
    section: 'Section 11',
    authority: 'State Health Department',
    frequency: 'annual',
    dueDateFormula: 'event-based:renewal_before_expiry',
    dueDescription: 'Registration valid for 5 years, renewal before expiry',
    penalty: 'Fine up to ₹5,00,000. Closure of establishment.',
    isCritical: true,
    documentsRequired: ['Form A (Application)', 'Qualified staff details', 'Equipment list', 'Infrastructure details'],
    sourceUrl: 'https://www.clinicalestablishments.gov.in/',
    conditions: {
      nicDivisions: ['86'], // Human health activities
    },
    effectiveFrom: '2012-03-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Applicable in states that have adopted the Central Act. Some states have own acts (e.g., Karnataka Private Medical Establishments Act).',
    applicabilityReason: 'Healthcare establishments must register under Clinical Establishments Act',
  },

  {
    id: 'biomedical-waste',
    name: 'Bio-Medical Waste Management — Authorization',
    category: 'Industry-Specific',
    act: 'Bio-Medical Waste Management Rules, 2016',
    section: 'Rule 4',
    authority: 'State Pollution Control Board',
    frequency: 'annual',
    dueDateFormula: 'event-based:renewal_before_expiry',
    dueDescription: 'Authorization valid for 3 years, renewal before expiry. Annual report by 30th June.',
    penalty: 'Imprisonment up to 5 years + fine up to ₹1,00,000 (Environment Protection Act, 1986).',
    isCritical: true,
    documentsRequired: ['Form II (Application for Authorization)', 'Waste management plan', 'Agreement with CBWTF'],
    sourceUrl: 'https://cpcb.nic.in/bio-medical-waste/',
    conditions: {
      nicDivisions: ['86'], // Human health activities
    },
    effectiveFrom: '2016-03-28',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'Healthcare facilities must obtain authorization for biomedical waste management',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // EDUCATION (Division 85)
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'education-recognition',
    name: 'School/College Recognition & Affiliation',
    category: 'Industry-Specific',
    act: 'Right of Children to Free and Compulsory Education Act, 2009 / University Grants Commission Act, 1956',
    section: 'Section 18 (RTE) / Section 2(f) & 12B (UGC)',
    authority: 'State Education Department / UGC / AICTE',
    frequency: 'event-based',
    dueDateFormula: 'event-based:before_commencement',
    dueDescription: 'Before starting educational operations',
    penalty: 'Illegal operation — fine up to ₹1,00,000 + ₹10,000/day for continuation.',
    isCritical: true,
    documentsRequired: ['NOC from state government', 'Infrastructure details', 'Faculty qualifications', 'Land records'],
    sourceUrl: 'https://www.ugc.ac.in/',
    conditions: {
      nicDivisions: ['85'], // Education
    },
    effectiveFrom: '2009-08-26',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Schools: state recognition + CBSE/ICSE affiliation. Colleges: UGC recognition. Technical: AICTE approval.',
    applicabilityReason: 'Educational institutions must obtain recognition/affiliation',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TRANSPORT & LOGISTICS (Section H — Divisions 49-53)
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'transport-permit',
    name: 'Commercial Vehicle Permit & Road Tax',
    category: 'Industry-Specific',
    act: 'Motor Vehicles Act, 1988',
    section: 'Section 66',
    authority: 'State Transport Authority',
    frequency: 'annual',
    dueDateFormula: 'event-based:renewal_before_expiry',
    dueDescription: 'Permit renewal before expiry (5 years for goods carrier)',
    penalty: 'Fine up to ₹10,000 for first offence. Vehicle seizure.',
    isCritical: true,
    documentsRequired: ['Permit application', 'Vehicle RC', 'Insurance', 'Fitness Certificate', 'Road Tax receipt'],
    sourceUrl: 'https://parivahan.gov.in/',
    conditions: {
      nicDivisions: ['49', '50', '51', '52', '53'], // Transport & warehousing
    },
    effectiveFrom: '1988-07-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'Transport companies must maintain valid permits for commercial vehicles',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // HOSPITALITY (Section I — Divisions 55-56)
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'fire-safety-hospitality',
    name: 'Fire Safety NOC — Hotels & Restaurants',
    category: 'Industry-Specific',
    act: 'National Building Code of India / State Fire Safety Acts',
    section: 'Varies by state',
    authority: 'State Fire Service Department',
    frequency: 'annual',
    dueDateFormula: 'event-based:renewal_before_expiry',
    dueDescription: 'Renewal before expiry (typically annual)',
    penalty: 'Closure order. Criminal liability in case of fire incident.',
    isCritical: true,
    documentsRequired: ['Fire NOC Application', 'Building plan', 'Fire safety equipment details', 'Fire drill records'],
    sourceUrl: 'https://firenoc.gov.in/',
    conditions: {
      nicDivisions: ['55', '56'], // Accommodation and food service
    },
    effectiveFrom: '2005-01-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Mandatory for all hotels, restaurants, and commercial buildings. Some states require annual audit.',
    applicabilityReason: 'Hotels and restaurants must obtain and renew Fire Safety NOC',
  },

  {
    id: 'eating-house-license',
    name: 'Eating House / Trade License',
    category: 'Industry-Specific',
    act: 'Municipal Corporation Act / Police Act (varies by state)',
    section: 'Varies by state/city',
    authority: 'Municipal Corporation / Local Police',
    frequency: 'annual',
    dueDateFormula: 'event-based:renewal_before_expiry',
    dueDescription: 'Annual renewal (typically before 31st March)',
    penalty: 'Closure of establishment. Fine varies by municipality.',
    isCritical: true,
    documentsRequired: ['Application form', 'FSSAI license', 'Premises proof', 'Health Trade License'],
    sourceUrl: 'https://www.mcgm.gov.in/',
    conditions: {
      nicDivisions: ['56'], // Food service activities (restaurants, catering)
    },
    effectiveFrom: '1888-01-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    applicabilityReason: 'Restaurants and eating houses must obtain municipal eating house license',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // IT / SOFTWARE (Divisions 62, 63)
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'stpi-registration',
    name: 'STPI Registration (Software Technology Parks of India)',
    category: 'Industry-Specific',
    act: 'STPI Scheme / SEZ Act, 2005',
    section: 'STPI Guidelines',
    authority: 'Ministry of Electronics and IT (MeitY) / STPI',
    frequency: 'one-time',
    dueDateFormula: 'event-based:voluntary',
    dueDescription: 'Voluntary registration for export-oriented IT/software companies',
    penalty: 'No penalty for non-registration, but loses benefits (customs duty exemption, single-window clearance).',
    isCritical: false,
    documentsRequired: ['Application to STPI', 'Business plan', 'Export commitment', 'Company registration documents'],
    sourceUrl: 'https://www.stpi.in/',
    conditions: {
      nicDivisions: ['62', '63'], // Computer programming, consultancy, information service
    },
    effectiveFrom: '1991-01-01',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Benefits include customs duty exemption on imports, CST reimbursement, single-window clearance. Useful for export-oriented IT companies.',
    applicabilityReason: 'IT/software companies doing exports may benefit from STPI registration',
  },

  {
    id: 'it-sez-compliance',
    name: 'SEZ Annual Compliance — IT/ITES Units',
    category: 'Industry-Specific',
    act: 'Special Economic Zones Act, 2005',
    section: 'Rule 22',
    authority: 'Development Commissioner, SEZ',
    frequency: 'annual',
    dueDateFormula: 'months_after_fy_end:3,day:30',
    dueDescription: 'Annual Performance Report within 3 months of FY end',
    penalty: 'Cancellation of LOA (Letter of Approval). Duty recovery on imported goods.',
    isCritical: false,
    documentsRequired: ['Annual Performance Report (APR)', 'NFE calculation', 'Export/import details'],
    sourceUrl: 'https://www.nsez.gov.in/',
    conditions: {
      nicDivisions: ['62', '63'],
    },
    effectiveFrom: '2006-02-10',
    lastVerified: '2026-03-15',
    verifiedBy: 'System',
    notes: 'Only applicable if the company is located in an SEZ. The NIC code match is a first filter; actual applicability depends on SEZ status.',
    applicabilityReason: 'IT companies in SEZ must file annual performance report',
  },
]
