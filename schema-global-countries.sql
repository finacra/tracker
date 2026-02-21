-- ============================================
-- PHASE 1: GLOBAL SUPPORT - DATABASE SETUP
-- Adds country/region support for multi-country compliance tracking
-- Supports: India, UAE, Saudi Arabia, Oman, Qatar, Bahrain, USA
-- ============================================

-- ============================================
-- 1. CREATE COUNTRIES REFERENCE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.countries (
  code VARCHAR(2) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  region VARCHAR(50) NOT NULL CHECK (region IN ('APAC', 'GCC', 'NA', 'EU')),
  currency_code VARCHAR(3) NOT NULL,
  currency_symbol VARCHAR(10) NOT NULL,
  financial_year_start_month INT NOT NULL CHECK (financial_year_start_month >= 1 AND financial_year_start_month <= 12),
  financial_year_type VARCHAR(10) NOT NULL CHECK (financial_year_type IN ('FY', 'CY')),
  date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
  timezone VARCHAR(50) DEFAULT 'UTC',
  tax_id_label VARCHAR(50) NOT NULL,
  registration_id_label VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.countries IS 'Master reference table for supported countries and their configurations';
COMMENT ON COLUMN public.countries.code IS 'ISO 3166-1 alpha-2 country code (e.g., IN, AE, SA, US)';
COMMENT ON COLUMN public.countries.region IS 'Geographic region: APAC, GCC, NA, EU';
COMMENT ON COLUMN public.countries.currency_code IS 'ISO 4217 currency code (e.g., INR, AED, USD)';
COMMENT ON COLUMN public.countries.currency_symbol IS 'Currency display symbol (e.g., ₹, د.إ, $)';
COMMENT ON COLUMN public.countries.financial_year_start_month IS 'Month when financial year starts (1-12, e.g., 4 for April, 1 for January)';
COMMENT ON COLUMN public.countries.financial_year_type IS 'Financial Year (FY) or Calendar Year (CY)';
COMMENT ON COLUMN public.countries.tax_id_label IS 'Label for tax identification field (e.g., PAN, EIN, Tax Registration Number)';
COMMENT ON COLUMN public.countries.registration_id_label IS 'Label for company registration ID (e.g., CIN, Trade License Number, Commercial Registration)';

-- Index for region queries
CREATE INDEX IF NOT EXISTS idx_countries_region ON public.countries(region);

-- Enable RLS
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

-- RLS Policy: All authenticated users can read countries
DROP POLICY IF EXISTS "Countries are publicly readable" ON public.countries;
CREATE POLICY "Countries are publicly readable"
  ON public.countries FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================
-- 2. INSERT INITIAL COUNTRY DATA
-- ============================================
INSERT INTO public.countries (code, name, region, currency_code, currency_symbol, financial_year_start_month, financial_year_type, date_format, timezone, tax_id_label, registration_id_label) VALUES
('IN', 'India', 'APAC', 'INR', '₹', 4, 'FY', 'DD/MM/YYYY', 'Asia/Kolkata', 'PAN', 'CIN'),
('AE', 'United Arab Emirates', 'GCC', 'AED', 'د.إ', 1, 'CY', 'DD/MM/YYYY', 'Asia/Dubai', 'Tax Registration Number', 'Trade License Number'),
('SA', 'Saudi Arabia', 'GCC', 'SAR', '﷼', 1, 'CY', 'DD/MM/YYYY', 'Asia/Riyadh', 'Tax Identification Number', 'Commercial Registration'),
('OM', 'Oman', 'GCC', 'OMR', 'ر.ع.', 1, 'CY', 'DD/MM/YYYY', 'Asia/Muscat', 'Tax Card Number', 'Commercial Registration'),
('QA', 'Qatar', 'GCC', 'QAR', 'ر.ق', 1, 'CY', 'DD/MM/YYYY', 'Asia/Qatar', 'Tax Identification Number', 'Commercial Registration'),
('BH', 'Bahrain', 'GCC', 'BHD', '.د.ب', 1, 'CY', 'DD/MM/YYYY', 'Asia/Bahrain', 'Tax Identification Number', 'Commercial Registration'),
('US', 'United States', 'NA', 'USD', '$', 1, 'CY', 'MM/DD/YYYY', 'America/New_York', 'EIN', 'State Registration Number')
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- 3. ADD COUNTRY_CODE TO COMPANIES TABLE
-- ============================================
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) NOT NULL DEFAULT 'IN' REFERENCES public.countries(code),
ADD COLUMN IF NOT EXISTS region VARCHAR(50) NOT NULL DEFAULT 'APAC';

COMMENT ON COLUMN public.companies.country_code IS 'Country code for the company (defaults to IN for backward compatibility)';
COMMENT ON COLUMN public.companies.region IS 'Geographic region (denormalized from countries table for query performance)';

-- Create index for country_code queries
CREATE INDEX IF NOT EXISTS idx_companies_country_code ON public.companies(country_code);
CREATE INDEX IF NOT EXISTS idx_companies_region ON public.companies(region);

-- ============================================
-- 4. MIGRATE EXISTING COMPANIES DATA
-- ============================================
-- Set all existing companies to India (IN) and APAC region
UPDATE public.companies
SET country_code = 'IN', region = 'APAC'
WHERE country_code IS NULL OR country_code = '';

-- ============================================
-- 5. ADD COUNTRY_CODE TO COMPLIANCE_TEMPLATES TABLE
-- ============================================
ALTER TABLE public.compliance_templates
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) REFERENCES public.countries(code),
ADD COLUMN IF NOT EXISTS applicable_regions TEXT[] DEFAULT NULL;

COMMENT ON COLUMN public.compliance_templates.country_code IS 'Country code for country-specific templates (NULL for multi-country templates)';
COMMENT ON COLUMN public.compliance_templates.applicable_regions IS 'Array of regions where template applies (e.g., [''GCC''] for all GCC countries)';

-- Create index for country_code queries
CREATE INDEX IF NOT EXISTS idx_compliance_templates_country_code ON public.compliance_templates(country_code);
CREATE INDEX IF NOT EXISTS idx_compliance_templates_applicable_regions ON public.compliance_templates USING GIN(applicable_regions);

-- ============================================
-- 6. MIGRATE EXISTING COMPLIANCE_TEMPLATES DATA
-- ============================================
-- Set all existing templates to India (IN)
UPDATE public.compliance_templates
SET country_code = 'IN'
WHERE country_code IS NULL;

-- ============================================
-- 7. CREATE COUNTRY-SPECIFIC CONFIGURATION TABLES
-- ============================================

-- 7.1 Country Document Types
CREATE TABLE IF NOT EXISTS public.country_document_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_code VARCHAR(2) NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL,
  is_required BOOLEAN DEFAULT FALSE,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_code, document_type)
);

COMMENT ON TABLE public.country_document_types IS 'Country-specific document types required during onboarding';
COMMENT ON COLUMN public.country_document_types.document_type IS 'Name of the document type (e.g., Certificate of Incorporation, Trade License)';
COMMENT ON COLUMN public.country_document_types.is_required IS 'Whether this document is mandatory during onboarding';
COMMENT ON COLUMN public.country_document_types.display_order IS 'Order in which documents should be displayed in UI';

CREATE INDEX IF NOT EXISTS idx_country_document_types_country_code ON public.country_document_types(country_code);

-- Enable RLS
ALTER TABLE public.country_document_types ENABLE ROW LEVEL SECURITY;

-- RLS Policy: All authenticated users can read document types
DROP POLICY IF EXISTS "Document types are publicly readable" ON public.country_document_types;
CREATE POLICY "Document types are publicly readable"
  ON public.country_document_types FOR SELECT
  USING (auth.role() = 'authenticated');

-- 7.2 Country Entity Types
CREATE TABLE IF NOT EXISTS public.country_entity_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_code VARCHAR(2) NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  entity_type VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  requires_directors BOOLEAN DEFAULT TRUE,
  requires_shareholders BOOLEAN DEFAULT FALSE,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_code, entity_type)
);

COMMENT ON TABLE public.country_entity_types IS 'Country-specific entity/company types';
COMMENT ON COLUMN public.country_entity_types.entity_type IS 'Internal code for entity type (e.g., private_limited, llc)';
COMMENT ON COLUMN public.country_entity_types.display_name IS 'User-facing display name (e.g., Private Limited Company, LLC)';
COMMENT ON COLUMN public.country_entity_types.requires_directors IS 'Whether this entity type requires director information';
COMMENT ON COLUMN public.country_entity_types.requires_shareholders IS 'Whether this entity type requires shareholder information';

CREATE INDEX IF NOT EXISTS idx_country_entity_types_country_code ON public.country_entity_types(country_code);

-- Enable RLS
ALTER TABLE public.country_entity_types ENABLE ROW LEVEL SECURITY;

-- RLS Policy: All authenticated users can read entity types
DROP POLICY IF EXISTS "Entity types are publicly readable" ON public.country_entity_types;
CREATE POLICY "Entity types are publicly readable"
  ON public.country_entity_types FOR SELECT
  USING (auth.role() = 'authenticated');

-- 7.3 Country Compliance Categories
CREATE TABLE IF NOT EXISTS public.country_compliance_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_code VARCHAR(2) NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  category_name VARCHAR(100) NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_code, category_name)
);

COMMENT ON TABLE public.country_compliance_categories IS 'Country-specific compliance categories';
COMMENT ON COLUMN public.country_compliance_categories.category_name IS 'Name of compliance category (e.g., Income Tax, GST, VAT, Corporate Tax)';
COMMENT ON COLUMN public.country_compliance_categories.display_order IS 'Order in which categories should be displayed in UI';

CREATE INDEX IF NOT EXISTS idx_country_compliance_categories_country_code ON public.country_compliance_categories(country_code);

-- Enable RLS
ALTER TABLE public.country_compliance_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policy: All authenticated users can read compliance categories
DROP POLICY IF EXISTS "Compliance categories are publicly readable" ON public.country_compliance_categories;
CREATE POLICY "Compliance categories are publicly readable"
  ON public.country_compliance_categories FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================
-- 8. POPULATE INDIA-SPECIFIC CONFIGURATIONS
-- ============================================

-- 8.1 India Document Types
INSERT INTO public.country_document_types (country_code, document_type, is_required, display_order) VALUES
('IN', 'Certificate of Incorporation', TRUE, 1),
('IN', 'MOA (Memorandum of Association)', TRUE, 2),
('IN', 'AOA (Articles of Association)', TRUE, 3),
('IN', 'Rental Deed', FALSE, 4),
('IN', 'DIN Certificate', FALSE, 5),
('IN', 'PAN', TRUE, 6),
('IN', 'TAN', FALSE, 7)
ON CONFLICT (country_code, document_type) DO NOTHING;

-- 8.2 India Entity Types
INSERT INTO public.country_entity_types (country_code, entity_type, display_name, requires_directors, requires_shareholders, display_order) VALUES
('IN', 'Private Limited', 'Private Limited Company', TRUE, FALSE, 1),
('IN', 'Public Limited', 'Public Limited Company', TRUE, TRUE, 2),
('IN', 'LLP', 'Limited Liability Partnership', TRUE, FALSE, 3),
('IN', 'Partnership', 'Partnership Firm', TRUE, FALSE, 4),
('IN', 'Sole Proprietorship', 'Sole Proprietorship', FALSE, FALSE, 5)
ON CONFLICT (country_code, entity_type) DO NOTHING;

-- 8.3 India Compliance Categories
INSERT INTO public.country_compliance_categories (country_code, category_name, display_order) VALUES
('IN', 'Income Tax', 1),
('IN', 'GST', 2),
('IN', 'Payroll', 3),
('IN', 'RoC', 4),
('IN', 'Renewals', 5),
('IN', 'Others', 6)
ON CONFLICT (country_code, category_name) DO NOTHING;

-- ============================================
-- 9. VALIDATION QUERIES
-- ============================================
-- Run these queries after migration to verify success

-- Check all companies have country_code
DO $$
DECLARE
  total_companies INT;
  companies_with_country INT;
BEGIN
  SELECT COUNT(*) INTO total_companies FROM public.companies;
  SELECT COUNT(*) INTO companies_with_country FROM public.companies WHERE country_code IS NOT NULL;
  
  IF total_companies = companies_with_country THEN
    RAISE NOTICE '✓ All companies have country_code set (Total: %)', total_companies;
  ELSE
    RAISE WARNING '✗ Some companies missing country_code (Total: %, With country: %)', total_companies, companies_with_country;
  END IF;
END $$;

-- Check all templates have country_code
DO $$
DECLARE
  total_templates INT;
  templates_with_country INT;
BEGIN
  SELECT COUNT(*) INTO total_templates FROM public.compliance_templates;
  SELECT COUNT(*) INTO templates_with_country FROM public.compliance_templates WHERE country_code IS NOT NULL;
  
  IF total_templates = templates_with_country THEN
    RAISE NOTICE '✓ All compliance_templates have country_code set (Total: %)', total_templates;
  ELSE
    RAISE WARNING '✗ Some templates missing country_code (Total: %, With country: %)', total_templates, templates_with_country;
  END IF;
END $$;

-- Verify country data
DO $$
DECLARE
  country_count INT;
BEGIN
  SELECT COUNT(*) INTO country_count FROM public.countries;
  RAISE NOTICE '✓ Countries table populated with % countries', country_count;
END $$;

-- Check India configs populated
DO $$
DECLARE
  doc_types_count INT;
  entity_types_count INT;
  categories_count INT;
BEGIN
  SELECT COUNT(*) INTO doc_types_count FROM public.country_document_types WHERE country_code = 'IN';
  SELECT COUNT(*) INTO entity_types_count FROM public.country_entity_types WHERE country_code = 'IN';
  SELECT COUNT(*) INTO categories_count FROM public.country_compliance_categories WHERE country_code = 'IN';
  
  RAISE NOTICE '✓ India configurations populated:';
  RAISE NOTICE '  - Document Types: %', doc_types_count;
  RAISE NOTICE '  - Entity Types: %', entity_types_count;
  RAISE NOTICE '  - Compliance Categories: %', categories_count;
END $$;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Summary:
-- 1. ✓ Created countries reference table
-- 2. ✓ Inserted 7 countries (India, UAE, Saudi Arabia, Oman, Qatar, Bahrain, USA)
-- 3. ✓ Added country_code and region to companies table
-- 4. ✓ Migrated all existing companies to country_code='IN'
-- 5. ✓ Added country_code and applicable_regions to compliance_templates
-- 6. ✓ Migrated all existing templates to country_code='IN'
-- 7. ✓ Created country-specific configuration tables
-- 8. ✓ Populated India-specific configurations
-- 9. ✓ Enabled RLS on all new tables
-- 10. ✓ Created indexes for performance
--
-- Next Steps:
-- - Phase 2: Update application code to use country configurations
-- - Phase 3: Add country selection to onboarding flow
-- - Phase 4: Make compliance modules country-aware
