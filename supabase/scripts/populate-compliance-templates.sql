-- ============================================
-- POPULATE COMPLIANCE TEMPLATES FROM CSV DATA
-- ============================================
-- This script populates the compliance_templates table with data from the provided CSV
-- Run this in your SQL editor to insert all compliance templates
--
-- UPDATED: Converted recurring items to proper templates and made one-time items span multiple years

-- ============================================
-- SECTION 1: MONTHLY COMPLIANCES
-- ============================================

INSERT INTO public.compliance_templates (
  category,
  requirement,
  description,
  compliance_type,
  entity_types,
  penalty,
  is_critical,
  due_date_offset,
  is_active
) VALUES
-- Monthly TDS Payment
(
  'Income Tax',
  'ITNS-281 - Monthly TDS Payment',
  'Monthly TDS Payment',
  'monthly',
  NULL, -- All entity types
  'Interest @ 1.5% per month from the date of deduction.',
  FALSE,
  7, -- 7th of next month
  TRUE
),
-- Monthly TCS Payment
(
  'Income Tax',
  'ITNS-281 - Monthly TCS Payment',
  'Monthly TCS Payment',
  'monthly',
  NULL, -- All entity types
  'Interest @ 1.5% per month from the date of deduction.',
  FALSE,
  7, -- 7th of next month
  TRUE
),
-- Monthly PF Payment & PF ECR Return
(
  'Labour Law',
  'PF ECR - Monthly PF Payment & PF ECR Return',
  'Monthly PF Payment & PF ECR Return',
  'monthly',
  NULL, -- All entity types
  '12% Interest p.a. + Penal damages (5% to 25% based on delay).',
  FALSE,
  15, -- 15th of next month
  TRUE
),
-- Monthly ESI Payment & Return
(
  'Labour Law',
  'ESI Challan - Monthly ESI Payment & Return',
  'Monthly ESI Payment & Return',
  'monthly',
  NULL, -- All entity types
  'Interest @ 12% p.a. for each day of delay.',
  FALSE,
  15, -- 15th of next month
  TRUE
),
-- Monthly GSTR-1 Filing (Turnover >5cr)
(
  'GST',
  'GSTR-1 - Monthly Outward Supplies (Turnover >5cr)',
  'Monthly Outward Supplies (Turnover >5cr)',
  'monthly',
  NULL, -- All entity types with turnover > 5Cr
  'Rs. 50 per day (Rs. 20 for NIL return).',
  FALSE,
  11, -- 11th of next month
  TRUE
),
-- GST - IFF Upload (QRMP)
(
  'GST',
  'GSTR-1 - IFF Upload for QRMP filers',
  'IFF Upload for QRMP filers',
  'monthly',
  NULL, -- QRMP filers
  'Rs. 50 per day (Rs. 20 for NIL return).',
  FALSE,
  13, -- 13th of next month
  TRUE
),
-- GST Return - GSTR-3B
(
  'GST',
  'GSTR-3B - Summary Return & Payment',
  'Summary Return & Payment',
  'monthly',
  NULL, -- All entity types (Monthly filers)
  'Interest @ 18% p.a. + Late fee Rs. 50/day (Rs. 20 for NIL).',
  FALSE,
  20, -- 20th of next month
  TRUE
),
-- Professional Tax (Telangana)
(
  'Prof. Tax',
  'Professional Tax (Telangana) - Monthly Professional Tax Return',
  'Monthly Professional Tax Return',
  'monthly',
  NULL, -- All entity types in Telangana
  'Interest @ 2% per month + Penalty up to Rs. 5 per day.',
  FALSE,
  10, -- 10th of next month
  TRUE
),
-- GSTR-7 (Tax Deductors)
(
  'GST',
  'GSTR-7 - Monthly Return by Tax Deductors',
  'Monthly Return by Tax Deductors',
  'monthly',
  NULL, -- Tax Deductors
  'Rs. 50 per day (Rs. 25 CGST + Rs. 25 SGST) up to max Rs. 2000.',
  FALSE,
  10, -- 10th of next month
  TRUE
),
-- GSTR-8 (ECO)
(
  'GST',
  'GSTR-8 - Monthly Return by e-commerce operators',
  'Monthly Return by e-commerce operators',
  'monthly',
  NULL, -- e-commerce operators
  'Rs. 50 per day (Rs. 25 CGST + Rs. 25 SGST) up to max Rs. 2000.',
  FALSE,
  10, -- 10th of next month
  TRUE
),
-- GSTR-5 (Non-resident taxable person)
(
  'GST',
  'GSTR-5 - Monthly Return by Non-resident taxable person',
  'Monthly Return by Non-resident taxable person',
  'monthly',
  NULL, -- Non-resident taxable persons
  'Rs. 50 per day (Rs. 20 for NIL return).',
  FALSE,
  13, -- 13th of next month
  TRUE
),
-- GSTR-6 (Input Service Distributor)
(
  'GST',
  'GSTR-6 - Monthly Return of Input Service Distributor',
  'Monthly Return of Input Service Distributor',
  'monthly',
  NULL, -- Input Service Distributors
  'Rs. 50 per day (Rs. 20 for NIL return).',
  FALSE,
  13, -- 13th of next month
  TRUE
),
-- GSTR-5A (OIDAR services)
(
  'GST',
  'GSTR-5A - Monthly Return for OIDAR services',
  'Monthly Return for OIDAR services',
  'monthly',
  NULL, -- OIDAR service providers
  'Rs. 50 per day (Rs. 20 for NIL return).',
  FALSE,
  20, -- 20th of next month
  TRUE
),
-- GSTR-11 (UIN holders)
(
  'GST',
  'GSTR-11 - Monthly Return by UIN holders',
  'Monthly Return by UIN holders (Embassies etc)',
  'monthly',
  NULL, -- UIN holders
  'Rs. 50 per day (Rs. 20 for NIL return).',
  FALSE,
  28, -- 28th of next month
  TRUE
),
-- ITNS-285 (Equalization levy)
(
  'Income Tax',
  'ITNS-285 - Payment of Equalization levy',
  'Payment of Equalization levy',
  'monthly',
  NULL, -- All entities
  'Interest @ 1% per month for late payment.',
  FALSE,
  7, -- 7th of next month
  TRUE
),
-- Form 16B/16C/16D/16E (TDS Certificates)
(
  'Income Tax',
  'Form 16B/16C/16D/16E - Issue TDS Certificates',
  'Issue TDS Certificates for payments (194-IA/194-IB/194M/194S)',
  'monthly',
  NULL, -- All entities
  'Penalty as per Income Tax Act.',
  FALSE,
  14, -- 14th of next month
  TRUE
),
-- Non-Salary TDS Payment (Challan 281)
(
  'Income Tax',
  'Challan 281 - Non-Salary TDS Payment',
  'Non-Salary TDS Payment',
  'monthly',
  NULL, -- All Entities
  'Interest @ 1.5% per month from date of deduction.',
  FALSE,
  30, -- 30th of next month
  TRUE
),
-- GSTR-1A (Amendment)
(
  'GST',
  'GSTR-1A - Add/amend particulars in GSTR-1',
  'Add/amend particulars in GSTR-1',
  'monthly',
  NULL, -- All entities
  NULL,
  FALSE,
  20, -- 20th of next month
  TRUE
),
-- 26QE/26QB/26QC/26QD (TDS Deposit)
(
  'Income Tax',
  '26QE/26QB/26QC/26QD - Deposit of TDS',
  'Deposit of TDS',
  'monthly',
  NULL, -- All entities
  'Interest @ 1.5% per month from date of deduction.',
  FALSE,
  30, -- 30th of next month
  TRUE
),
-- Form 24G (Government TDS/TCS deposit)
(
  'Income Tax',
  'Form 24G - Details of TDS/TCS deposit by Govt book entry',
  'Details of TDS/TCS deposit by Govt book entry',
  'monthly',
  NULL, -- Government entities
  'Penalty as per Income Tax Act.',
  FALSE,
  30, -- 30th of next month
  TRUE
);

-- ============================================
-- SECTION 2: QUARTERLY COMPLIANCES
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
-- TDS Return (26Q/24Q) - Q1
(
  'Income Tax',
  'Form 24Q/26Q - Quarterly TDS Return',
  'Quarterly TDS Return - Q1 (Apr-Jun)',
  'quarterly',
  NULL, -- All entity types
  'Rs. 200 per day u/s 234E; Penalty u/s 271H (Rs. 10k to 1L).',
  FALSE,
  7, -- July
  31, -- 31st
  TRUE
),
-- TDS Return (26Q/24Q) - Q2
(
  'Income Tax',
  'Form 24Q/26Q - Quarterly TDS Return',
  'Quarterly TDS Return - Q2 (Jul-Sep)',
  'quarterly',
  NULL, -- All entity types
  'Rs. 200 per day u/s 234E; Penalty u/s 271H (Rs. 10k to 1L).',
  FALSE,
  10, -- October
  31, -- 31st
  TRUE
),
-- TDS Return (26Q/24Q) - Q3
(
  'Income Tax',
  'Form 24Q/26Q - Quarterly TDS Return',
  'Quarterly TDS Return - Q3 (Oct-Dec)',
  'quarterly',
  NULL, -- All entity types
  'Rs. 200 per day u/s 234E; Penalty u/s 271H (Rs. 10k to 1L).',
  FALSE,
  1, -- January
  31, -- 31st
  TRUE
),
-- TDS Return (26Q/24Q) - Q4
(
  'Income Tax',
  'Form 24Q/26Q - Quarterly TDS Return',
  'Quarterly TDS Return - Q4 (Jan-Mar)',
  'quarterly',
  NULL, -- All entity types
  'Rs. 200 per day u/s 234E; Penalty u/s 271H (Rs. 10k to 1L).',
  FALSE,
  5, -- May
  31, -- 31st
  TRUE
),
-- TCS Return (27EQ) - Q1
(
  'Income Tax',
  'Form 27EQ - Quarterly TCS Return',
  'Quarterly TCS Return - Q1 (Apr-Jun)',
  'quarterly',
  NULL, -- All entity types
  'Rs. 200 per day u/s 234E; Penalty u/s 271H (Rs. 10k to 1L).',
  FALSE,
  7, -- July
  15, -- 15th
  TRUE
),
-- TCS Return (27EQ) - Q2
(
  'Income Tax',
  'Form 27EQ - Quarterly TCS Return',
  'Quarterly TCS Return - Q2 (Jul-Sep)',
  'quarterly',
  NULL, -- All entity types
  'Rs. 200 per day u/s 234E; Penalty u/s 271H (Rs. 10k to 1L).',
  FALSE,
  10, -- October
  15, -- 15th
  TRUE
),
-- TCS Return (27EQ) - Q3
(
  'Income Tax',
  'Form 27EQ - Quarterly TCS Return',
  'Quarterly TCS Return - Q3 (Oct-Dec)',
  'quarterly',
  NULL, -- All entity types
  'Rs. 200 per day u/s 234E; Penalty u/s 271H (Rs. 10k to 1L).',
  FALSE,
  1, -- January
  15, -- 15th
  TRUE
),
-- TCS Return (27EQ) - Q4
(
  'Income Tax',
  'Form 27EQ - Quarterly TCS Return',
  'Quarterly TCS Return - Q4 (Jan-Mar)',
  'quarterly',
  NULL, -- All entity types
  'Rs. 200 per day u/s 234E; Penalty u/s 271H (Rs. 10k to 1L).',
  FALSE,
  5, -- May
  15, -- 15th
  TRUE
),
-- Advance Tax - Q1
(
  'Income Tax',
  'Advance Tax - Quarterly Advance Tax Payment',
  'Quarterly Advance Tax Payment - Q1 (Apr-Jun)',
  'quarterly',
  NULL, -- All entity types
  'Interest @ 1% per month u/s 234B and 234C.',
  FALSE,
  6, -- June
  15, -- 15th
  TRUE
),
-- Advance Tax - Q2
(
  'Income Tax',
  'Advance Tax - Quarterly Advance Tax Payment',
  'Quarterly Advance Tax Payment - Q2 (Jul-Sep)',
  'quarterly',
  NULL, -- All entity types
  'Interest @ 1% per month u/s 234B and 234C.',
  FALSE,
  9, -- September
  15, -- 15th
  TRUE
),
-- Advance Tax - Q3
(
  'Income Tax',
  'Advance Tax - Quarterly Advance Tax Payment',
  'Quarterly Advance Tax Payment - Q3 (Oct-Dec)',
  'quarterly',
  NULL, -- All entity types
  'Interest @ 1% per month u/s 234B and 234C.',
  FALSE,
  12, -- December
  15, -- 15th
  TRUE
),
-- Advance Tax - Q4
(
  'Income Tax',
  'Advance Tax - Quarterly Advance Tax Payment',
  'Quarterly Advance Tax Payment - Q4 (Jan-Mar)',
  'quarterly',
  NULL, -- All entity types
  'Interest @ 1% per month u/s 234B and 234C.',
  FALSE,
  3, -- March
  15, -- 15th
  TRUE
),
-- GSTR-3B (QRMP South States) - Q1
(
  'GST',
  'GSTR-3B (QRMP South States) - Quarterly Return',
  'Quarterly Return - Q1 (Apr-Jun)',
  'quarterly',
  NULL, -- QRMP South States
  'Interest @ 18% p.a. + Late fee Rs. 50/day (Rs. 20 for NIL).',
  FALSE,
  7, -- July (22nd of month after quarter)
  22, -- 22nd
  TRUE
),
-- GSTR-3B (QRMP South States) - Q2
(
  'GST',
  'GSTR-3B (QRMP South States) - Quarterly Return',
  'Quarterly Return - Q2 (Jul-Sep)',
  'quarterly',
  NULL, -- QRMP South States
  'Interest @ 18% p.a. + Late fee Rs. 50/day (Rs. 20 for NIL).',
  FALSE,
  10, -- October (22nd of month after quarter)
  22, -- 22nd
  TRUE
),
-- GSTR-3B (QRMP South States) - Q3
(
  'GST',
  'GSTR-3B (QRMP South States) - Quarterly Return',
  'Quarterly Return - Q3 (Oct-Dec)',
  'quarterly',
  NULL, -- QRMP South States
  'Interest @ 18% p.a. + Late fee Rs. 50/day (Rs. 20 for NIL).',
  FALSE,
  1, -- January (22nd of month after quarter)
  22, -- 22nd
  TRUE
),
-- GSTR-3B (QRMP South States) - Q4
(
  'GST',
  'GSTR-3B (QRMP South States) - Quarterly Return',
  'Quarterly Return - Q4 (Jan-Mar)',
  'quarterly',
  NULL, -- QRMP South States
  'Interest @ 18% p.a. + Late fee Rs. 50/day (Rs. 20 for NIL).',
  FALSE,
  4, -- April (22nd of month after quarter)
  22, -- 22nd
  TRUE
),
-- GSTR-3B (QRMP North States) - Q1
(
  'GST',
  'GSTR-3B (QRMP North States) - Quarterly Return',
  'Quarterly Return - Q1 (Apr-Jun)',
  'quarterly',
  NULL, -- QRMP North States
  'Interest @ 18% p.a. + Late fee Rs. 50/day (Rs. 20 for NIL).',
  FALSE,
  7, -- July (24th of month after quarter)
  24, -- 24th
  TRUE
),
-- GSTR-3B (QRMP North States) - Q2
(
  'GST',
  'GSTR-3B (QRMP North States) - Quarterly Return',
  'Quarterly Return - Q2 (Jul-Sep)',
  'quarterly',
  NULL, -- QRMP North States
  'Interest @ 18% p.a. + Late fee Rs. 50/day (Rs. 20 for NIL).',
  FALSE,
  10, -- October (24th of month after quarter)
  24, -- 24th
  TRUE
),
-- GSTR-3B (QRMP North States) - Q3
(
  'GST',
  'GSTR-3B (QRMP North States) - Quarterly Return',
  'Quarterly Return - Q3 (Oct-Dec)',
  'quarterly',
  NULL, -- QRMP North States
  'Interest @ 18% p.a. + Late fee Rs. 50/day (Rs. 20 for NIL).',
  FALSE,
  1, -- January (24th of month after quarter)
  24, -- 24th
  TRUE
),
-- GSTR-3B (QRMP North States) - Q4
(
  'GST',
  'GSTR-3B (QRMP North States) - Quarterly Return',
  'Quarterly Return - Q4 (Jan-Mar)',
  'quarterly',
  NULL, -- QRMP North States
  'Interest @ 18% p.a. + Late fee Rs. 50/day (Rs. 20 for NIL).',
  FALSE,
  4, -- April (24th of month after quarter)
  24, -- 24th
  TRUE
),
-- GSTR-1 (QRMP) - Q1
(
  'GST',
  'GSTR-1 (QRMP) - Quarterly Outward Supplies',
  'Quarterly Outward Supplies - Q1 (Apr-Jun)',
  'quarterly',
  NULL, -- QRMP Filers
  'Rs. 50 per day (Rs. 20 for NIL return).',
  FALSE,
  7, -- July
  13, -- 13th
  TRUE
),
-- GSTR-1 (QRMP) - Q2
(
  'GST',
  'GSTR-1 (QRMP) - Quarterly Outward Supplies',
  'Quarterly Outward Supplies - Q2 (Jul-Sep)',
  'quarterly',
  NULL, -- QRMP Filers
  'Rs. 50 per day (Rs. 20 for NIL return).',
  FALSE,
  10, -- October
  13, -- 13th
  TRUE
),
-- GSTR-1 (QRMP) - Q3
(
  'GST',
  'GSTR-1 (QRMP) - Quarterly Outward Supplies',
  'Quarterly Outward Supplies - Q3 (Oct-Dec)',
  'quarterly',
  NULL, -- QRMP Filers
  'Rs. 50 per day (Rs. 20 for NIL return).',
  FALSE,
  1, -- January
  13, -- 13th
  TRUE
),
-- GSTR-1 (QRMP) - Q4
(
  'GST',
  'GSTR-1 (QRMP) - Quarterly Outward Supplies',
  'Quarterly Outward Supplies - Q4 (Jan-Mar)',
  'quarterly',
  NULL, -- QRMP Filers
  'Rs. 50 per day (Rs. 20 for NIL return).',
  FALSE,
  4, -- April
  13, -- 13th
  TRUE
),
-- CMP-08 (Composition) - Q1
(
  'GST',
  'CMP-08 - Payment by Composition taxpayers',
  'Payment by Composition taxpayers - Q1 (Apr-Jun)',
  'quarterly',
  NULL, -- Composition taxpayers
  'Interest @ 18% p.a. on tax amount + Late fee for GSTR-4.',
  FALSE,
  7, -- July
  18, -- 18th
  TRUE
),
-- CMP-08 (Composition) - Q2
(
  'GST',
  'CMP-08 - Payment by Composition taxpayers',
  'Payment by Composition taxpayers - Q2 (Jul-Sep)',
  'quarterly',
  NULL, -- Composition taxpayers
  'Interest @ 18% p.a. on tax amount + Late fee for GSTR-4.',
  FALSE,
  10, -- October
  18, -- 18th
  TRUE
),
-- CMP-08 (Composition) - Q3
(
  'GST',
  'CMP-08 - Payment by Composition taxpayers',
  'Payment by Composition taxpayers - Q3 (Oct-Dec)',
  'quarterly',
  NULL, -- Composition taxpayers
  'Interest @ 18% p.a. on tax amount + Late fee for GSTR-4.',
  FALSE,
  1, -- January
  18, -- 18th
  TRUE
),
-- CMP-08 (Composition) - Q4
(
  'GST',
  'CMP-08 - Payment by Composition taxpayers',
  'Payment by Composition taxpayers - Q4 (Jan-Mar)',
  'quarterly',
  NULL, -- Composition taxpayers
  'Interest @ 18% p.a. on tax amount + Late fee for GSTR-4.',
  FALSE,
  4, -- April
  18, -- 18th
  TRUE
),
-- Form 15CC (Foreign Remittances) - Q1
(
  'Income Tax',
  'Form 15CC - Statement of Foreign Remittances',
  'Statement of Foreign Remittances - Q1 (Apr-Jun)',
  'quarterly',
  NULL, -- All entities
  'Penalty as per Income Tax Act.',
  FALSE,
  7, -- July
  15, -- 15th
  TRUE
),
-- Form 15CC (Foreign Remittances) - Q2
(
  'Income Tax',
  'Form 15CC - Statement of Foreign Remittances',
  'Statement of Foreign Remittances - Q2 (Jul-Sep)',
  'quarterly',
  NULL, -- All entities
  'Penalty as per Income Tax Act.',
  FALSE,
  10, -- October
  15, -- 15th
  TRUE
),
-- Form 15CC (Foreign Remittances) - Q3
(
  'Income Tax',
  'Form 15CC - Statement of Foreign Remittances',
  'Statement of Foreign Remittances - Q3 (Oct-Dec)',
  'quarterly',
  NULL, -- All entities
  'Penalty as per Income Tax Act.',
  FALSE,
  1, -- January
  15, -- 15th
  TRUE
),
-- Form 15CC (Foreign Remittances) - Q4
(
  'Income Tax',
  'Form 15CC - Statement of Foreign Remittances',
  'Statement of Foreign Remittances - Q4 (Jan-Mar)',
  'quarterly',
  NULL, -- All entities
  'Penalty as per Income Tax Act.',
  FALSE,
  4, -- April
  15, -- 15th
  TRUE
),
-- Form 15G/15H (Declarations) - Q1
(
  'Income Tax',
  'Form 15G/15H - Uploading declarations',
  'Uploading declarations - Q1 (Apr-Jun)',
  'quarterly',
  NULL, -- All entities
  NULL,
  FALSE,
  7, -- July
  30, -- 30th
  TRUE
),
-- Form 15G/15H (Declarations) - Q2
(
  'Income Tax',
  'Form 15G/15H - Uploading declarations',
  'Uploading declarations - Q2 (Jul-Sep)',
  'quarterly',
  NULL, -- All entities
  NULL,
  FALSE,
  10, -- October
  30, -- 30th
  TRUE
),
-- Form 15G/15H (Declarations) - Q3
(
  'Income Tax',
  'Form 15G/15H - Uploading declarations',
  'Uploading declarations - Q3 (Oct-Dec)',
  'quarterly',
  NULL, -- All entities
  NULL,
  FALSE,
  1, -- January
  30, -- 30th
  TRUE
),
-- Form 15G/15H (Declarations) - Q4
(
  'Income Tax',
  'Form 15G/15H - Uploading declarations',
  'Uploading declarations - Q4 (Jan-Mar)',
  'quarterly',
  NULL, -- All entities
  NULL,
  FALSE,
  4, -- April
  30, -- 30th
  TRUE
),
-- Form 61/61-A (Financial Transactions) - Q1
(
  'Income Tax',
  'Form 61/61-A - Statement of Financial Transactions',
  'Statement of Financial Transactions - Q1 (Apr-Jun)',
  'quarterly',
  NULL, -- All entities
  'Penalty as per Income Tax Act.',
  FALSE,
  7, -- July
  30, -- 30th
  TRUE
),
-- Form 61/61-A (Financial Transactions) - Q2
(
  'Income Tax',
  'Form 61/61-A - Statement of Financial Transactions',
  'Statement of Financial Transactions - Q2 (Jul-Sep)',
  'quarterly',
  NULL, -- All entities
  'Penalty as per Income Tax Act.',
  FALSE,
  10, -- October
  30, -- 30th
  TRUE
),
-- Form 61/61-A (Financial Transactions) - Q3
(
  'Income Tax',
  'Form 61/61-A - Statement of Financial Transactions',
  'Statement of Financial Transactions - Q3 (Oct-Dec)',
  'quarterly',
  NULL, -- All entities
  'Penalty as per Income Tax Act.',
  FALSE,
  1, -- January
  30, -- 30th
  TRUE
),
-- Form 61/61-A (Financial Transactions) - Q4
(
  'Income Tax',
  'Form 61/61-A - Statement of Financial Transactions',
  'Statement of Financial Transactions - Q4 (Jan-Mar)',
  'quarterly',
  NULL, -- All entities
  'Penalty as per Income Tax Act.',
  FALSE,
  4, -- April
  30, -- 30th
  TRUE
),
-- ITC-04 (Job Worker) - Half-yearly (Apr-Sep)
(
  'GST',
  'ITC-04 - Details of goods sent to/from job worker',
  'Details of goods sent to/from job worker (Half-yearly - Apr-Sep)',
  'quarterly',
  NULL, -- All entities using job workers
  'Penalty as per GST Act.',
  FALSE,
  10, -- October
  25, -- 25th
  TRUE
),
-- ITC-04 (Job Worker) - Half-yearly (Oct-Mar)
(
  'GST',
  'ITC-04 - Details of goods sent to/from job worker',
  'Details of goods sent to/from job worker (Half-yearly - Oct-Mar)',
  'quarterly',
  NULL, -- All entities using job workers
  'Penalty as per GST Act.',
  FALSE,
  4, -- April
  25, -- 25th
  TRUE
),
-- NDH-3 (Nidhi Companies) - Half-yearly (Apr-Sep)
(
  'RoC',
  'NDH-3 - Half-yearly return by Nidhi Companies',
  'Half-yearly return by Nidhi Companies (Apr-Sep)',
  'quarterly',
  NULL, -- Nidhi Companies
  'Penalty as per Companies Act.',
  FALSE,
  10, -- October
  30, -- 30th
  TRUE
),
-- NDH-3 (Nidhi Companies) - Half-yearly (Oct-Mar)
(
  'RoC',
  'NDH-3 - Half-yearly return by Nidhi Companies',
  'Half-yearly return by Nidhi Companies (Oct-Mar)',
  'quarterly',
  NULL, -- Nidhi Companies
  'Penalty as per Companies Act.',
  FALSE,
  4, -- April
  30, -- 30th
  TRUE
),
-- Opt-in or opt-out of QRMP Scheme - Q1
(
  'GST',
  '- - Opt-in or opt-out of QRMP Scheme',
  'Opt-in or opt-out of QRMP Scheme for April-June quarter',
  'quarterly',
  NULL, -- All entities
  NULL,
  FALSE,
  3, -- March
  30, -- 30th (before quarter starts)
  TRUE
),
-- Opt-in or opt-out of QRMP Scheme - Q2
(
  'GST',
  '- - Opt-in or opt-out of QRMP Scheme',
  'Opt-in or opt-out of QRMP Scheme for July-September quarter',
  'quarterly',
  NULL, -- All entities
  NULL,
  FALSE,
  6, -- June
  30, -- 30th (before quarter starts)
  TRUE
),
-- Opt-in or opt-out of QRMP Scheme - Q3
(
  'GST',
  '- - Opt-in or opt-out of QRMP Scheme',
  'Opt-in or opt-out of QRMP Scheme for October-December quarter',
  'quarterly',
  NULL, -- All entities
  NULL,
  FALSE,
  9, -- September
  30, -- 30th (before quarter starts)
  TRUE
),
-- Opt-in or opt-out of QRMP Scheme - Q4
(
  'GST',
  '- - Opt-in or opt-out of QRMP Scheme',
  'Opt-in or opt-out of QRMP Scheme for January-March quarter',
  'quarterly',
  NULL, -- All entities
  NULL,
  FALSE,
  12, -- December
  30, -- 30th (before quarter starts)
  TRUE
);

-- ============================================
-- SECTION 3: ANNUAL COMPLIANCES
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
-- Income Tax Return - Non-Audit (All entities)
(
  'Income Tax',
  'Income Tax Return - Income Tax Return (Non-Audit)',
  'Income Tax Return (Non-Audit)',
  'annual',
  NULL, -- All entity types
  'Late fee u/s 234F: Rs. 5000 (Rs. 1000 if income < 5L).',
  FALSE,
  7, -- July
  31, -- 31st
  TRUE
),
-- Income Tax Return - Audit Cases (All entities)
(
  'Income Tax',
  'Income Tax Return - Income Tax Return (Audit Cases)',
  'Income Tax Return (Audit Cases)',
  'annual',
  NULL, -- All entity types
  'Late fee u/s 234F: Rs. 5000 + Interest u/s 234A.',
  FALSE,
  10, -- October
  31, -- 31st
  TRUE
),
-- Tax Audit Report
(
  'Income Tax',
  'Tax Audit - Tax Audit Report filing',
  'Tax Audit Report filing',
  'annual',
  NULL, -- Audit Cases
  '0.5% of Turnover or Rs. 1.5 Lakh (whichever is lower).',
  FALSE,
  9, -- September
  30, -- 30th
  TRUE
),
-- GSTR-9 (Turnover >2cr)
(
  'GST',
  'GSTR-9 - Annual GST Return',
  'Annual GST Return (Turnover >2cr)',
  'annual',
  NULL, -- All entity types with turnover > 2Cr
  'Rs. 200 per day (0.50% of turnover max).',
  FALSE,
  12, -- December
  31, -- 31st
  TRUE
),
-- GSTR-9C (Turnover >5cr)
(
  'GST',
  'GSTR-9C - Annual GST Reconciliation Statement',
  'Annual GST Reconciliation Statement (Turnover >5cr)',
  'annual',
  NULL, -- All entity types with turnover > 5Cr
  'Rs. 200 per day (0.50% of turnover max).',
  FALSE,
  12, -- December
  31, -- 31st
  TRUE
),
-- Statutory Audit (Private Limited Company)
(
  'RoC',
  'Statutory Audit - Audit of Accounts',
  'Audit of Accounts',
  'annual',
  ARRAY['Private Limited Company'],
  'Penalty as per Companies Act.',
  FALSE,
  9, -- September
  30, -- 30th (Before 30th Sept)
  TRUE
),
-- ROC Annual Return (MGT-7 & AOC-4) - Private Limited Company
(
  'RoC',
  'ROC Annual Return (MGT-7 & AOC-4) - Annual Return filing',
  'Annual Return filing (MGT-7 & AOC-4) - 60 & 30 days from AGM',
  'annual',
  ARRAY['Private Limited Company'],
  'Rs. 100 per day (Co. & Officers) + up to Rs. 5 Lakh.',
  FALSE,
  11, -- November (typically filed after AGM)
  30, -- 30th
  TRUE
),
-- AOC-4 (Filing of Financial Statements)
(
  'RoC',
  'AOC-4 - Filing of Financial Statements',
  'Filing of Financial Statements',
  'annual',
  ARRAY['Private Limited Company'],
  'Rs. 100 per day (Co. & Officers) + up to Rs. 5 Lakh.',
  FALSE,
  11, -- November
  30, -- 30th
  TRUE
),
-- MGT-7 (Annual Return)
(
  'RoC',
  'MGT-7 - Annual Return filing',
  'Annual Return filing',
  'annual',
  ARRAY['Private Limited Company'],
  'Rs. 100 per day.',
  FALSE,
  11, -- November
  30, -- 30th
  TRUE
),
-- ROC Annual Return (Form 11) - LLP
(
  'LLP Act',
  'Form 11 - Annual Return of LLP',
  'Annual Return of LLP',
  'annual',
  ARRAY['LLP'],
  'Rs. 100 per day (No upper limit).',
  FALSE,
  5, -- May
  30, -- 30th
  TRUE
),
-- Statement of Accounts & Solvency (Form 8) - LLP
(
  'LLP Act',
  'Form 8 - Statement of Accounts & Solvency',
  'Statement of Accounts & Solvency',
  'annual',
  ARRAY['LLP'],
  'Rs. 100 per day.',
  FALSE,
  10, -- October
  30, -- 30th
  TRUE
),
-- Audit of Accounts - Trust / Society / Sec 8 Company
(
  'RoC',
  'Audit of Accounts - Audit of Accounts',
  'Audit of Accounts',
  'annual',
  ARRAY['Trust / Society / Sec 8 Company'],
  'Penalty as per relevant Act.',
  FALSE,
  9, -- September
  30, -- 30th (Before 30th Sept)
  TRUE
),
-- Professional Tax Annual Return (Telangana)
(
  'Prof. Tax',
  'Professional Tax Annual Return (Telangana) - Annual PT Return filing',
  'Annual PT Return filing',
  'annual',
  NULL, -- All entity types in Telangana
  'Interest @ 2% per month + Penalty up to Rs. 5 per day.',
  FALSE,
  4, -- April
  30, -- 30th
  TRUE
),
-- DIR-3 KYC
(
  'RoC',
  'DIR-3 KYC - Director KYC Filing',
  'Director KYC Filing',
  'annual',
  NULL, -- Directors
  'Rs. 5000 (after due date).',
  FALSE,
  9, -- September
  30, -- 30th
  TRUE
),
-- DPT-03 - Private Limited Company
(
  'RoC',
  'DPT-03 - Return of Deposits',
  'Return of Deposits',
  'annual',
  ARRAY['Private Limited Company'],
  'Rs. 5000 + Rs. 500 per day for continuing default.',
  FALSE,
  6, -- June
  30, -- 30th
  TRUE
),
-- FC-4/FC-3 (FCRA) - Trust / Society / Sec 8 Company
(
  'RoC',
  'FC-4/FC-3 (FCRA) - FCRA Annual Return',
  'FCRA Annual Return',
  'annual',
  ARRAY['Trust / Society / Sec 8 Company'],
  'Penalty as per FCRA Act.',
  FALSE,
  12, -- December
  31, -- 31st
  TRUE
),
-- MSC-3 (Dormant Companies)
(
  'RoC',
  'MSC-3 - Annual Return of Dormant Company',
  'Annual Return of Dormant Company',
  'annual',
  NULL, -- Dormant Companies
  'Rs. 100 per day of delay.',
  FALSE,
  4, -- April
  30, -- 30th
  TRUE
),
-- MSME Form I (Half-yearly)
(
  'RoC',
  'MSME Form I - Disclosure of dues >45 days to MSME',
  'Disclosure of dues >45 days to MSME (Half-yearly - Apr-Sep)',
  'annual',
  ARRAY['Private Limited Company'],
  'Rs. 25k to Rs. 3L (Co.) and Rs. 25k to Rs. 3L or 6 months jail (Officers).',
  FALSE,
  10, -- October
  30, -- 30th
  TRUE
),
-- MSME Form I (Half-yearly)
(
  'RoC',
  'MSME Form I - Disclosure of dues >45 days to MSME',
  'Disclosure of dues >45 days to MSME (Half-yearly - Oct-Mar)',
  'annual',
  ARRAY['Private Limited Company'],
  'Rs. 25k to Rs. 3L (Co.) and Rs. 25k to Rs. 3L or 6 months jail (Officers).',
  FALSE,
  4, -- April
  30, -- 30th
  TRUE
);

-- ============================================
-- SECTION 4: ONE-TIME COMPLIANCES (Regulatory Changes - Multiple Years)
-- ============================================
-- These are truly one-time regulatory changes that occur on specific dates
-- Creating entries for 2025, 2026, and 2027 to cover multiple years

INSERT INTO public.compliance_templates (
  category,
  requirement,
  description,
  compliance_type,
  entity_types,
  penalty,
  is_critical,
  due_date,
  is_active
) VALUES
-- 01/04/2025 - Remuneration/Interest TDS u/s 194T
(
  'Income Tax',
  '- - Remuneration/Interest TDS u/s 194T (>Rs. 20k)',
  'Remuneration/Interest TDS u/s 194T (>Rs. 20k)',
  'one-time',
  ARRAY['Partnership Firm'],
  'Interest @ 1.5% per month for late deduction/payment.',
  FALSE,
  '2025-04-01',
  TRUE
),
-- 01/04/2026 - Remuneration/Interest TDS u/s 194T
(
  'Income Tax',
  '- - Remuneration/Interest TDS u/s 194T (>Rs. 20k)',
  'Remuneration/Interest TDS u/s 194T (>Rs. 20k)',
  'one-time',
  ARRAY['Partnership Firm'],
  'Interest @ 1.5% per month for late deduction/payment.',
  FALSE,
  '2026-04-01',
  TRUE
),
-- 01/04/2027 - Remuneration/Interest TDS u/s 194T
(
  'Income Tax',
  '- - Remuneration/Interest TDS u/s 194T (>Rs. 20k)',
  'Remuneration/Interest TDS u/s 194T (>Rs. 20k)',
  'one-time',
  ARRAY['Partnership Firm'],
  'Interest @ 1.5% per month for late deduction/payment.',
  FALSE,
  '2027-04-01',
  TRUE
),
-- 01/04/2025 - Mandatory E-invoicing
(
  'GST',
  '- - Mandatory E-invoicing if FY T/O > 5Cr',
  'Mandatory E-invoicing if FY T/O > 5Cr',
  'one-time',
  NULL, -- Applies to all entities with turnover > 5Cr
  '100% of tax due or Rs. 10k (whichever is higher) per invoice; ITC denial to recipient.',
  TRUE,
  '2025-04-01',
  TRUE
),
-- 01/04/2026 - Mandatory E-invoicing
(
  'GST',
  '- - Mandatory E-invoicing if FY T/O > 5Cr',
  'Mandatory E-invoicing if FY T/O > 5Cr',
  'one-time',
  NULL, -- Applies to all entities with turnover > 5Cr
  '100% of tax due or Rs. 10k (whichever is higher) per invoice; ITC denial to recipient.',
  TRUE,
  '2026-04-01',
  TRUE
),
-- 01/04/2027 - Mandatory E-invoicing
(
  'GST',
  '- - Mandatory E-invoicing if FY T/O > 5Cr',
  'Mandatory E-invoicing if FY T/O > 5Cr',
  'one-time',
  NULL, -- Applies to all entities with turnover > 5Cr
  '100% of tax due or Rs. 10k (whichever is higher) per invoice; ITC denial to recipient.',
  TRUE,
  '2027-04-01',
  TRUE
),
-- 01/04/2025 - New thresholds for TDS/TCS
(
  'Income Tax',
  '- - New thresholds for TDS/TCS (e.g. 194J/194H/194I)',
  'New thresholds for TDS/TCS (e.g. 194J/194H/194I)',
  'one-time',
  NULL, -- All entities
  NULL,
  FALSE,
  '2025-04-01',
  TRUE
),
-- 01/04/2026 - New thresholds for TDS/TCS
(
  'Income Tax',
  '- - New thresholds for TDS/TCS (e.g. 194J/194H/194I)',
  'New thresholds for TDS/TCS (e.g. 194J/194H/194I)',
  'one-time',
  NULL, -- All entities
  NULL,
  FALSE,
  '2026-04-01',
  TRUE
),
-- 01/04/2027 - New thresholds for TDS/TCS
(
  'Income Tax',
  '- - New thresholds for TDS/TCS (e.g. 194J/194H/194I)',
  'New thresholds for TDS/TCS (e.g. 194J/194H/194I)',
  'one-time',
  NULL, -- All entities
  NULL,
  FALSE,
  '2027-04-01',
  TRUE
),
-- 01/04/2025 - TDS @ 10% u/s 194T
(
  'Income Tax',
  '- - TDS @ 10% u/s 194T on partner remuneration/interest >20000',
  'TDS @ 10% u/s 194T on partner remuneration/interest >20000',
  'one-time',
  ARRAY['Partnership Firm'],
  'Interest @ 1.5% per month for late deduction/payment.',
  FALSE,
  '2025-04-01',
  TRUE
),
-- 01/04/2026 - TDS @ 10% u/s 194T
(
  'Income Tax',
  '- - TDS @ 10% u/s 194T on partner remuneration/interest >20000',
  'TDS @ 10% u/s 194T on partner remuneration/interest >20000',
  'one-time',
  ARRAY['Partnership Firm'],
  'Interest @ 1.5% per month for late deduction/payment.',
  FALSE,
  '2026-04-01',
  TRUE
),
-- 01/04/2027 - TDS @ 10% u/s 194T
(
  'Income Tax',
  '- - TDS @ 10% u/s 194T on partner remuneration/interest >20000',
  'TDS @ 10% u/s 194T on partner remuneration/interest >20000',
  'one-time',
  ARRAY['Partnership Firm'],
  'Interest @ 1.5% per month for late deduction/payment.',
  FALSE,
  '2027-04-01',
  TRUE
),
-- 01/04/2025 - Increased limits for Partner Remuneration
(
  'Income Tax',
  '- - Increased limits for Partner Remuneration',
  'Increased limits for Partner Remuneration',
  'one-time',
  ARRAY['Partnership Firm'],
  NULL,
  FALSE,
  '2025-04-01',
  TRUE
),
-- 01/04/2026 - Increased limits for Partner Remuneration
(
  'Income Tax',
  '- - Increased limits for Partner Remuneration',
  'Increased limits for Partner Remuneration',
  'one-time',
  ARRAY['Partnership Firm'],
  NULL,
  FALSE,
  '2026-04-01',
  TRUE
),
-- 01/04/2027 - Increased limits for Partner Remuneration
(
  'Income Tax',
  '- - Increased limits for Partner Remuneration',
  'Increased limits for Partner Remuneration',
  'one-time',
  ARRAY['Partnership Firm'],
  NULL,
  FALSE,
  '2027-04-01',
  TRUE
),
-- 01/04/2025 - Aggregate Turnover calculation
(
  'GST',
  '- - Aggregate Turnover calculation for QRMP/Composition/E-invoice',
  'Aggregate Turnover calculation for QRMP/Composition/E-invoice',
  'one-time',
  NULL, -- All entities
  NULL,
  FALSE,
  '2025-04-01',
  TRUE
),
-- 01/04/2026 - Aggregate Turnover calculation
(
  'GST',
  '- - Aggregate Turnover calculation for QRMP/Composition/E-invoice',
  'Aggregate Turnover calculation for QRMP/Composition/E-invoice',
  'one-time',
  NULL, -- All entities
  NULL,
  FALSE,
  '2026-04-01',
  TRUE
),
-- 01/04/2027 - Aggregate Turnover calculation
(
  'GST',
  '- - Aggregate Turnover calculation for QRMP/Composition/E-invoice',
  'Aggregate Turnover calculation for QRMP/Composition/E-invoice',
  'one-time',
  NULL, -- All entities
  NULL,
  FALSE,
  '2027-04-01',
  TRUE
),
-- 01/04/2025 - Mandatory ISD registration
(
  'GST',
  '- - Mandatory ISD registration for common ITC',
  'Mandatory ISD registration for common ITC',
  'one-time',
  NULL, -- All entities with common ITC
  NULL,
  FALSE,
  '2025-04-01',
  TRUE
),
-- 01/04/2026 - Mandatory ISD registration
(
  'GST',
  '- - Mandatory ISD registration for common ITC',
  'Mandatory ISD registration for common ITC',
  'one-time',
  NULL, -- All entities with common ITC
  NULL,
  FALSE,
  '2026-04-01',
  TRUE
),
-- 01/04/2027 - Mandatory ISD registration
(
  'GST',
  '- - Mandatory ISD registration for common ITC',
  'Mandatory ISD registration for common ITC',
  'one-time',
  NULL, -- All entities with common ITC
  NULL,
  FALSE,
  '2027-04-01',
  TRUE
),
-- 01/04/2025 - 30-day reporting limit for e-Invoices
(
  'GST',
  '- - 30-day reporting limit for e-Invoices (Turnover >10 cr)',
  '30-day reporting limit for e-Invoices (Turnover >10 cr)',
  'one-time',
  NULL, -- All entities with turnover > 10Cr
  NULL,
  FALSE,
  '2025-04-01',
  TRUE
),
-- 01/04/2026 - 30-day reporting limit for e-Invoices
(
  'GST',
  '- - 30-day reporting limit for e-Invoices (Turnover >10 cr)',
  '30-day reporting limit for e-Invoices (Turnover >10 cr)',
  'one-time',
  NULL, -- All entities with turnover > 10Cr
  NULL,
  FALSE,
  '2026-04-01',
  TRUE
),
-- 01/04/2027 - 30-day reporting limit for e-Invoices
(
  'GST',
  '- - 30-day reporting limit for e-Invoices (Turnover >10 cr)',
  '30-day reporting limit for e-Invoices (Turnover >10 cr)',
  'one-time',
  NULL, -- All entities with turnover > 10Cr
  NULL,
  FALSE,
  '2027-04-01',
  TRUE
),
-- 01/04/2025 - Mandatory Multi-factor authentication
(
  'GST',
  '- - Mandatory Multi-factor authentication for all taxpayers',
  'Mandatory Multi-factor authentication for all taxpayers',
  'one-time',
  NULL, -- All entities
  NULL,
  FALSE,
  '2025-04-01',
  TRUE
),
-- 01/04/2026 - Mandatory Multi-factor authentication
(
  'GST',
  '- - Mandatory Multi-factor authentication for all taxpayers',
  'Mandatory Multi-factor authentication for all taxpayers',
  'one-time',
  NULL, -- All entities
  NULL,
  FALSE,
  '2026-04-01',
  TRUE
),
-- 01/04/2027 - Mandatory Multi-factor authentication
(
  'GST',
  '- - Mandatory Multi-factor authentication for all taxpayers',
  'Mandatory Multi-factor authentication for all taxpayers',
  'one-time',
  NULL, -- All entities
  NULL,
  FALSE,
  '2027-04-01',
  TRUE
),
-- 01/04/2025 - New Investment/Turnover limits for MSME
(
  'MSMED 2006',
  '- - New Investment/Turnover limits for Micro/Small/Medium enterprises',
  'New Investment/Turnover limits for Micro/Small/Medium enterprises',
  'one-time',
  NULL, -- MSME entities
  NULL,
  FALSE,
  '2025-04-01',
  TRUE
),
-- 01/04/2026 - New Investment/Turnover limits for MSME
(
  'MSMED 2006',
  '- - New Investment/Turnover limits for Micro/Small/Medium enterprises',
  'New Investment/Turnover limits for Micro/Small/Medium enterprises',
  'one-time',
  NULL, -- MSME entities
  NULL,
  FALSE,
  '2026-04-01',
  TRUE
),
-- 01/04/2027 - New Investment/Turnover limits for MSME
(
  'MSMED 2006',
  '- - New Investment/Turnover limits for Micro/Small/Medium enterprises',
  'New Investment/Turnover limits for Micro/Small/Medium enterprises',
  'one-time',
  NULL, -- MSME entities
  NULL,
  FALSE,
  '2027-04-01',
  TRUE
),
-- 30/04/2025 - Opening Un-spent CSR Bank Account
(
  'RoC',
  '- - Opening Un-spent CSR Bank Account and transfer of funds',
  'Opening Un-spent CSR Bank Account and transfer of funds',
  'one-time',
  ARRAY['Private Limited Company'],
  'Penalty as per Companies Act.',
  FALSE,
  '2025-04-30',
  TRUE
),
-- 30/04/2026 - Opening Un-spent CSR Bank Account
(
  'RoC',
  '- - Opening Un-spent CSR Bank Account and transfer of funds',
  'Opening Un-spent CSR Bank Account and transfer of funds',
  'one-time',
  ARRAY['Private Limited Company'],
  'Penalty as per Companies Act.',
  FALSE,
  '2026-04-30',
  TRUE
),
-- 30/04/2027 - Opening Un-spent CSR Bank Account
(
  'RoC',
  '- - Opening Un-spent CSR Bank Account and transfer of funds',
  'Opening Un-spent CSR Bank Account and transfer of funds',
  'one-time',
  ARRAY['Private Limited Company'],
  'Penalty as per Companies Act.',
  FALSE,
  '2027-04-30',
  TRUE
),
-- 30/04/2025 - Form 1 Direct Tax Vivad se Vishwas Scheme
(
  'Income Tax',
  'Form 1 - Direct Tax Vivad se Vishwas Scheme declarations',
  'Direct Tax Vivad se Vishwas Scheme declarations',
  'one-time',
  NULL, -- All entities
  NULL,
  FALSE,
  '2025-04-30',
  TRUE
),
-- 30/04/2026 - Form 1 Direct Tax Vivad se Vishwas Scheme
(
  'Income Tax',
  'Form 1 - Direct Tax Vivad se Vishwas Scheme declarations',
  'Direct Tax Vivad se Vishwas Scheme declarations',
  'one-time',
  NULL, -- All entities
  NULL,
  FALSE,
  '2026-04-30',
  TRUE
),
-- 30/04/2027 - Form 1 Direct Tax Vivad se Vishwas Scheme
(
  'Income Tax',
  'Form 1 - Direct Tax Vivad se Vishwas Scheme declarations',
  'Direct Tax Vivad se Vishwas Scheme declarations',
  'one-time',
  NULL, -- All entities
  NULL,
  FALSE,
  '2027-04-30',
  TRUE
);

-- ============================================
-- VERIFICATION QUERY
-- ============================================
-- Run this to verify the data was inserted correctly
-- SELECT 
--   category,
--   requirement,
--   compliance_type,
--   entity_types,
--   due_date,
--   due_date_offset,
--   due_month,
--   due_day,
--   is_active
-- FROM public.compliance_templates
-- ORDER BY category, compliance_type, due_date NULLS LAST, due_month NULLS LAST;
