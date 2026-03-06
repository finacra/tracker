-- ============================================
-- MIGRATION: Add Countries Master Table
-- Phase 1: Foundation - Country Infrastructure
-- ============================================
-- This migration creates the countries master table and populates it
-- with the 7 supported countries (India + 5 GCC + USA)
-- ============================================

-- Create countries master table (or add missing columns if it exists)
CREATE TABLE IF NOT EXISTS public.countries (
  code VARCHAR(2) PRIMARY KEY, -- ISO 3166-1 alpha-2
  name VARCHAR(100) NOT NULL,
  region VARCHAR(20) NOT NULL, -- 'APAC', 'GCC', 'NA', 'EU', etc.
  currency_code VARCHAR(3) NOT NULL, -- ISO 4217
  currency_symbol VARCHAR(10) NOT NULL,
  financial_year_start_month INTEGER NOT NULL, -- 1-12
  financial_year_type VARCHAR(2) NOT NULL, -- 'FY' or 'CY'
  timezone VARCHAR(50) NOT NULL,
  date_format VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}', -- Country-specific metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if table already exists (handles existing schema from schema-global-countries.sql)
DO $$
BEGIN
  -- Add is_active column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'countries' 
    AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.countries ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
  
  -- Add is_default column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'countries' 
    AND column_name = 'is_default'
  ) THEN
    ALTER TABLE public.countries ADD COLUMN is_default BOOLEAN DEFAULT false;
  END IF;
  
  -- Add metadata column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'countries' 
    AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.countries ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
  
  -- Add updated_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'countries' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.countries ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Add comments (only for columns that exist)
COMMENT ON TABLE public.countries IS 'Master table for all supported countries';
COMMENT ON COLUMN public.countries.code IS 'ISO 3166-1 alpha-2 country code (e.g., IN, AE, US)';
COMMENT ON COLUMN public.countries.region IS 'Geographic region: APAC, GCC, NA, EU';
COMMENT ON COLUMN public.countries.currency_code IS 'ISO 4217 currency code (e.g., INR, AED, USD)';
COMMENT ON COLUMN public.countries.financial_year_start_month IS 'Month when financial year starts (1-12)';
COMMENT ON COLUMN public.countries.financial_year_type IS 'FY (Financial Year) or CY (Calendar Year)';

-- Add comment for metadata column only if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'countries' 
    AND column_name = 'metadata'
  ) THEN
    COMMENT ON COLUMN public.countries.metadata IS 'Country-specific metadata and configuration';
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_countries_region ON public.countries(region);

-- Create index on is_active only if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'countries' 
    AND column_name = 'is_active'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_countries_active ON public.countries(is_active) WHERE is_active = true;
  END IF;
END $$;

-- Insert/Update supported countries (7 countries: India + 5 GCC + USA)
-- Use DO block to handle both existing and new schema gracefully
DO $$
DECLARE
  has_is_active BOOLEAN;
  has_is_default BOOLEAN;
  has_updated_at BOOLEAN;
  has_tax_id_label BOOLEAN;
  has_registration_id_label BOOLEAN;
BEGIN
  -- Check which columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'countries' 
    AND column_name = 'is_active'
  ) INTO has_is_active;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'countries' 
    AND column_name = 'is_default'
  ) INTO has_is_default;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'countries' 
    AND column_name = 'updated_at'
  ) INTO has_updated_at;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'countries' 
    AND column_name = 'tax_id_label'
  ) INTO has_tax_id_label;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'countries' 
    AND column_name = 'registration_id_label'
  ) INTO has_registration_id_label;
  
  -- Insert/Update countries with appropriate columns based on schema
  IF has_tax_id_label AND has_registration_id_label THEN
    -- Existing schema (from schema-global-countries.sql) - includes tax_id_label and registration_id_label
    INSERT INTO public.countries (code, name, region, currency_code, currency_symbol, 
      financial_year_start_month, financial_year_type, timezone, date_format, tax_id_label, registration_id_label)
    VALUES
      ('IN', 'India', 'APAC', 'INR', '₹', 4, 'FY', 'Asia/Kolkata', 'DD/MM/YYYY', 'PAN', 'CIN'),
      ('AE', 'United Arab Emirates', 'GCC', 'AED', 'د.إ', 1, 'CY', 'Asia/Dubai', 'DD/MM/YYYY', 'Tax Registration Number', 'Trade License Number'),
      ('SA', 'Saudi Arabia', 'GCC', 'SAR', 'ر.س', 1, 'CY', 'Asia/Riyadh', 'DD/MM/YYYY', 'Tax Identification Number', 'Commercial Registration'),
      ('OM', 'Oman', 'GCC', 'OMR', 'ر.ع.', 1, 'CY', 'Asia/Muscat', 'DD/MM/YYYY', 'Tax Card Number', 'Commercial Registration'),
      ('QA', 'Qatar', 'GCC', 'QAR', 'ر.ق', 1, 'CY', 'Asia/Qatar', 'DD/MM/YYYY', 'Tax Identification Number', 'Commercial Registration'),
      ('BH', 'Bahrain', 'GCC', 'BHD', 'د.ب', 1, 'CY', 'Asia/Bahrain', 'DD/MM/YYYY', 'Tax Identification Number', 'Commercial Registration'),
      ('US', 'United States', 'NA', 'USD', '$', 1, 'CY', 'America/New_York', 'MM/DD/YYYY', 'EIN', 'State Registration Number')
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      region = EXCLUDED.region,
      currency_code = EXCLUDED.currency_code,
      currency_symbol = EXCLUDED.currency_symbol,
      financial_year_start_month = EXCLUDED.financial_year_start_month,
      financial_year_type = EXCLUDED.financial_year_type,
      timezone = EXCLUDED.timezone,
      date_format = EXCLUDED.date_format,
      tax_id_label = EXCLUDED.tax_id_label,
      registration_id_label = EXCLUDED.registration_id_label;
    
    -- Update new columns if they were just added
    IF has_is_active THEN
      UPDATE public.countries SET is_active = true WHERE is_active IS NULL;
      UPDATE public.countries SET is_active = true WHERE code IN ('IN', 'AE', 'SA', 'OM', 'QA', 'BH', 'US');
    END IF;
    
    IF has_is_default THEN
      UPDATE public.countries SET is_default = (code = 'IN') WHERE is_default IS NULL;
    END IF;
    
    IF has_updated_at THEN
      UPDATE public.countries SET updated_at = NOW() WHERE updated_at IS NULL;
    END IF;
  ELSIF has_is_active AND has_is_default AND has_updated_at THEN
    -- New schema - all new columns exist, no tax_id_label/registration_id_label
    INSERT INTO public.countries (code, name, region, currency_code, currency_symbol, 
      financial_year_start_month, financial_year_type, timezone, date_format, is_active, is_default)
    VALUES
      ('IN', 'India', 'APAC', 'INR', '₹', 4, 'FY', 'Asia/Kolkata', 'DD/MM/YYYY', true, true),
      ('AE', 'United Arab Emirates', 'GCC', 'AED', 'د.إ', 1, 'CY', 'Asia/Dubai', 'DD/MM/YYYY', true, false),
      ('SA', 'Saudi Arabia', 'GCC', 'SAR', 'ر.س', 1, 'CY', 'Asia/Riyadh', 'DD/MM/YYYY', true, false),
      ('OM', 'Oman', 'GCC', 'OMR', 'ر.ع.', 1, 'CY', 'Asia/Muscat', 'DD/MM/YYYY', true, false),
      ('QA', 'Qatar', 'GCC', 'QAR', 'ر.ق', 1, 'CY', 'Asia/Qatar', 'DD/MM/YYYY', true, false),
      ('BH', 'Bahrain', 'GCC', 'BHD', 'د.ب', 1, 'CY', 'Asia/Bahrain', 'DD/MM/YYYY', true, false),
      ('US', 'United States', 'NA', 'USD', '$', 1, 'CY', 'America/New_York', 'MM/DD/YYYY', true, false)
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      region = EXCLUDED.region,
      currency_code = EXCLUDED.currency_code,
      currency_symbol = EXCLUDED.currency_symbol,
      financial_year_start_month = EXCLUDED.financial_year_start_month,
      financial_year_type = EXCLUDED.financial_year_type,
      timezone = EXCLUDED.timezone,
      date_format = EXCLUDED.date_format,
      is_active = EXCLUDED.is_active,
      is_default = EXCLUDED.is_default,
      updated_at = NOW();
  ELSE
    -- Minimal schema - insert without new columns
    INSERT INTO public.countries (code, name, region, currency_code, currency_symbol, 
      financial_year_start_month, financial_year_type, timezone, date_format)
    VALUES
      ('IN', 'India', 'APAC', 'INR', '₹', 4, 'FY', 'Asia/Kolkata', 'DD/MM/YYYY'),
      ('AE', 'United Arab Emirates', 'GCC', 'AED', 'د.إ', 1, 'CY', 'Asia/Dubai', 'DD/MM/YYYY'),
      ('SA', 'Saudi Arabia', 'GCC', 'SAR', 'ر.س', 1, 'CY', 'Asia/Riyadh', 'DD/MM/YYYY'),
      ('OM', 'Oman', 'GCC', 'OMR', 'ر.ع.', 1, 'CY', 'Asia/Muscat', 'DD/MM/YYYY'),
      ('QA', 'Qatar', 'GCC', 'QAR', 'ر.ق', 1, 'CY', 'Asia/Qatar', 'DD/MM/YYYY'),
      ('BH', 'Bahrain', 'GCC', 'BHD', 'د.ب', 1, 'CY', 'Asia/Bahrain', 'DD/MM/YYYY'),
      ('US', 'United States', 'NA', 'USD', '$', 1, 'CY', 'America/New_York', 'MM/DD/YYYY')
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      region = EXCLUDED.region,
      currency_code = EXCLUDED.currency_code,
      currency_symbol = EXCLUDED.currency_symbol,
      financial_year_start_month = EXCLUDED.financial_year_start_month,
      financial_year_type = EXCLUDED.financial_year_type,
      timezone = EXCLUDED.timezone,
      date_format = EXCLUDED.date_format;
    
    -- Update new columns if they were just added
    IF has_is_active THEN
      UPDATE public.countries SET is_active = true WHERE is_active IS NULL;
      UPDATE public.countries SET is_active = true WHERE code IN ('IN', 'AE', 'SA', 'OM', 'QA', 'BH', 'US');
    END IF;
    
    IF has_is_default THEN
      UPDATE public.countries SET is_default = (code = 'IN') WHERE is_default IS NULL;
    END IF;
    
    IF has_updated_at THEN
      UPDATE public.countries SET updated_at = NOW() WHERE updated_at IS NULL;
    END IF;
  END IF;
END $$;

-- Enable RLS (Row Level Security)
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

-- RLS Policy: All authenticated users can read countries
DROP POLICY IF EXISTS "Anyone can view countries" ON public.countries;
CREATE POLICY "Anyone can view countries"
  ON public.countries FOR SELECT
  USING (true); -- Public read access for country list

-- Verify insertion
DO $$
DECLARE
  country_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO country_count FROM public.countries;
  RAISE NOTICE 'Countries table created with % countries', country_count;
END $$;
