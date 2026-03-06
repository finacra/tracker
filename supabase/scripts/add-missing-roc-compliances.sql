-- ============================================
-- ADD MISSING ROC (COMPANIES ACT) COMPLIANCES
-- Based on comprehensive compliance calendar
-- ============================================

-- First, let's add the missing templates
INSERT INTO public.compliance_templates (
  category,
  requirement,
  description,
  compliance_type,
  entity_types,
  penalty,
  is_critical,
  due_month,
  due_day,
  is_active
) VALUES

-- ============================================
-- ANNUAL COMPLIANCES (with specific due dates)
-- ============================================

-- PAS-6 (Half-yearly Audit Report - Oct to Mar) - Due 30th May
(
  'RoC',
  'PAS-6 - Half-yearly Audit Report (Oct-Mar)',
  'Half yearly Audit Report from October to March of Reconciliation of Share Capital by Unlisted Public Companies',
  'annual',
  ARRAY['Public Limited Company'],
  'Rs. 1 Lakh + Rs. 500 per day of default.',
  FALSE,
  5, -- May
  30,
  TRUE
),

-- FC-4 (Annual Return of Foreign Company) - Due 30th May
(
  'RoC',
  'FC-4 - Annual Return of Foreign Company',
  'Annual Return of Foreign Company (Branch / Liaison / Project Office) for the previous FY',
  'annual',
  NULL, -- Foreign companies
  'Rs. 1 Lakh + Rs. 500 per day.',
  FALSE,
  5, -- May
  30,
  TRUE
),

-- NDH-1 (Return of Statutory Compliances) - Due 29th June
(
  'RoC',
  'NDH-1 - Return of Statutory Compliances',
  'Return of Statutory Compliances within 90 days from the close of the first financial year after incorporation (Nidhi Companies)',
  'annual',
  NULL, -- Nidhi Companies
  'Penalty as per Companies Act.',
  FALSE,
  6, -- June
  29,
  TRUE
),

-- Dematerialization of Shares - Due 30th June
(
  'RoC',
  'Demat Form - Dematerialization of Securities',
  'All private companies (other than OPC and small companies) to dematerialize their existing shares, debentures and other securities in Demat form only',
  'annual',
  ARRAY['Private Limited Company'],
  'Penalty as per Companies Act.',
  FALSE,
  6, -- June
  30,
  TRUE
),

-- MBP-1 (Director''s Disclosure of Interest) - Due 30th June
(
  'RoC',
  'MBP-1 - Director Disclosure of Interest',
  'Director''s Disclosure of Interest and Non-disqualification by Companies. Discloses Director''s interest in Companies, Firms, Body Corporates and Association of Individuals',
  'annual',
  NULL, -- All companies with directors
  'Penalty as per Companies Act.',
  FALSE,
  6, -- June
  30,
  TRUE
),

-- DIR-8 (Yearly Disclosure of Non-Disqualification) - Due 30th June
(
  'RoC',
  'DIR-8 - Disclosure of Non-Disqualification',
  'Yearly Disclosure of Non-Disqualification by Directors of all companies. Discloses Director''s interest only in Companies',
  'annual',
  NULL, -- All companies
  'Penalty as per Companies Act.',
  FALSE,
  6, -- June
  30,
  TRUE
),

-- CSR-2 (Standalone CSR Report) - Due 30th June
(
  'RoC',
  'CSR-2 - Annual CSR Report',
  'Standalone Annual Report on Corporate Social Responsibility by Companies to whom CSR is applicable',
  'annual',
  ARRAY['Private Limited Company', 'Public Limited Company'],
  'Penalty as per Companies Act.',
  FALSE,
  6, -- June
  30,
  TRUE
),

-- AOC-4 (OPC Companies) - Due 27th September
(
  'RoC',
  'AOC-4 (OPC) - Filing of Financial Statements',
  'Filing of Financial Statements by OPC Companies (180 days from end of FY)',
  'annual',
  NULL, -- OPC
  'Rs. 100 per day.',
  FALSE,
  9, -- September
  27,
  TRUE
),

-- Cost Audit Report Submission to Board - Due 27th September
(
  'RoC',
  'Cost Audit Report - Submission to Board',
  'Submission of Cost Audit Report by Cost Auditor to the Board of Directors',
  'annual',
  ARRAY['Private Limited Company', 'Public Limited Company'],
  'Penalty as per Companies Act.',
  FALSE,
  9, -- September
  27,
  TRUE
),

-- Transfer of Unspent CSR - Due 30th September
(
  'RoC',
  'CSR Fund Transfer - Unspent Amount',
  'Transfer of unspent CSR amount to the CSR fund by All Companies whose CSR Expenditure is unspent as on 31st March and such amount is not marked for any ongoing project',
  'annual',
  ARRAY['Private Limited Company', 'Public Limited Company'],
  'Penalty as per Companies Act.',
  TRUE,
  9, -- September
  30,
  TRUE
),

-- AGM (Annual General Meeting) - Due 30th September
(
  'RoC',
  'AGM - Annual General Meeting',
  'Annual General Meeting of All Companies (within 6 months from end of FY)',
  'annual',
  ARRAY['Private Limited Company', 'Public Limited Company'],
  'Rs. 1 Lakh on Company + Rs. 5000 per day on officers.',
  TRUE,
  9, -- September
  30,
  TRUE
),

-- FC-3 (Annual Accounts of Foreign Company) - Due 30th September
(
  'RoC',
  'FC-3 - Annual Accounts of Foreign Company',
  'Annual accounts along with the list of all principal places of business in India established by a foreign company (Branch / Liaison / Project Office)',
  'annual',
  NULL, -- Foreign companies
  'Rs. 1 Lakh + Rs. 500 per day.',
  FALSE,
  9, -- September
  30,
  TRUE
),

-- MGT-8 (Certification of Annual Return) - Due 30th September
(
  'RoC',
  'MGT-8 - Certification of Annual Return',
  'Certification of Company''s Annual Return by a Practising Company Secretary in case of listed Company, Company having paid-up share capital of 10 crore rupees or more or turnover of 50 crore rupees or more',
  'annual',
  ARRAY['Public Limited Company'],
  'Penalty as per Companies Act.',
  FALSE,
  9, -- September
  30,
  TRUE
),

-- MR-3 (Secretarial Audit Report) - Due 30th September
(
  'RoC',
  'MR-3 - Secretarial Audit Report',
  'Secretarial Audit Report applicable in case of: (i) Listed Companies (ii) public company having paid-up share capital of 50 crore rupees or more; or (iii) public company having a turnover of 250 crore rupees or more; or company having outstanding loans or borrowings from banks or public financial institutions of 100 crore rupees or more',
  'annual',
  ARRAY['Public Limited Company'],
  'Penalty as per Companies Act.',
  TRUE,
  9, -- September
  30,
  TRUE
),

-- Form ADT-1 (Appointment of Auditor Notice) - Due 14th October
(
  'RoC',
  'ADT-1 - Notice for Appointment of Auditor',
  'Notice for the appointment of Auditor if AGM date was 30 Sep (within 15 days of AGM)',
  'annual',
  ARRAY['Private Limited Company', 'Public Limited Company'],
  'Rs. 5000 + Rs. 500 per day of default.',
  FALSE,
  10, -- October
  14,
  TRUE
),

-- Form MGT-15 (Report on AGM by Listed Company) - Due 29th October
(
  'RoC',
  'MGT-15 - Report on AGM by Listed Company',
  'Report on Annual General Meeting by Listed company when AGM held on 30 Sep (within 30 days from completion of AGM)',
  'annual',
  ARRAY['Public Limited Company'],
  'Rs. 1 Lakh + Rs. 500 per day.',
  FALSE,
  10, -- October
  29,
  TRUE
),

-- PAS-6 (Half-yearly Audit Report - Apr to Sep) - Due 29th November
(
  'RoC',
  'PAS-6 - Half-yearly Audit Report (Apr-Sep)',
  'Half yearly Audit Report from April to September of Reconciliation of Share Capital by Unlisted Public Companies',
  'annual',
  ARRAY['Public Limited Company'],
  'Rs. 1 Lakh + Rs. 500 per day of default.',
  FALSE,
  11, -- November
  29,
  TRUE
),

-- NFRA-2 (Statutory Auditor return to NFRA) - Due 30th November
(
  'RoC',
  'NFRA-2 - Annual Return to NFRA',
  'Statutory Auditor to file Annual return with National Financial Reporting Authority (NFRA) in respect of entities covered in Clause 3(1)(a) to 3(1)(e) of NFRA Rules 2018. It will not cover tax audits, Limited review & Quarterly audits',
  'annual',
  ARRAY['Public Limited Company'],
  'Penalty as per Companies Act.',
  FALSE,
  11, -- November
  30,
  TRUE
),

-- XBRL DNBS-10 (Statutory Auditor Certificate for NBFCs) - Due 31st December
(
  'RoC',
  'XBRL DNBS-10 - Statutory Auditor Certificate (NBFCs)',
  'Furnishing of Statutory Auditor Certificate in case of NBFCs with assets of value more than Rs. 100 Crore',
  'annual',
  NULL, -- NBFCs
  'Penalty as per RBI guidelines.',
  FALSE,
  12, -- December
  31,
  TRUE
),

-- Form MGT-7 (Annual Return - Non-OPC) - Due 31st December
(
  'RoC',
  'MGT-7/MGT-8 - Annual Return (Non-OPC)',
  'Annual Return by companies other than OPCs and small companies (within 60 days from AGM)',
  'annual',
  ARRAY['Private Limited Company', 'Public Limited Company'],
  'Rs. 100 per day + Rs. 5 Lakh max.',
  TRUE,
  12, -- December
  31,
  TRUE
),

-- Form CRA-4 (Cost Audit Report Filing) - Due 31st December
(
  'RoC',
  'CRA-4 - Filing of Cost Audit Report',
  'Filing of Cost Audit Report by Company to whom cost audit is applicable (within 30 days of submission by Cost Auditor report)',
  'annual',
  ARRAY['Private Limited Company', 'Public Limited Company'],
  'Penalty as per Companies Act.',
  FALSE,
  12, -- December
  31,
  TRUE
),

-- Form MGT-7A (Annual Return - OPC/Small) - Due 31st January
(
  'RoC',
  'MGT-7A - Annual Return (OPC/Small Companies)',
  'Annual Return by OPCs and Small Companies (within 60 days from AGM)',
  'annual',
  NULL, -- OPC/Small
  'Rs. 100 per day.',
  FALSE,
  1, -- January
  31,
  TRUE
),

-- Form AOC-4/AOC-4 XBRL (Non-OPC) - Due 31st January
(
  'RoC',
  'AOC-4/AOC-4 XBRL - Financial Statements (Non-OPC)',
  'Filing of financial statements by Companies (Other than OPCs) with the ROC (30 days from AGM)',
  'annual',
  ARRAY['Private Limited Company', 'Public Limited Company'],
  'Rs. 100 per day + Rs. 5 Lakh max.',
  TRUE,
  1, -- January
  31,
  TRUE
),

-- CSR-2 Report Filing - Due 31st January
(
  'RoC',
  'CSR-2 - CSR Report Filing',
  'Filing a report on Corporate Social Responsibility by every company covered u/s 135 of the Companies Act, 2013',
  'annual',
  ARRAY['Private Limited Company', 'Public Limited Company'],
  'Penalty as per Companies Act.',
  FALSE,
  1, -- January
  31,
  TRUE
);

-- ============================================
-- QUARTERLY BOARD MEETINGS
-- ============================================

INSERT INTO public.compliance_templates (
  category,
  requirement,
  description,
  compliance_type,
  entity_types,
  penalty,
  is_critical,
  due_month,
  due_day,
  is_active
) VALUES
-- Q1 Board Meeting - Due 30th June
(
  'RoC',
  'Board Meeting - Q1',
  'Holding of Board Meeting by Companies for Q1 (Apr-Jun). Gap between 2 meetings should not exceed 120 days',
  'quarterly',
  ARRAY['Private Limited Company', 'Public Limited Company'],
  'Rs. 25000 to Rs. 1 Lakh on Company, Rs. 5000 to Rs. 25000 on officers.',
  FALSE,
  6, -- June
  30,
  TRUE
),
-- Q2 Board Meeting - Due 30th September
(
  'RoC',
  'Board Meeting - Q2',
  'Holding of Board Meeting by Companies for Q2 (Jul-Sep). Gap between 2 meetings should not exceed 120 days',
  'quarterly',
  ARRAY['Private Limited Company', 'Public Limited Company'],
  'Rs. 25000 to Rs. 1 Lakh on Company, Rs. 5000 to Rs. 25000 on officers.',
  FALSE,
  9, -- September
  30,
  TRUE
),
-- Q3 Board Meeting - Due 31st December
(
  'RoC',
  'Board Meeting - Q3',
  'Holding of Board Meeting by Companies for Q3 (Oct-Dec). Gap between 2 meetings should not exceed 120 days',
  'quarterly',
  ARRAY['Private Limited Company', 'Public Limited Company'],
  'Rs. 25000 to Rs. 1 Lakh on Company, Rs. 5000 to Rs. 25000 on officers.',
  FALSE,
  12, -- December
  31,
  TRUE
),
-- Q4 Board Meeting - Due 31st March
(
  'RoC',
  'Board Meeting - Q4',
  'Holding of Board Meeting by Companies for Q4 (Jan-Mar). Gap between 2 meetings should not exceed 120 days',
  'quarterly',
  ARRAY['Private Limited Company', 'Public Limited Company'],
  'Rs. 25000 to Rs. 1 Lakh on Company, Rs. 5000 to Rs. 25000 on officers.',
  FALSE,
  3, -- March
  31,
  TRUE
);

-- ============================================
-- Verify inserted templates
-- ============================================
SELECT 'New RoC templates added:' AS info;
SELECT requirement, compliance_type, due_month, due_day 
FROM public.compliance_templates 
WHERE category = 'RoC' 
ORDER BY due_month, due_day;

-- ============================================
-- Apply templates to all companies
-- ============================================
SELECT 'Applying new templates to companies...' AS info;

DO $$
DECLARE
  template_rec RECORD;
  applied_count INTEGER;
  total_applied INTEGER := 0;
BEGIN
  FOR template_rec IN 
    SELECT id, requirement FROM public.compliance_templates 
    WHERE category = 'RoC' AND is_active = TRUE
  LOOP
    SELECT public.apply_template_to_companies(template_rec.id) INTO applied_count;
    total_applied := total_applied + COALESCE(applied_count, 0);
    RAISE NOTICE 'Applied template "%": % requirements', template_rec.requirement, applied_count;
  END LOOP;
  
  RAISE NOTICE 'Total RoC requirements created: %', total_applied;
END $$;
