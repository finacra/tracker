-- ============================================
-- MIGRATION: Add Year Type Support (FY/CY)
-- Adds support for Financial Year (FY) and Calendar Year (CY)
-- Backward compatible: All existing records default to 'FY'
-- ============================================

-- Add year_type column to companies table
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS year_type TEXT NOT NULL DEFAULT 'FY' 
CHECK (year_type IN ('FY', 'CY'));

-- Add year_type column to compliance_templates table
ALTER TABLE compliance_templates 
ADD COLUMN IF NOT EXISTS year_type TEXT NOT NULL DEFAULT 'FY' 
CHECK (year_type IN ('FY', 'CY'));

-- Add year_type column to regulatory_requirements table
ALTER TABLE regulatory_requirements 
ADD COLUMN IF NOT EXISTS year_type TEXT NOT NULL DEFAULT 'FY' 
CHECK (year_type IN ('FY', 'CY'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_companies_year_type ON companies(year_type);
CREATE INDEX IF NOT EXISTS idx_templates_year_type ON compliance_templates(year_type);
CREATE INDEX IF NOT EXISTS idx_requirements_year_type ON regulatory_requirements(year_type);

-- Verify: All existing records should have 'FY' (due to default)
-- This is automatic, no UPDATE needed

-- Show summary
SELECT 
  'Migration completed successfully' as status,
  (SELECT COUNT(*) FROM companies WHERE year_type = 'FY') as companies_with_fy,
  (SELECT COUNT(*) FROM compliance_templates WHERE year_type = 'FY') as templates_with_fy,
  (SELECT COUNT(*) FROM regulatory_requirements WHERE year_type = 'FY') as requirements_with_fy;
