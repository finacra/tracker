-- ============================================================================
-- One-shot: create ALL tables that existed in raw SQL migrations but were
-- never applied to staging and never modelled in Prisma schema.
--
-- After this, every table is in Prisma — prisma db push maintains them.
-- No more "relation does not exist" surprises.
--
-- auth.users FK constraints intentionally omitted (Passport users live in
-- public.app_users, not auth.users — CLAUDE.md §9).
-- RLS policies omitted (queries go through Prisma's pooler role which
-- bypasses RLS).
-- Idempotent: every CREATE uses IF NOT EXISTS.
-- ============================================================================

-- 1. compliance_templates
CREATE TABLE IF NOT EXISTS public.compliance_templates (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  category TEXT NOT NULL,
  requirement TEXT NOT NULL,
  description TEXT,
  compliance_type TEXT NOT NULL,
  entity_types TEXT[],
  industries TEXT[],
  industry_categories TEXT[],
  penalty TEXT,
  is_critical BOOLEAN DEFAULT FALSE,
  financial_year TEXT,
  due_date_offset INTEGER,
  due_month INTEGER,
  due_day INTEGER,
  due_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  updated_by UUID
);
CREATE INDEX IF NOT EXISTS idx_compliance_templates_category ON public.compliance_templates(category);

-- 2. company_financials
CREATE TABLE IF NOT EXISTS public.company_financials (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  turnover NUMERIC NULL,
  tax_due NUMERIC NULL,
  pf_contribution NUMERIC NULL,
  esi_contribution NUMERIC NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  UNIQUE(company_id, financial_year)
);

-- 3. requirement_status_history
CREATE TABLE IF NOT EXISTS public.requirement_status_history (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  requirement_id UUID NOT NULL REFERENCES public.regulatory_requirements(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_requirement_status_history_requirement_id ON public.requirement_status_history(requirement_id);

-- 4. countries
CREATE TABLE IF NOT EXISTS public.countries (
  code VARCHAR(2) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  region VARCHAR(50) NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  currency_symbol VARCHAR(10) NOT NULL,
  financial_year_start_month INT NOT NULL,
  financial_year_type VARCHAR(10) NOT NULL,
  date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
  timezone VARCHAR(50) DEFAULT 'UTC',
  tax_id_label VARCHAR(50) NOT NULL,
  registration_id_label VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. country_document_types
CREATE TABLE IF NOT EXISTS public.country_document_types (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  country_code VARCHAR(2) NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL,
  is_required BOOLEAN DEFAULT FALSE,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_code, document_type)
);

-- 6. country_entity_types
CREATE TABLE IF NOT EXISTS public.country_entity_types (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  country_code VARCHAR(2) NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  entity_type VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  requires_directors BOOLEAN DEFAULT TRUE,
  requires_shareholders BOOLEAN DEFAULT FALSE,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_code, entity_type)
);

-- 7. country_compliance_categories
CREATE TABLE IF NOT EXISTS public.country_compliance_categories (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  country_code VARCHAR(2) NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  category_name VARCHAR(100) NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_code, category_name)
);

-- 8. country_validation_rules
CREATE TABLE IF NOT EXISTS public.country_validation_rules (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  country_code VARCHAR(2) NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  field_type VARCHAR(50) NOT NULL,
  pattern VARCHAR(255),
  min_length INTEGER,
  max_length INTEGER,
  required BOOLEAN DEFAULT TRUE,
  validation_function TEXT,
  error_message TEXT,
  verification_portal_url TEXT,
  verification_instructions TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_code, field_type)
);
