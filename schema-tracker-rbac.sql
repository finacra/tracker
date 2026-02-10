-- ============================================
-- TRACKER MODULE & RBAC SCHEMA
-- ============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. USER ROLES TABLE
-- Stores user roles per company
-- Note: superadmin is a platform-level role (company_id can be NULL)
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, company_id),
  -- Superadmin must have NULL company_id (platform-level)
  CONSTRAINT superadmin_platform_only CHECK (
    (role = 'superadmin' AND company_id IS NULL) OR
    (role != 'superadmin' AND company_id IS NOT NULL)
  )
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_company_id ON public.user_roles(company_id);

-- ============================================
-- 2. REGULATORY REQUIREMENTS TABLE
-- Stores compliance requirements/tracker items
-- ============================================
CREATE TABLE IF NOT EXISTS public.regulatory_requirements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- 'Income Tax', 'GST', 'Payroll', 'RoC', 'Renewals', 'Others'
  requirement TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'upcoming', 'pending', 'overdue', 'completed')),
  due_date DATE NOT NULL,
  penalty TEXT, -- Description of penalty
  is_critical BOOLEAN DEFAULT FALSE,
  financial_year TEXT, -- e.g., 'FY 2025-26'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_regulatory_requirements_company_id ON public.regulatory_requirements(company_id);
CREATE INDEX IF NOT EXISTS idx_regulatory_requirements_status ON public.regulatory_requirements(status);
CREATE INDEX IF NOT EXISTS idx_regulatory_requirements_due_date ON public.regulatory_requirements(due_date);
CREATE INDEX IF NOT EXISTS idx_regulatory_requirements_category ON public.regulatory_requirements(category);

-- Unique constraint to prevent duplicate requirements from the same template
-- For template-based requirements: company_id + template_id + due_date + compliance_type must be unique
-- Note: We remove the WHERE clause because ON CONFLICT doesn't work with partial unique indexes
-- This is safe because template_id will always be NOT NULL for template-based requirements
DROP INDEX IF EXISTS idx_regulatory_requirements_unique_template;
CREATE UNIQUE INDEX idx_regulatory_requirements_unique_template 
  ON public.regulatory_requirements(company_id, template_id, due_date, compliance_type);

-- ============================================
-- 2.5. COMPLIANCE TEMPLATES TABLE
-- Stores compliance templates that auto-apply to matching companies
-- ============================================
CREATE TABLE IF NOT EXISTS public.compliance_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL, -- 'Income Tax', 'GST', 'Payroll', 'RoC', 'Renewals', 'Others'
  requirement TEXT NOT NULL,
  description TEXT,
  compliance_type TEXT NOT NULL CHECK (compliance_type IN ('one-time', 'monthly', 'quarterly', 'annual')),
  entity_types TEXT[], -- Array of entity types: ['Private Limited', 'Public Limited', 'LLP', etc.]
  industries TEXT[], -- Array of industries: ['IT & Technology Services', 'Healthcare', etc.]
  industry_categories TEXT[], -- Array of categories: ['Startups & MSMEs', 'Large Enterprises', etc.]
  penalty TEXT,
  is_critical BOOLEAN DEFAULT FALSE,
  financial_year TEXT, -- e.g., 'FY 2025-26' (optional, for one-time compliances)
  due_date_offset INTEGER, -- Days from start of period (e.g., 15 for 15th of month)
  due_month INTEGER, -- For annual: month (1-12)
  due_day INTEGER, -- For annual: day of month (1-31)
  due_date DATE, -- For one-time: specific due date
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Indexes for compliance_templates
CREATE INDEX IF NOT EXISTS idx_compliance_templates_category ON public.compliance_templates(category);
CREATE INDEX IF NOT EXISTS idx_compliance_templates_compliance_type ON public.compliance_templates(compliance_type);
CREATE INDEX IF NOT EXISTS idx_compliance_templates_is_active ON public.compliance_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_compliance_templates_entity_types ON public.compliance_templates USING GIN(entity_types);
CREATE INDEX IF NOT EXISTS idx_compliance_templates_industries ON public.compliance_templates USING GIN(industries);
CREATE INDEX IF NOT EXISTS idx_compliance_templates_industry_categories ON public.compliance_templates USING GIN(industry_categories);

-- Add new columns to regulatory_requirements for template support
ALTER TABLE public.regulatory_requirements
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.compliance_templates(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS compliance_type TEXT CHECK (compliance_type IN ('one-time', 'monthly', 'quarterly', 'annual')),
ADD COLUMN IF NOT EXISTS entity_type TEXT,
ADD COLUMN IF NOT EXISTS industry TEXT,
ADD COLUMN IF NOT EXISTS industry_category TEXT;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_regulatory_requirements_template_id ON public.regulatory_requirements(template_id);
CREATE INDEX IF NOT EXISTS idx_regulatory_requirements_compliance_type ON public.regulatory_requirements(compliance_type);
CREATE INDEX IF NOT EXISTS idx_regulatory_requirements_entity_type ON public.regulatory_requirements(entity_type);
CREATE INDEX IF NOT EXISTS idx_regulatory_requirements_industry ON public.regulatory_requirements(industry);
CREATE INDEX IF NOT EXISTS idx_regulatory_requirements_industry_category ON public.regulatory_requirements(industry_category);

-- ============================================
-- 3. REQUIREMENT STATUS HISTORY TABLE
-- Audit trail for status changes
-- ============================================
CREATE TABLE IF NOT EXISTS public.requirement_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requirement_id UUID NOT NULL REFERENCES public.regulatory_requirements(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Index
CREATE INDEX IF NOT EXISTS idx_requirement_status_history_requirement_id ON public.requirement_status_history(requirement_id);
CREATE INDEX IF NOT EXISTS idx_requirement_status_history_changed_at ON public.requirement_status_history(changed_at);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_status_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running the script)
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Superadmins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view roles for their companies" ON public.user_roles;
DROP POLICY IF EXISTS "Superadmins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles for their companies" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view requirements for their companies" ON public.regulatory_requirements;
DROP POLICY IF EXISTS "Superadmins can view all requirements" ON public.regulatory_requirements;
DROP POLICY IF EXISTS "Editors and Admins can insert requirements" ON public.regulatory_requirements;
DROP POLICY IF EXISTS "Superadmins can insert requirements" ON public.regulatory_requirements;
DROP POLICY IF EXISTS "Editors and Admins can update requirements" ON public.regulatory_requirements;
DROP POLICY IF EXISTS "Superadmins can update all requirements" ON public.regulatory_requirements;
DROP POLICY IF EXISTS "Admins can delete requirements" ON public.regulatory_requirements;
DROP POLICY IF EXISTS "Superadmins can delete all requirements" ON public.regulatory_requirements;
DROP POLICY IF EXISTS "Users can view status history" ON public.requirement_status_history;
DROP POLICY IF EXISTS "Superadmins can view all status history" ON public.requirement_status_history;
DROP POLICY IF EXISTS "Editors and Admins can insert history" ON public.requirement_status_history;
DROP POLICY IF EXISTS "Superadmins can insert history" ON public.requirement_status_history;

-- USER ROLES POLICIES
-- Users can view their own roles (including superadmin with NULL company_id)
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Superadmins can view all roles (platform-wide)
-- Uses helper function to avoid circular dependency
CREATE POLICY "Superadmins can view all roles"
  ON public.user_roles FOR SELECT
  USING (
    public.is_superadmin(auth.uid())
  );

-- Users can view roles for companies they have access to
-- Uses helper function to avoid circular dependency
CREATE POLICY "Users can view roles for their companies"
  ON public.user_roles FOR SELECT
  USING (
    company_id IS NOT NULL AND
    public.user_has_company_access(auth.uid(), company_id)
  );

-- Superadmins can manage all roles (platform-wide)
-- Uses helper function to avoid circular dependency
CREATE POLICY "Superadmins can manage all roles"
  ON public.user_roles FOR ALL
  USING (
    public.is_superadmin(auth.uid())
  );

-- Admins can manage roles for their companies
CREATE POLICY "Admins can manage roles for their companies"
  ON public.user_roles FOR ALL
  USING (
    company_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
      AND ur.company_id = user_roles.company_id
      AND ur.role = 'admin'
    )
  );

-- REGULATORY REQUIREMENTS POLICIES
-- Superadmins can view all requirements (platform-wide)
-- Uses helper function to avoid circular dependency
CREATE POLICY "Superadmins can view all requirements"
  ON public.regulatory_requirements FOR SELECT
  USING (
    public.is_superadmin(auth.uid())
  );

-- Users can view requirements for companies they have access to
CREATE POLICY "Users can view requirements for their companies"
  ON public.regulatory_requirements FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.user_roles
      WHERE user_id = auth.uid() AND company_id IS NOT NULL
    )
  );

-- Superadmins can insert requirements for any company
-- Uses helper function to avoid circular dependency
CREATE POLICY "Superadmins can insert requirements"
  ON public.regulatory_requirements FOR INSERT
  WITH CHECK (
    public.is_superadmin(auth.uid())
  );

-- Editors and Admins can insert requirements for their companies
CREATE POLICY "Editors and Admins can insert requirements"
  ON public.regulatory_requirements FOR INSERT
  WITH CHECK (
    company_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
      AND ur.company_id = regulatory_requirements.company_id
      AND ur.role IN ('admin', 'editor')
    )
  );

-- Superadmins can update all requirements
-- Uses helper function to avoid circular dependency
CREATE POLICY "Superadmins can update all requirements"
  ON public.regulatory_requirements FOR UPDATE
  USING (
    public.is_superadmin(auth.uid())
  );

-- Editors and Admins can update requirements for their companies
CREATE POLICY "Editors and Admins can update requirements"
  ON public.regulatory_requirements FOR UPDATE
  USING (
    company_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
      AND ur.company_id = regulatory_requirements.company_id
      AND ur.role IN ('admin', 'editor')
    )
  );

-- Superadmins can delete all requirements
-- Uses helper function to avoid circular dependency
CREATE POLICY "Superadmins can delete all requirements"
  ON public.regulatory_requirements FOR DELETE
  USING (
    public.is_superadmin(auth.uid())
  );

-- Admins can delete requirements for their companies
CREATE POLICY "Admins can delete requirements"
  ON public.regulatory_requirements FOR DELETE
  USING (
    company_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
      AND ur.company_id = regulatory_requirements.company_id
      AND ur.role = 'admin'
    )
  );

-- REQUIREMENT STATUS HISTORY POLICIES
-- Superadmins can view all history
-- Uses helper function to avoid circular dependency
CREATE POLICY "Superadmins can view all status history"
  ON public.requirement_status_history FOR SELECT
  USING (
    public.is_superadmin(auth.uid())
  );

-- Users can view history for requirements they can see
CREATE POLICY "Users can view status history"
  ON public.requirement_status_history FOR SELECT
  USING (
    requirement_id IN (
      SELECT id FROM public.regulatory_requirements
      WHERE company_id IN (
        SELECT company_id FROM public.user_roles
        WHERE user_id = auth.uid() AND company_id IS NOT NULL
      )
    )
  );

-- Superadmins can insert history for any requirement
-- Uses helper function to avoid circular dependency
CREATE POLICY "Superadmins can insert history"
  ON public.requirement_status_history FOR INSERT
  WITH CHECK (
    public.is_superadmin(auth.uid())
  );

-- Editors and Admins can insert history for their companies
CREATE POLICY "Editors and Admins can insert history"
  ON public.requirement_status_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.regulatory_requirements rr
      JOIN public.user_roles ur ON ur.company_id = rr.company_id
      WHERE rr.id = requirement_status_history.requirement_id
      AND ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'editor')
      AND ur.company_id IS NOT NULL
    )
  );

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Drop existing triggers if they exist (for re-running the script)
DROP TRIGGER IF EXISTS update_user_roles_updated_at ON public.user_roles;
DROP TRIGGER IF EXISTS update_regulatory_requirements_updated_at ON public.regulatory_requirements;
DROP TRIGGER IF EXISTS log_requirement_status_change ON public.regulatory_requirements;
DROP TRIGGER IF EXISTS update_compliance_templates_updated_at ON public.compliance_templates;

-- Function to automatically set updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_user_roles_updated_at ON public.user_roles;
CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_regulatory_requirements_updated_at ON public.regulatory_requirements;
CREATE TRIGGER update_regulatory_requirements_updated_at
  BEFORE UPDATE ON public.regulatory_requirements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to automatically create status history entry
CREATE OR REPLACE FUNCTION public.log_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.requirement_status_history (
      requirement_id,
      old_status,
      new_status,
      changed_by
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      NEW.updated_by
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for status history
DROP TRIGGER IF EXISTS log_requirement_status_change ON public.regulatory_requirements;
CREATE TRIGGER log_requirement_status_change
  AFTER UPDATE ON public.regulatory_requirements
  FOR EACH ROW
  EXECUTE FUNCTION public.log_status_change();

-- Trigger for compliance_templates updated_at
DROP TRIGGER IF EXISTS update_compliance_templates_updated_at ON public.compliance_templates;
CREATE TRIGGER update_compliance_templates_updated_at
  BEFORE UPDATE ON public.compliance_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- HELPER FUNCTION: Get user role for company
-- Returns 'superadmin' if user is platform superadmin
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id UUID, p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
  v_is_superadmin BOOLEAN;
BEGIN
  -- Check if user is superadmin (platform-level)
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id 
    AND role = 'superadmin' 
    AND company_id IS NULL
  ) INTO v_is_superadmin;
  
  IF v_is_superadmin THEN
    RETURN 'superadmin';
  END IF;
  
  -- Get company-specific role
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = p_user_id AND company_id = p_company_id;
  
  RETURN COALESCE(v_role, 'viewer');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER FUNCTION: Check if user is superadmin
-- Uses SECURITY DEFINER to bypass RLS for this check
-- ============================================
CREATE OR REPLACE FUNCTION public.is_superadmin(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id 
    AND role = 'superadmin' 
    AND company_id IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER FUNCTION: Check if user has access to a company
-- Uses SECURITY DEFINER to bypass RLS and avoid recursion
-- ============================================
CREATE OR REPLACE FUNCTION public.user_has_company_access(p_user_id UUID, p_company_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id 
    AND company_id = p_company_id
    AND company_id IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER FUNCTION: Get user roles (bypasses RLS for own roles)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_roles_for_check(p_user_id UUID)
RETURNS TABLE(role TEXT, company_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT ur.role::TEXT, ur.company_id
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- INITIAL DATA: Set company owners as admins
-- ============================================
-- This will set existing company owners as 'admin' role
INSERT INTO public.user_roles (user_id, company_id, role)
SELECT user_id, id, 'admin'
FROM public.companies
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = companies.user_id AND ur.company_id = companies.id
)
ON CONFLICT (user_id, company_id) DO NOTHING;

-- ============================================
-- HELPER FUNCTION: Create superadmin (ensures company_id is NULL)
-- ============================================
CREATE OR REPLACE FUNCTION public.create_superadmin(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_role_id UUID;
BEGIN
  -- Delete any existing superadmin role for this user (in case it was created incorrectly)
  DELETE FROM public.user_roles 
  WHERE user_id = p_user_id AND role = 'superadmin';
  
  -- Insert new superadmin role with company_id = NULL
  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (p_user_id, NULL, 'superadmin')
  RETURNING id INTO v_role_id;
  
  RETURN v_role_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- CLEANUP FUNCTION: Fix any incorrectly created superadmin roles
-- This will delete any superadmin roles that have a company_id
-- ============================================
CREATE OR REPLACE FUNCTION public.cleanup_invalid_superadmins()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Delete any superadmin roles that have a company_id (violates constraint)
  DELETE FROM public.user_roles
  WHERE role = 'superadmin' AND company_id IS NOT NULL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run cleanup to fix any existing invalid records
SELECT public.cleanup_invalid_superadmins();

-- ============================================
-- HELPER FUNCTION: Match companies to template
-- Returns company IDs that match template criteria
-- ============================================
CREATE OR REPLACE FUNCTION public.match_companies_to_template(p_template_id UUID)
RETURNS TABLE(company_id UUID) AS $$
DECLARE
  v_template RECORD;
BEGIN
  -- Get template details
  SELECT 
    entity_types,
    industries,
    industry_categories,
    is_active
  INTO v_template
  FROM public.compliance_templates
  WHERE id = p_template_id;

  -- Return empty if template not found or inactive
  IF NOT FOUND OR NOT v_template.is_active THEN
    RETURN;
  END IF;

  -- Match companies based on criteria
  -- If template specifies criteria, company must match. If template doesn't specify, match all.
  -- Use case-insensitive matching for entity types and industries
  -- Also handles short company types from onboarding ("private", "llp", "ngo", "partnership", "sole")
  RETURN QUERY
  SELECT c.id
  FROM public.companies c
  WHERE 
    -- Entity type match: if template has entity types specified, company type must match
    (
      v_template.entity_types IS NULL 
      OR array_length(v_template.entity_types, 1) IS NULL 
      OR (c.type IS NOT NULL AND (
        -- Direct case-insensitive match
        LOWER(TRIM(c.type)) = ANY(SELECT LOWER(TRIM(unnest(v_template.entity_types))))
        
        -- Handle short "private" value matching "Private Limited Company" templates
        OR (LOWER(TRIM(c.type)) = 'private' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%private%limited%' OR LOWER(t) LIKE '%private%company%'
        ))
        
        -- Handle short "partnership" value matching "Partnership Firm" templates
        OR (LOWER(TRIM(c.type)) = 'partnership' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%partnership%'
        ))
        
        -- Handle short "llp" value matching "LLP" or "Limited Liability Partnership" templates
        OR (LOWER(TRIM(c.type)) = 'llp' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%llp%' OR LOWER(t) LIKE '%limited liability partnership%'
        ))
        
        -- Handle short "ngo" value matching "NGO / Section 8", "Trust / Society / Sec 8" templates
        OR (LOWER(TRIM(c.type)) = 'ngo' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%ngo%' OR LOWER(t) LIKE '%section%8%' OR LOWER(t) LIKE '%society%' OR LOWER(t) LIKE '%trust%'
        ))
        
        -- Handle short "sole" value matching "Sole Proprietorship" templates
        OR (LOWER(TRIM(c.type)) = 'sole' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%sole%' OR LOWER(t) LIKE '%proprietor%'
        ))
        
        -- Handle full "private limited" company type
        OR (LOWER(c.type) LIKE '%private%' AND LOWER(c.type) LIKE '%limited%' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%private%' AND LOWER(t) LIKE '%limited%'
        ))
        
        -- Handle full "public limited" company type
        OR (LOWER(c.type) LIKE '%public%' AND LOWER(c.type) LIKE '%limited%' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%public%' AND LOWER(t) LIKE '%limited%'
        ))
        
        -- Handle "ngo" variations (full form)
        OR (LOWER(c.type) LIKE '%ngo%' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%ngo%' OR LOWER(t) LIKE '%section%'
        ))
        OR (LOWER(c.type) LIKE '%section%' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%section%' OR LOWER(t) LIKE '%ngo%'
        ))
        
        -- Handle "llp" variations (full form)
        OR (LOWER(c.type) LIKE '%llp%' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%llp%'
        ))
      ))
    )
    AND
    -- Industry match: if template has industries specified, company industries must overlap (case-insensitive)
    (
      v_template.industries IS NULL 
      OR array_length(v_template.industries, 1) IS NULL 
      OR (
        -- Check new industries array column first
        (c.industries IS NOT NULL AND array_length(c.industries, 1) > 0 AND
         EXISTS (
           SELECT 1 FROM unnest(c.industries) AS company_industry
           WHERE LOWER(TRIM(company_industry)) = ANY(
             SELECT LOWER(TRIM(unnest(v_template.industries)))
           )
         ))
        -- Fallback to legacy industry column for backward compatibility
      OR (c.industry IS NOT NULL AND LOWER(TRIM(c.industry)) = ANY(
        SELECT LOWER(TRIM(unnest(v_template.industries)))
      ))
      )
    )
    AND
    -- Industry category match: if template has categories specified, company categories must overlap (case-insensitive)
    (
      v_template.industry_categories IS NULL 
      OR array_length(v_template.industry_categories, 1) IS NULL 
      OR (c.industry_categories IS NOT NULL 
          AND array_length(c.industry_categories, 1) IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM unnest(c.industry_categories) AS company_cat
            WHERE LOWER(TRIM(company_cat)) = ANY(
              SELECT LOWER(TRIM(unnest(v_template.industry_categories)))
            )
          ))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER FUNCTION: Calculate due date based on compliance type
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_due_date(
  p_compliance_type TEXT,
  p_due_date DATE DEFAULT NULL,
  p_due_date_offset INTEGER DEFAULT NULL,
  p_due_month INTEGER DEFAULT NULL,
  p_due_day INTEGER DEFAULT NULL,
  p_financial_year TEXT DEFAULT NULL,
  p_base_date DATE DEFAULT CURRENT_DATE,
  p_year_type TEXT DEFAULT 'FY'  -- NEW: 'FY' (Financial Year) or 'CY' (Calendar Year)
)
RETURNS DATE AS $$
DECLARE
  v_due_date DATE;
  v_fy_start DATE;
  v_fy_end DATE;
  v_year INTEGER;
  v_month INTEGER;
  v_day INTEGER;
  v_quarter_start_month INTEGER;
  v_year_type TEXT;
BEGIN
  -- Normalize year_type: default to 'FY' if NULL or invalid
  v_year_type := COALESCE(NULLIF(p_year_type, ''), 'FY');
  IF v_year_type NOT IN ('FY', 'CY') THEN
    v_year_type := 'FY';
  END IF;
  CASE p_compliance_type
    WHEN 'one-time' THEN
      -- Use provided due_date directly
      RETURN COALESCE(p_due_date, p_base_date);
    
    WHEN 'monthly' THEN
      -- Calculate based on offset (e.g., 15th of current month)
      IF p_due_date_offset IS NULL THEN
        RETURN p_base_date;
      END IF;
      -- Get first day of current month, add offset
      v_due_date := DATE_TRUNC('month', p_base_date)::DATE + (p_due_date_offset - 1);
      -- If date has passed this month, move to next month
      IF v_due_date < p_base_date THEN
        v_due_date := v_due_date + INTERVAL '1 month';
      END IF;
      RETURN v_due_date;
    
    WHEN 'quarterly' THEN
      -- Calculate based on quarter, month in quarter, and day
      -- Supports both Financial Year (FY) and Calendar Year (CY)
      -- FY: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
      -- CY: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
      IF p_due_month IS NOT NULL AND p_due_day IS NOT NULL THEN
        v_month := EXTRACT(MONTH FROM p_base_date)::INTEGER;
        v_year := EXTRACT(YEAR FROM p_base_date)::INTEGER;
        
        -- Determine quarter start month based on year_type
        IF v_year_type = 'FY' THEN
          -- Financial Year (India): Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
          IF v_month >= 4 AND v_month <= 6 THEN
            v_quarter_start_month := 4;  -- Q1 starts in April
          ELSIF v_month >= 7 AND v_month <= 9 THEN
            v_quarter_start_month := 7;  -- Q2 starts in July
          ELSIF v_month >= 10 AND v_month <= 12 THEN
            v_quarter_start_month := 10;  -- Q3 starts in October
          ELSE
            v_quarter_start_month := 1;  -- Q4 starts in January
          END IF;
        ELSE
          -- Calendar Year (Gulf/USA): Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
        IF v_month <= 3 THEN
            v_quarter_start_month := 1;  -- Q1 starts in January
        ELSIF v_month <= 6 THEN
            v_quarter_start_month := 4;  -- Q2 starts in April
        ELSIF v_month <= 9 THEN
            v_quarter_start_month := 7;  -- Q3 starts in July
        ELSE
            v_quarter_start_month := 10;  -- Q4 starts in October
        END IF;
        END IF;
        
        -- Calculate quarter start date
        v_fy_start := MAKE_DATE(v_year, v_quarter_start_month, 1);
        
        -- Calculate date: quarter start + (month_in_quarter - 1) months + (day - 1) days
        v_due_date := v_fy_start + (p_due_month - 1) * INTERVAL '1 month' + (p_due_day - 1) * INTERVAL '1 day';
        
        -- If date has passed this quarter, move to next quarter
        IF v_due_date < p_base_date THEN
          v_due_date := v_due_date + INTERVAL '3 months';
        END IF;
        RETURN v_due_date;
      ELSIF p_due_date_offset IS NOT NULL THEN
        -- Fallback to offset-based calculation (legacy support)
        v_month := EXTRACT(MONTH FROM p_base_date)::INTEGER;
        v_year := EXTRACT(YEAR FROM p_base_date)::INTEGER;
        
        -- Determine quarter start month based on year_type
        IF v_year_type = 'FY' THEN
          IF v_month >= 4 AND v_month <= 6 THEN
            v_quarter_start_month := 4;
          ELSIF v_month >= 7 AND v_month <= 9 THEN
            v_quarter_start_month := 7;
          ELSIF v_month >= 10 AND v_month <= 12 THEN
            v_quarter_start_month := 10;
          ELSE
            v_quarter_start_month := 1;
          END IF;
        ELSE
        IF v_month <= 3 THEN
            v_quarter_start_month := 1;
        ELSIF v_month <= 6 THEN
            v_quarter_start_month := 4;
        ELSIF v_month <= 9 THEN
            v_quarter_start_month := 7;
        ELSE
            v_quarter_start_month := 10;
        END IF;
        END IF;
        
        v_fy_start := MAKE_DATE(v_year, v_quarter_start_month, 1);
        v_due_date := v_fy_start + (p_due_date_offset - 1);
        
        -- If date has passed this quarter, move to next quarter
        IF v_due_date < p_base_date THEN
          v_due_date := v_due_date + INTERVAL '3 months';
        END IF;
        RETURN v_due_date;
      ELSE
        RETURN p_base_date;
      END IF;
    
    WHEN 'annual' THEN
      -- Calculate based on month and day
      IF p_due_month IS NULL OR p_due_day IS NULL THEN
        RETURN p_base_date;
      END IF;
      v_year := EXTRACT(YEAR FROM p_base_date)::INTEGER;
      -- Try to create date with specified month and day
      BEGIN
        v_due_date := MAKE_DATE(v_year, p_due_month, p_due_day);
      EXCEPTION WHEN OTHERS THEN
        -- Handle invalid dates (e.g., Feb 30) by using last day of month
        v_due_date := (DATE_TRUNC('month', MAKE_DATE(v_year, p_due_month, 1)) + INTERVAL '1 month - 1 day')::DATE;
      END;
      -- If date has passed this year, move to next year
      IF v_due_date < p_base_date THEN
        v_year := v_year + 1;
        BEGIN
          v_due_date := MAKE_DATE(v_year, p_due_month, p_due_day);
        EXCEPTION WHEN OTHERS THEN
          v_due_date := (DATE_TRUNC('month', MAKE_DATE(v_year, p_due_month, 1)) + INTERVAL '1 month - 1 day')::DATE;
        END;
      END IF;
      RETURN v_due_date;
    
    ELSE
      RETURN p_base_date;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- HELPER FUNCTION: Apply template to matching companies
-- Creates regulatory_requirements for all matching companies
-- ============================================
CREATE OR REPLACE FUNCTION public.apply_template_to_companies(p_template_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_template RECORD;
  v_company_id UUID;
  v_due_date DATE;
  v_count INTEGER := 0;
  v_user_id UUID;
  v_company_type TEXT;
  v_company_industry TEXT;
  v_company_category TEXT;
  v_company_year_type TEXT;
  v_year_type TEXT;  -- Final year_type to use: template > company > 'FY'
  v_fy_year INTEGER;
  v_fy_start_month INTEGER := 4; -- April (Indian FY starts in April)
  v_due_month INTEGER;
  v_due_year INTEGER;
  v_i INTEGER;
BEGIN
  -- Get template details
  SELECT 
    category,
    requirement,
    description,
    compliance_type,
    penalty,
    is_critical,
    financial_year,
    due_date,
    due_date_offset,
    due_month,
    due_day,
    created_by,
    year_type
  INTO v_template
  FROM public.compliance_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Get user who created/updated template
  v_user_id := COALESCE(v_template.created_by, auth.uid());

  RAISE NOTICE 'apply_template_to_companies: Template %, User %, Compliance Type: %', p_template_id, v_user_id, v_template.compliance_type;

  -- Loop through matching companies
  FOR v_company_id IN 
    SELECT company_id FROM public.match_companies_to_template(p_template_id)
  LOOP
    RAISE NOTICE 'apply_template_to_companies: Processing company %', v_company_id;
    -- Get company details for metadata and year_type
    SELECT type, industry, industry_categories[1], COALESCE(year_type, 'FY')
    INTO v_company_type, v_company_industry, v_company_category, v_company_year_type
    FROM public.companies
    WHERE id = v_company_id;
    
    -- Determine year_type: template > company > 'FY'
    v_year_type := COALESCE(v_template.year_type, v_company_year_type, 'FY');

    -- Handle different compliance types
    IF v_template.compliance_type = 'monthly' THEN
      -- Create requirements for all months (12 months back + 12 months forward = 24 months)
      FOR v_i IN -12..12 LOOP
        v_due_date := public.calculate_due_date(
          v_template.compliance_type,
          v_template.due_date,
          v_template.due_date_offset,
          v_template.due_month,
          v_template.due_day,
          v_template.financial_year,
          (CURRENT_DATE + (v_i || ' months')::INTERVAL)::DATE,
          v_year_type
        );

        -- Calculate financial year for this due date
        v_due_month := EXTRACT(MONTH FROM v_due_date)::INTEGER;
        v_due_year := EXTRACT(YEAR FROM v_due_date)::INTEGER;
        
        IF v_due_month >= v_fy_start_month THEN
          v_fy_year := v_due_year;
        ELSE
          v_fy_year := v_due_year - 1;
        END IF;
        
        INSERT INTO public.regulatory_requirements (
          company_id,
          template_id,
          category,
          requirement,
          description,
          compliance_type,
          entity_type,
          industry,
          industry_category,
          status,
          due_date,
          penalty,
          is_critical,
          financial_year,
          year_type,
          created_by,
          updated_by
        ) VALUES (
          v_company_id,
          p_template_id,
          v_template.category,
          v_template.requirement,
          v_template.description,
          v_template.compliance_type,
          v_company_type,
          v_company_industry,
          v_company_category,
          'not_started',
          v_due_date,
          v_template.penalty,
          v_template.is_critical,
          'FY ' || v_fy_year || '-' || SUBSTRING((v_fy_year + 1)::TEXT, 3, 2),
          v_year_type,
          v_user_id,
          v_user_id
        )
        ON CONFLICT (company_id, template_id, due_date, compliance_type) 
        DO UPDATE SET
          updated_at = NOW(),
          updated_by = v_user_id;
        
        v_count := v_count + 1;
      END LOOP;
      
    ELSIF v_template.compliance_type = 'quarterly' THEN
      -- Create requirements for all quarters (4 quarters back + 4 quarters forward = 8 quarters)
      FOR v_i IN -4..4 LOOP
        v_due_date := public.calculate_due_date(
          v_template.compliance_type,
          v_template.due_date,
          v_template.due_date_offset,
          v_template.due_month,
          v_template.due_day,
          v_template.financial_year,
          (CURRENT_DATE + (v_i * 3 || ' months')::INTERVAL)::DATE,
          v_year_type
        );

        -- Calculate financial year for this due date
        v_due_month := EXTRACT(MONTH FROM v_due_date)::INTEGER;
        v_due_year := EXTRACT(YEAR FROM v_due_date)::INTEGER;
        
        IF v_due_month >= v_fy_start_month THEN
          v_fy_year := v_due_year;
        ELSE
          v_fy_year := v_due_year - 1;
        END IF;
        
        INSERT INTO public.regulatory_requirements (
          company_id,
          template_id,
          category,
          requirement,
          description,
          compliance_type,
          entity_type,
          industry,
          industry_category,
          status,
          due_date,
          penalty,
          is_critical,
          financial_year,
          year_type,
          created_by,
          updated_by
        ) VALUES (
          v_company_id,
          p_template_id,
          v_template.category,
          v_template.requirement,
          v_template.description,
          v_template.compliance_type,
          v_company_type,
          v_company_industry,
          v_company_category,
          'not_started',
          v_due_date,
          v_template.penalty,
          v_template.is_critical,
          'FY ' || v_fy_year || '-' || SUBSTRING((v_fy_year + 1)::TEXT, 3, 2),
          v_year_type,
          v_user_id,
          v_user_id
        )
        ON CONFLICT (company_id, template_id, due_date, compliance_type) 
        DO UPDATE SET
          updated_at = NOW(),
          updated_by = v_user_id;
        
        v_count := v_count + 1;
      END LOOP;
      
    ELSIF v_template.compliance_type = 'annual' THEN
      -- Create requirements for current year and next year
      FOR v_i IN 0..1 LOOP
        v_due_date := public.calculate_due_date(
          v_template.compliance_type,
          v_template.due_date,
          v_template.due_date_offset,
          v_template.due_month,
          v_template.due_day,
          v_template.financial_year,
          (CURRENT_DATE + (v_i || ' years')::INTERVAL)::DATE,
          v_year_type
        );

        -- Calculate financial year for this due date
        v_due_month := EXTRACT(MONTH FROM v_due_date)::INTEGER;
        v_due_year := EXTRACT(YEAR FROM v_due_date)::INTEGER;
        
        IF v_due_month >= v_fy_start_month THEN
          v_fy_year := v_due_year;
        ELSE
          v_fy_year := v_due_year - 1;
        END IF;
        
        INSERT INTO public.regulatory_requirements (
          company_id,
          template_id,
          category,
          requirement,
          description,
          compliance_type,
          entity_type,
          industry,
          industry_category,
          status,
          due_date,
          penalty,
          is_critical,
          financial_year,
          year_type,
          created_by,
          updated_by
        ) VALUES (
          v_company_id,
          p_template_id,
          v_template.category,
          v_template.requirement,
          v_template.description,
          v_template.compliance_type,
          v_company_type,
          v_company_industry,
          v_company_category,
          'not_started',
          v_due_date,
          v_template.penalty,
          v_template.is_critical,
          'FY ' || v_fy_year || '-' || SUBSTRING((v_fy_year + 1)::TEXT, 3, 2),
          v_year_type,
          v_user_id,
          v_user_id
        )
        ON CONFLICT (company_id, template_id, due_date, compliance_type) 
        DO UPDATE SET
          updated_at = NOW(),
          updated_by = v_user_id;
        
        v_count := v_count + 1;
      END LOOP;
      
    ELSE
      -- One-time compliance: create single requirement
      v_due_date := public.calculate_due_date(
        v_template.compliance_type,
        v_template.due_date,
        v_template.due_date_offset,
        v_template.due_month,
        v_template.due_day,
        v_template.financial_year,
        CURRENT_DATE,
        v_year_type
      );

      INSERT INTO public.regulatory_requirements (
        company_id,
        template_id,
        category,
        requirement,
        description,
        compliance_type,
        entity_type,
        industry,
        industry_category,
        status,
        due_date,
        penalty,
        is_critical,
        financial_year,
        year_type,
        created_by,
        updated_by
      ) VALUES (
        v_company_id,
        p_template_id,
        v_template.category,
        v_template.requirement,
        v_template.description,
        v_template.compliance_type,
        v_company_type,
        v_company_industry,
        v_company_category,
        'not_started',
        v_due_date,
        v_template.penalty,
        v_template.is_critical,
        v_template.financial_year,
        v_year_type,
        v_user_id,
        v_user_id
      )
      ON CONFLICT (company_id, template_id, due_date, compliance_type) 
      DO UPDATE SET
        updated_at = NOW(),
        updated_by = v_user_id;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'apply_template_to_companies: Created/updated % requirements for template %', v_count, p_template_id;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- NOTE: To create a superadmin, use one of these methods:
-- 
-- Method 1 (Recommended - uses helper function):
-- SELECT public.create_superadmin('user-uuid-here');
--
-- Method 2 (Manual - MUST set company_id to NULL):
-- INSERT INTO public.user_roles (user_id, company_id, role)
-- VALUES ('user-uuid-here', NULL, 'superadmin');
--
-- IMPORTANT: company_id MUST be NULL for superadmin roles!
-- The constraint superadmin_platform_only enforces this.
-- ============================================
