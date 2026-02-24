-- ============================================
-- MIGRATION: Add country_code to Key Tables
-- Phase 1: Foundation - Country Context
-- ============================================
-- This migration adds country_code columns to companies, compliance_templates,
-- regulatory_requirements, and document_templates tables
-- ============================================

-- ============================================
-- 1. Add country_code to companies table
-- ============================================
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) REFERENCES public.countries(code) DEFAULT 'IN';

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_companies_country ON public.companies(country_code);

-- Migrate existing data (all existing companies are India)
UPDATE public.companies 
SET country_code = 'IN' 
WHERE country_code IS NULL;

-- Add comment
COMMENT ON COLUMN public.companies.country_code IS 'ISO 3166-1 alpha-2 country code. All existing companies default to IN (India).';

-- ============================================
-- 2. Add country_code to compliance_templates
-- ============================================
ALTER TABLE public.compliance_templates
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) REFERENCES public.countries(code) DEFAULT 'IN';

-- Add index
CREATE INDEX IF NOT EXISTS idx_compliance_templates_country ON public.compliance_templates(country_code);

-- Migrate existing templates (all existing templates are for India)
UPDATE public.compliance_templates 
SET country_code = 'IN' 
WHERE country_code IS NULL;

-- Add comment
COMMENT ON COLUMN public.compliance_templates.country_code IS 'Country for which this compliance template applies. All existing templates default to IN (India).';

-- ============================================
-- 3. Add country_code to regulatory_requirements
-- ============================================
-- This inherits from company but is useful for reporting and filtering
ALTER TABLE public.regulatory_requirements
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) REFERENCES public.countries(code);

-- Add index
CREATE INDEX IF NOT EXISTS idx_regulatory_requirements_country ON public.regulatory_requirements(country_code);

-- Populate from company (for existing records)
UPDATE public.regulatory_requirements rr
SET country_code = c.country_code
FROM public.companies c
WHERE rr.company_id = c.id 
  AND rr.country_code IS NULL;

-- For any remaining NULL values, default to India
UPDATE public.regulatory_requirements 
SET country_code = 'IN' 
WHERE country_code IS NULL;

-- Add comment
COMMENT ON COLUMN public.regulatory_requirements.country_code IS 'Country code inherited from company. Used for reporting and filtering.';

-- ============================================
-- 4. Add country_code to document_templates_internal (if table exists)
-- ============================================
DO $$
BEGIN
  -- Check if document_templates_internal table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'document_templates_internal'
  ) THEN
    -- Add country_code column
    ALTER TABLE public.document_templates_internal
    ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) REFERENCES public.countries(code) DEFAULT 'IN';

    -- Add index
    CREATE INDEX IF NOT EXISTS idx_document_templates_internal_country ON public.document_templates_internal(country_code);

    -- Migrate existing templates
    UPDATE public.document_templates_internal 
    SET country_code = 'IN' 
    WHERE country_code IS NULL;

    -- Add comment
    COMMENT ON COLUMN public.document_templates_internal.country_code IS 'Country for which this document template applies. All existing templates default to IN (India).';
    
    RAISE NOTICE 'document_templates_internal.country_code column added';
  ELSE
    RAISE NOTICE 'document_templates_internal table does not exist, skipping';
  END IF;
  
  -- Also check for document_templates (legacy table name, if it exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'document_templates'
  ) THEN
    ALTER TABLE public.document_templates
    ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) REFERENCES public.countries(code) DEFAULT 'IN';

    CREATE INDEX IF NOT EXISTS idx_document_templates_country ON public.document_templates(country_code);

    UPDATE public.document_templates 
    SET country_code = 'IN' 
    WHERE country_code IS NULL;

    COMMENT ON COLUMN public.document_templates.country_code IS 'Country for which this document template applies. All existing templates default to IN (India).';
    
    RAISE NOTICE 'document_templates.country_code column added';
  END IF;
END $$;

-- ============================================
-- 5. Make country_code NOT NULL after migration
-- ============================================
-- Only make NOT NULL after ensuring all records have values

-- Companies
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.companies WHERE country_code IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot set NOT NULL: Some companies have NULL country_code';
  END IF;
  
  ALTER TABLE public.companies
  ALTER COLUMN country_code SET NOT NULL;
  
  RAISE NOTICE 'companies.country_code set to NOT NULL';
END $$;

-- Compliance templates
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.compliance_templates WHERE country_code IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot set NOT NULL: Some compliance_templates have NULL country_code';
  END IF;
  
  ALTER TABLE public.compliance_templates
  ALTER COLUMN country_code SET NOT NULL;
  
  RAISE NOTICE 'compliance_templates.country_code set to NOT NULL';
END $$;

-- Document templates (only if table exists)
DO $$
BEGIN
  -- Handle document_templates_internal
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'document_templates_internal'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.document_templates_internal WHERE country_code IS NULL
    ) THEN
      RAISE EXCEPTION 'Cannot set NOT NULL: Some document_templates_internal have NULL country_code';
    END IF;
    
    ALTER TABLE public.document_templates_internal
    ALTER COLUMN country_code SET NOT NULL;
    
    RAISE NOTICE 'document_templates_internal.country_code set to NOT NULL';
  END IF;
  
  -- Handle document_templates (legacy table, if it exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'document_templates'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.document_templates WHERE country_code IS NULL
    ) THEN
      RAISE EXCEPTION 'Cannot set NOT NULL: Some document_templates have NULL country_code';
    END IF;
    
    ALTER TABLE public.document_templates
    ALTER COLUMN country_code SET NOT NULL;
    
    RAISE NOTICE 'document_templates.country_code set to NOT NULL';
  END IF;
END $$;

-- Note: regulatory_requirements.country_code remains nullable
-- because it can be populated from company relationship

-- ============================================
-- 6. Verification queries
-- ============================================
DO $$
DECLARE
  companies_with_country INTEGER;
  templates_with_country INTEGER;
  requirements_with_country INTEGER;
BEGIN
  SELECT COUNT(*) INTO companies_with_country 
  FROM public.companies 
  WHERE country_code IS NOT NULL;
  
  SELECT COUNT(*) INTO templates_with_country 
  FROM public.compliance_templates 
  WHERE country_code IS NOT NULL;
  
  SELECT COUNT(*) INTO requirements_with_country 
  FROM public.regulatory_requirements 
  WHERE country_code IS NOT NULL;
  
  RAISE NOTICE 'Migration complete:';
  RAISE NOTICE '  - Companies with country_code: %', companies_with_country;
  RAISE NOTICE '  - Compliance templates with country_code: %', templates_with_country;
  RAISE NOTICE '  - Regulatory requirements with country_code: %', requirements_with_country;
END $$;
