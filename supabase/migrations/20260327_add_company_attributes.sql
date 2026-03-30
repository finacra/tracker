-- Migration: Add company attributes for conditional compliance evaluation
-- Date: 2026-03-27
-- Purpose: Rules engine needs these to evaluate thresholds (PF if 20+ employees, etc.)

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS employee_count INTEGER,
  ADD COLUMN IF NOT EXISTS annual_turnover DECIMAL(15,2),       -- in lakhs (₹)
  ADD COLUMN IF NOT EXISTS is_gst_registered BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_number VARCHAR(15),
  ADD COLUMN IF NOT EXISTS net_worth DECIMAL(15,2),             -- in crores (₹)
  ADD COLUMN IF NOT EXISTS is_msme BOOLEAN,
  ADD COLUMN IF NOT EXISTS msme_category VARCHAR(10),           -- micro, small, medium
  ADD COLUMN IF NOT EXISTS has_imports_exports BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_startup_dpiit BOOLEAN DEFAULT false;

COMMENT ON COLUMN companies.employee_count IS 'Total employee headcount — determines PF (>=20), ESI (>=10), POSH (>=10), Gratuity (>=5)';
COMMENT ON COLUMN companies.annual_turnover IS 'Annual turnover in lakhs — determines Tax Audit (>1Cr), E-invoicing (>10Cr), GST thresholds';
COMMENT ON COLUMN companies.is_gst_registered IS 'Whether company has GST registration — determines GSTR filing obligations';
COMMENT ON COLUMN companies.gst_number IS 'GSTIN (15-char) — validated format';
COMMENT ON COLUMN companies.net_worth IS 'Net worth in crores — determines CSR (>500Cr), CARO thresholds';
COMMENT ON COLUMN companies.is_msme IS 'Whether registered as MSME — affects filing exemptions and timelines';
COMMENT ON COLUMN companies.msme_category IS 'micro/small/medium — different thresholds apply';
COMMENT ON COLUMN companies.has_imports_exports IS 'Whether company does imports/exports — IEC, DGFT, customs compliance';
COMMENT ON COLUMN companies.is_startup_dpiit IS 'Whether DPIIT-recognized startup — tax exemptions, simplified compliance';
