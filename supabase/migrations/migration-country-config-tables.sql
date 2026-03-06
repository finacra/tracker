-- ============================================
-- MIGRATION: Country-Specific Configuration Tables
-- Phase 1: Foundation - Country Configuration
-- ============================================
-- This migration creates tables for country-specific validation rules,
-- compliance categories, and entity types
-- ============================================

-- ============================================
-- 1. Country-specific validation rules
-- ============================================
CREATE TABLE IF NOT EXISTS public.country_validation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_code VARCHAR(2) NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  field_type VARCHAR(50) NOT NULL, -- 'registration_id', 'tax_id', 'director_id', etc.
  pattern VARCHAR(255), -- Regex pattern
  min_length INTEGER,
  max_length INTEGER,
  required BOOLEAN DEFAULT true,
  validation_function TEXT, -- Custom validation function name
  error_message TEXT,
  verification_portal_url TEXT, -- URL for manual verification
  verification_instructions TEXT, -- Instructions for manual verification
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_code, field_type)
);

COMMENT ON TABLE public.country_validation_rules IS 'Validation rules for country-specific fields (CIN, Trade License, EIN, etc.)';
COMMENT ON COLUMN public.country_validation_rules.field_type IS 'Type of field: registration_id, tax_id, director_id, postal_code, state';
COMMENT ON COLUMN public.country_validation_rules.pattern IS 'Regex pattern for format validation';
COMMENT ON COLUMN public.country_validation_rules.verification_portal_url IS 'Official portal URL for manual verification';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_country_validation_rules_country ON public.country_validation_rules(country_code);
CREATE INDEX IF NOT EXISTS idx_country_validation_rules_field_type ON public.country_validation_rules(field_type);

-- ============================================
-- 2. Country-specific compliance categories
-- ============================================
-- Handle existing table structure (from schema-global-countries.sql)
DO $$
BEGIN
  -- Check if table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'country_compliance_categories'
  ) THEN
    -- Create new table with full structure
    CREATE TABLE public.country_compliance_categories (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      country_code VARCHAR(2) NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
      category_code VARCHAR(50) NOT NULL, -- 'tax', 'corporate', 'labor', etc.
      category_name VARCHAR(100) NOT NULL,
      display_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(country_code, category_code)
    );
    
    COMMENT ON TABLE public.country_compliance_categories IS 'Compliance categories specific to each country';
    COMMENT ON COLUMN public.country_compliance_categories.category_code IS 'Internal category code (e.g., tax, corporate, labor)';
    COMMENT ON COLUMN public.country_compliance_categories.category_name IS 'Display name for the category';
    
    CREATE INDEX IF NOT EXISTS idx_country_compliance_categories_country ON public.country_compliance_categories(country_code);
    CREATE INDEX IF NOT EXISTS idx_country_compliance_categories_active ON public.country_compliance_categories(is_active) WHERE is_active = true;
  ELSE
    -- Table exists, add missing columns
    -- Add category_code if it doesn't exist (derive from category_name for existing records)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'country_compliance_categories' 
      AND column_name = 'category_code'
    ) THEN
      ALTER TABLE public.country_compliance_categories 
      ADD COLUMN category_code VARCHAR(50);
      
      -- Populate category_code from category_name (lowercase, replace spaces with underscores)
      UPDATE public.country_compliance_categories 
      SET category_code = LOWER(REPLACE(category_name, ' ', '_'))
      WHERE category_code IS NULL;
      
      -- Make it NOT NULL after populating
      ALTER TABLE public.country_compliance_categories 
      ALTER COLUMN category_code SET NOT NULL;
      
      -- Drop old unique constraint and add new one
      ALTER TABLE public.country_compliance_categories 
      DROP CONSTRAINT IF EXISTS country_compliance_categories_country_code_category_name_key;
      
      ALTER TABLE public.country_compliance_categories 
      ADD CONSTRAINT country_compliance_categories_country_code_category_code_key 
      UNIQUE(country_code, category_code);
    END IF;
    
    -- Add is_active if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'country_compliance_categories' 
      AND column_name = 'is_active'
    ) THEN
      ALTER TABLE public.country_compliance_categories 
      ADD COLUMN is_active BOOLEAN DEFAULT true;
      
      UPDATE public.country_compliance_categories 
      SET is_active = true 
      WHERE is_active IS NULL;
    END IF;
    
    -- Add metadata if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'country_compliance_categories' 
      AND column_name = 'metadata'
    ) THEN
      ALTER TABLE public.country_compliance_categories 
      ADD COLUMN metadata JSONB DEFAULT '{}';
    END IF;
    
    -- Create indexes if they don't exist
    CREATE INDEX IF NOT EXISTS idx_country_compliance_categories_country ON public.country_compliance_categories(country_code);
    CREATE INDEX IF NOT EXISTS idx_country_compliance_categories_active ON public.country_compliance_categories(is_active) WHERE is_active = true;
  END IF;
END $$;

-- ============================================
-- 3. Country-specific entity types
-- ============================================
-- Handle existing table structure (from schema-global-countries.sql)
DO $$
BEGIN
  -- Check if table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'country_entity_types'
  ) THEN
    -- Create new table with full structure
    CREATE TABLE public.country_entity_types (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      country_code VARCHAR(2) NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
      entity_code VARCHAR(50) NOT NULL, -- 'private_limited', 'llc', 'corporation', etc.
      entity_name VARCHAR(100) NOT NULL,
      display_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(country_code, entity_code)
    );
    
    COMMENT ON TABLE public.country_entity_types IS 'Legal entity types specific to each country (Private Limited, LLC, Corporation, etc.)';
    COMMENT ON COLUMN public.country_entity_types.entity_code IS 'Internal entity code (e.g., private_limited, llc, corporation)';
    COMMENT ON COLUMN public.country_entity_types.entity_name IS 'Display name for the entity type';
    
    CREATE INDEX IF NOT EXISTS idx_country_entity_types_country ON public.country_entity_types(country_code);
    CREATE INDEX IF NOT EXISTS idx_country_entity_types_active ON public.country_entity_types(is_active) WHERE is_active = true;
  ELSE
    -- Table exists, check if it uses entity_type or entity_code
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'country_entity_types' 
      AND column_name = 'entity_type'
    ) THEN
      -- Existing schema uses entity_type, add entity_code as alias if needed
      -- For now, we'll keep entity_type and add missing columns
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'country_entity_types' 
        AND column_name = 'is_active'
      ) THEN
        ALTER TABLE public.country_entity_types 
        ADD COLUMN is_active BOOLEAN DEFAULT true;
        
        UPDATE public.country_entity_types 
        SET is_active = true 
        WHERE is_active IS NULL;
      END IF;
      
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'country_entity_types' 
        AND column_name = 'metadata'
      ) THEN
        ALTER TABLE public.country_entity_types 
        ADD COLUMN metadata JSONB DEFAULT '{}';
      END IF;
    ELSE
      -- New schema with entity_code, add missing columns
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'country_entity_types' 
        AND column_name = 'is_active'
      ) THEN
        ALTER TABLE public.country_entity_types 
        ADD COLUMN is_active BOOLEAN DEFAULT true;
      END IF;
      
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'country_entity_types' 
        AND column_name = 'metadata'
      ) THEN
        ALTER TABLE public.country_entity_types 
        ADD COLUMN metadata JSONB DEFAULT '{}';
      END IF;
    END IF;
    
    -- Create indexes if they don't exist
    CREATE INDEX IF NOT EXISTS idx_country_entity_types_country ON public.country_entity_types(country_code);
    CREATE INDEX IF NOT EXISTS idx_country_entity_types_active ON public.country_entity_types(is_active) WHERE is_active = true;
  END IF;
END $$;

-- ============================================
-- 4. Enable RLS on all tables
-- ============================================
ALTER TABLE public.country_validation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_compliance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_entity_types ENABLE ROW LEVEL SECURITY;

-- RLS Policies: All authenticated users can read country configs
DROP POLICY IF EXISTS "Anyone can view validation rules" ON public.country_validation_rules;
CREATE POLICY "Anyone can view validation rules"
  ON public.country_validation_rules FOR SELECT
  USING (true);

-- Update compliance categories policy (may have existing policy with different name)
DROP POLICY IF EXISTS "Anyone can view compliance categories" ON public.country_compliance_categories;
DROP POLICY IF EXISTS "Compliance categories are publicly readable" ON public.country_compliance_categories;
CREATE POLICY "Anyone can view compliance categories"
  ON public.country_compliance_categories FOR SELECT
  USING (true);

-- Update entity types policy (may have existing policy with different name)
DROP POLICY IF EXISTS "Anyone can view entity types" ON public.country_entity_types;
DROP POLICY IF EXISTS "Entity types are publicly readable" ON public.country_entity_types;
CREATE POLICY "Anyone can view entity types"
  ON public.country_entity_types FOR SELECT
  USING (true);

-- Only superadmins can modify country configs (if is_superadmin function exists)
DO $$
BEGIN
  -- Check if is_superadmin function exists before creating policies
  IF EXISTS (
    SELECT 1 FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    AND routine_name = 'is_superadmin'
  ) THEN
    DROP POLICY IF EXISTS "Superadmins can manage validation rules" ON public.country_validation_rules;
    CREATE POLICY "Superadmins can manage validation rules"
      ON public.country_validation_rules FOR ALL
      USING (public.is_superadmin(auth.uid()));

    DROP POLICY IF EXISTS "Superadmins can manage compliance categories" ON public.country_compliance_categories;
    CREATE POLICY "Superadmins can manage compliance categories"
      ON public.country_compliance_categories FOR ALL
      USING (public.is_superadmin(auth.uid()));

    DROP POLICY IF EXISTS "Superadmins can manage entity types" ON public.country_entity_types;
    CREATE POLICY "Superadmins can manage entity types"
      ON public.country_entity_types FOR ALL
      USING (public.is_superadmin(auth.uid()));
  ELSE
    -- If is_superadmin doesn't exist, create policies that allow authenticated users to manage
    -- (You may want to update these later with proper admin checks)
    RAISE NOTICE 'is_superadmin function not found, creating basic policies';
    
    DROP POLICY IF EXISTS "Superadmins can manage validation rules" ON public.country_validation_rules;
    CREATE POLICY "Superadmins can manage validation rules"
      ON public.country_validation_rules FOR ALL
      USING (auth.role() = 'authenticated');

    DROP POLICY IF EXISTS "Superadmins can manage compliance categories" ON public.country_compliance_categories;
    CREATE POLICY "Superadmins can manage compliance categories"
      ON public.country_compliance_categories FOR ALL
      USING (auth.role() = 'authenticated');

    DROP POLICY IF EXISTS "Superadmins can manage entity types" ON public.country_entity_types;
    CREATE POLICY "Superadmins can manage entity types"
      ON public.country_entity_types FOR ALL
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ============================================
-- 5. Verification
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Country configuration tables created successfully';
  RAISE NOTICE 'Validation rules, compliance categories, and entity types can now be configured per country';
END $$;
