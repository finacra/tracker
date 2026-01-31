-- ============================================
-- TRACKER FRAMEWORK V2 SCHEMA MIGRATION
-- Adds: penalty_config, required_documents, period metadata,
--       company_financials, company_notifications, filed_on/by fields
-- ============================================

-- ============================================
-- 1. EXTEND compliance_templates TABLE
-- ============================================
ALTER TABLE public.compliance_templates
ADD COLUMN IF NOT EXISTS required_documents TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS possible_legal_action TEXT NULL,
ADD COLUMN IF NOT EXISTS penalty_config JSONB NULL;

COMMENT ON COLUMN public.compliance_templates.required_documents IS 'Array of document types required for this compliance (e.g., [''GSTR-3B'', ''Payment Challan''])';
COMMENT ON COLUMN public.compliance_templates.possible_legal_action IS 'Description of legal consequences for non-compliance';
COMMENT ON COLUMN public.compliance_templates.penalty_config IS 'Structured penalty config: {type: daily|flat|interest|percentage|composite, rate: number, cap?: number, base?: string}';

-- ============================================
-- 2. EXTEND regulatory_requirements TABLE
-- ============================================
ALTER TABLE public.regulatory_requirements
ADD COLUMN IF NOT EXISTS filed_on DATE NULL,
ADD COLUMN IF NOT EXISTS filed_by UUID NULL REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS status_reason TEXT NULL,
ADD COLUMN IF NOT EXISTS possible_legal_action TEXT NULL,
ADD COLUMN IF NOT EXISTS penalty_config JSONB NULL,
ADD COLUMN IF NOT EXISTS penalty_base_amount NUMERIC NULL,
ADD COLUMN IF NOT EXISTS required_documents TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.regulatory_requirements.filed_on IS 'Date when the compliance was actually filed/completed';
COMMENT ON COLUMN public.regulatory_requirements.filed_by IS 'User who marked the compliance as completed';
COMMENT ON COLUMN public.regulatory_requirements.status_reason IS 'Reason for current status (e.g., "Missing docs: Form X, Y")';
COMMENT ON COLUMN public.regulatory_requirements.possible_legal_action IS 'Legal consequences for this specific requirement (can override template)';
COMMENT ON COLUMN public.regulatory_requirements.penalty_config IS 'Penalty config (inherits from template if NULL)';
COMMENT ON COLUMN public.regulatory_requirements.penalty_base_amount IS 'Override base amount for interest/percentage penalties (e.g., tax due, turnover)';
COMMENT ON COLUMN public.regulatory_requirements.required_documents IS 'Required documents (inherits from template if empty)';

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_regulatory_requirements_filed_on ON public.regulatory_requirements(filed_on);
CREATE INDEX IF NOT EXISTS idx_regulatory_requirements_filed_by ON public.regulatory_requirements(filed_by);

-- ============================================
-- 3. CREATE company_financials TABLE
-- For storing turnover, tax due, etc. per FY
-- ============================================
CREATE TABLE IF NOT EXISTS public.company_financials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL, -- e.g., 'FY 2024-25'
  turnover NUMERIC NULL, -- Annual turnover
  tax_due NUMERIC NULL, -- Tax liability amount
  pf_contribution NUMERIC NULL, -- Monthly PF contribution
  esi_contribution NUMERIC NULL, -- Monthly ESI contribution
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(company_id, financial_year)
);

COMMENT ON TABLE public.company_financials IS 'Company financial data per FY for penalty calculations';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_company_financials_company_id ON public.company_financials(company_id);
CREATE INDEX IF NOT EXISTS idx_company_financials_fy ON public.company_financials(financial_year);

-- Enable RLS
ALTER TABLE public.company_financials ENABLE ROW LEVEL SECURITY;

-- RLS Policies for company_financials
DROP POLICY IF EXISTS "Users can view financials for their companies" ON public.company_financials;
CREATE POLICY "Users can view financials for their companies"
  ON public.company_financials FOR SELECT
  USING (
    company_id IN (
      SELECT ur.company_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.company_id IS NOT NULL
    )
    OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can manage financials for their companies" ON public.company_financials;
CREATE POLICY "Admins can manage financials for their companies"
  ON public.company_financials FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
      AND ur.company_id = company_financials.company_id
      AND ur.role IN ('admin', 'editor')
    )
    OR public.is_superadmin(auth.uid())
  );

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_company_financials_updated_at ON public.company_financials;
CREATE TRIGGER update_company_financials_updated_at
  BEFORE UPDATE ON public.company_financials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 4. EXTEND company_documents_internal TABLE
-- Add period metadata for per-period document matching
-- ============================================
ALTER TABLE internal.company_documents_internal
ADD COLUMN IF NOT EXISTS period_type TEXT NULL CHECK (period_type IN ('one-time', 'monthly', 'quarterly', 'annual')),
ADD COLUMN IF NOT EXISTS period_financial_year TEXT NULL,
ADD COLUMN IF NOT EXISTS period_key TEXT NULL,
ADD COLUMN IF NOT EXISTS period_start DATE NULL,
ADD COLUMN IF NOT EXISTS period_end DATE NULL,
ADD COLUMN IF NOT EXISTS requirement_id UUID NULL;

COMMENT ON COLUMN internal.company_documents_internal.period_type IS 'Type of period: one-time, monthly, quarterly, annual';
COMMENT ON COLUMN internal.company_documents_internal.period_financial_year IS 'Financial year this document belongs to (e.g., FY 2024-25)';
COMMENT ON COLUMN internal.company_documents_internal.period_key IS 'Period identifier (e.g., 2025-03 for March 2025, Q4-2024-25 for Q4)';
COMMENT ON COLUMN internal.company_documents_internal.period_start IS 'Start date of the period this document covers';
COMMENT ON COLUMN internal.company_documents_internal.period_end IS 'End date of the period this document covers';
COMMENT ON COLUMN internal.company_documents_internal.requirement_id IS 'Link to regulatory_requirements if uploaded from tracker';

-- Indexes for period matching
CREATE INDEX IF NOT EXISTS idx_company_documents_period_type ON internal.company_documents_internal(period_type);
CREATE INDEX IF NOT EXISTS idx_company_documents_period_key ON internal.company_documents_internal(period_key);
CREATE INDEX IF NOT EXISTS idx_company_documents_period_fy ON internal.company_documents_internal(period_financial_year);
CREATE INDEX IF NOT EXISTS idx_company_documents_requirement_id ON internal.company_documents_internal(requirement_id);
CREATE INDEX IF NOT EXISTS idx_company_documents_doc_type_period ON internal.company_documents_internal(document_type, period_key);

-- ============================================
-- 5. CREATE company_notifications TABLE
-- For bell icon notifications
-- ============================================
CREATE TABLE IF NOT EXISTS public.company_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Target user
  type TEXT NOT NULL CHECK (type IN ('status_change', 'missing_docs', 'upcoming_deadline', 'overdue', 'document_uploaded', 'team_update')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  requirement_id UUID NULL REFERENCES public.regulatory_requirements(id) ON DELETE SET NULL,
  document_id UUID NULL, -- Reference to company_documents_internal if applicable
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB NULL -- Additional data (e.g., missing doc list, old/new status)
);

COMMENT ON TABLE public.company_notifications IS 'Notifications for company admins about compliance status changes, missing docs, etc.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_company_notifications_user_id ON public.company_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_company_notifications_company_id ON public.company_notifications(company_id);
CREATE INDEX IF NOT EXISTS idx_company_notifications_is_read ON public.company_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_company_notifications_created_at ON public.company_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_notifications_user_unread ON public.company_notifications(user_id, is_read) WHERE is_read = FALSE;

-- Enable RLS
ALTER TABLE public.company_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for company_notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.company_notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.company_notifications FOR SELECT
  USING (user_id = auth.uid() OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.company_notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.company_notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "System can insert notifications" ON public.company_notifications;
CREATE POLICY "System can insert notifications"
  ON public.company_notifications FOR INSERT
  WITH CHECK (TRUE); -- Allow inserts from server actions (admin client bypasses RLS anyway)

-- ============================================
-- 6. HELPER FUNCTION: Get company admins
-- Returns user IDs of all admins for a company
-- ============================================
CREATE OR REPLACE FUNCTION public.get_company_admin_user_ids(p_company_id UUID)
RETURNS UUID[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT user_id 
    FROM public.user_roles 
    WHERE company_id = p_company_id 
    AND role IN ('admin', 'superadmin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. HELPER FUNCTION: Calculate period key from date
-- Returns period key based on compliance type and date
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_period_key(
  p_compliance_type TEXT,
  p_date DATE
)
RETURNS TEXT AS $$
DECLARE
  v_year INTEGER;
  v_month INTEGER;
  v_quarter INTEGER;
  v_fy_year INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM p_date)::INTEGER;
  v_month := EXTRACT(MONTH FROM p_date)::INTEGER;
  
  -- Calculate FY year (April start)
  IF v_month >= 4 THEN
    v_fy_year := v_year;
  ELSE
    v_fy_year := v_year - 1;
  END IF;

  CASE p_compliance_type
    WHEN 'monthly' THEN
      RETURN TO_CHAR(p_date, 'YYYY-MM');
    
    WHEN 'quarterly' THEN
      -- Q1: Apr-Jun, Q2: Jul-Sep, Q3: Oct-Dec, Q4: Jan-Mar
      IF v_month >= 4 AND v_month <= 6 THEN
        v_quarter := 1;
      ELSIF v_month >= 7 AND v_month <= 9 THEN
        v_quarter := 2;
      ELSIF v_month >= 10 AND v_month <= 12 THEN
        v_quarter := 3;
      ELSE
        v_quarter := 4;
      END IF;
      RETURN 'Q' || v_quarter || '-' || v_fy_year || '-' || SUBSTRING((v_fy_year + 1)::TEXT, 3, 2);
    
    WHEN 'annual' THEN
      RETURN 'FY-' || v_fy_year || '-' || SUBSTRING((v_fy_year + 1)::TEXT, 3, 2);
    
    ELSE
      -- one-time: use the date itself
      RETURN TO_CHAR(p_date, 'YYYY-MM-DD');
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- 8. HELPER FUNCTION: Calculate financial year from date
-- ============================================
CREATE OR REPLACE FUNCTION public.get_financial_year(p_date DATE)
RETURNS TEXT AS $$
DECLARE
  v_year INTEGER;
  v_month INTEGER;
  v_fy_year INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM p_date)::INTEGER;
  v_month := EXTRACT(MONTH FROM p_date)::INTEGER;
  
  IF v_month >= 4 THEN
    v_fy_year := v_year;
  ELSE
    v_fy_year := v_year - 1;
  END IF;
  
  RETURN 'FY ' || v_fy_year || '-' || SUBSTRING((v_fy_year + 1)::TEXT, 3, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- 9. UPDATE apply_template_to_companies
-- Now also copies required_documents and penalty_config
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
  v_fy_year INTEGER;
  v_fy_start_month INTEGER := 4; -- April (Indian FY starts in April)
  v_due_month INTEGER;
  v_due_year INTEGER;
  v_i INTEGER;
BEGIN
  -- Get template details (including new fields)
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
    required_documents,
    possible_legal_action,
    penalty_config
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
    -- Get company details for metadata
    SELECT type, industry, industry_categories[1]
    INTO v_company_type, v_company_industry, v_company_category
    FROM public.companies
    WHERE id = v_company_id;

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
          (CURRENT_DATE + (v_i || ' months')::INTERVAL)::DATE
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
          created_by,
          updated_by,
          required_documents,
          possible_legal_action,
          penalty_config
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
          v_user_id,
          v_user_id,
          COALESCE(v_template.required_documents, '{}'),
          v_template.possible_legal_action,
          v_template.penalty_config
        )
        ON CONFLICT (company_id, template_id, due_date, compliance_type) 
        DO UPDATE SET
          updated_at = NOW(),
          updated_by = v_user_id,
          required_documents = COALESCE(v_template.required_documents, '{}'),
          possible_legal_action = v_template.possible_legal_action,
          penalty_config = v_template.penalty_config;
        
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
          (CURRENT_DATE + (v_i * 3 || ' months')::INTERVAL)::DATE
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
          created_by,
          updated_by,
          required_documents,
          possible_legal_action,
          penalty_config
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
          v_user_id,
          v_user_id,
          COALESCE(v_template.required_documents, '{}'),
          v_template.possible_legal_action,
          v_template.penalty_config
        )
        ON CONFLICT (company_id, template_id, due_date, compliance_type) 
        DO UPDATE SET
          updated_at = NOW(),
          updated_by = v_user_id,
          required_documents = COALESCE(v_template.required_documents, '{}'),
          possible_legal_action = v_template.possible_legal_action,
          penalty_config = v_template.penalty_config;
        
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
          (CURRENT_DATE + (v_i || ' years')::INTERVAL)::DATE
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
          created_by,
          updated_by,
          required_documents,
          possible_legal_action,
          penalty_config
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
          v_user_id,
          v_user_id,
          COALESCE(v_template.required_documents, '{}'),
          v_template.possible_legal_action,
          v_template.penalty_config
        )
        ON CONFLICT (company_id, template_id, due_date, compliance_type) 
        DO UPDATE SET
          updated_at = NOW(),
          updated_by = v_user_id,
          required_documents = COALESCE(v_template.required_documents, '{}'),
          possible_legal_action = v_template.possible_legal_action,
          penalty_config = v_template.penalty_config;
        
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
        CURRENT_DATE
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
        created_by,
        updated_by,
        required_documents,
        possible_legal_action,
        penalty_config
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
        v_user_id,
        v_user_id,
        COALESCE(v_template.required_documents, '{}'),
        v_template.possible_legal_action,
        v_template.penalty_config
      )
      ON CONFLICT (company_id, template_id, due_date, compliance_type) 
      DO UPDATE SET
        updated_at = NOW(),
        updated_by = v_user_id,
        required_documents = COALESCE(v_template.required_documents, '{}'),
        possible_legal_action = v_template.possible_legal_action,
        penalty_config = v_template.penalty_config;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'apply_template_to_companies: Created/updated % requirements for template %', v_count, p_template_id;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 10. SAMPLE PENALTY_CONFIG DATA UPDATES
-- Populate penalty_config for existing templates
-- ============================================

-- Daily penalties (50/day)
UPDATE public.compliance_templates
SET penalty_config = '{"type": "daily", "rate": 50, "nil_rate": 20}'::jsonb
WHERE penalty LIKE '%50/day%' OR penalty = '50';

-- Daily penalties with cap (50/day max 2000)
UPDATE public.compliance_templates
SET penalty_config = '{"type": "daily", "rate": 50, "cap": 2000}'::jsonb
WHERE penalty LIKE '%50/day%' AND penalty LIKE '%Max 2000%';

-- Daily penalties (100/day)
UPDATE public.compliance_templates
SET penalty_config = '{"type": "daily", "rate": 100}'::jsonb
WHERE penalty = '100' OR (penalty LIKE '%100/day%' AND penalty NOT LIKE '%|%');

-- Daily with max (100/day max 500000)
UPDATE public.compliance_templates
SET penalty_config = '{"type": "daily", "rate": 100, "cap": 500000}'::jsonb
WHERE penalty = '100|500000';

-- Daily with max (500/day max 100000)
UPDATE public.compliance_templates
SET penalty_config = '{"type": "daily", "rate": 500, "cap": 100000}'::jsonb
WHERE penalty = '500|100000';

-- Interest-based penalties (1.5%/month on tax)
UPDATE public.compliance_templates
SET penalty_config = '{"type": "interest", "rate": 1.5, "period": "month", "base": "tax_due"}'::jsonb
WHERE penalty LIKE '%1.5%/month%' OR penalty LIKE '%1.5% per month%';

-- Interest-based penalties (18% p.a.)
UPDATE public.compliance_templates
SET penalty_config = '{"type": "interest", "rate": 18, "period": "year", "base": "tax_due"}'::jsonb
WHERE penalty LIKE '%18% p.a.%' AND penalty NOT LIKE '%+%';

-- Composite: Interest + daily (18% p.a. + 50/day)
UPDATE public.compliance_templates
SET penalty_config = '{"type": "composite", "parts": [{"type": "interest", "rate": 18, "period": "year", "base": "tax_due"}, {"type": "daily", "rate": 50, "nil_rate": 20}]}'::jsonb
WHERE penalty LIKE '%18% p.a.%' AND penalty LIKE '%50/day%';

-- Composite: Interest + damages (12% p.a. + 5-25% damages)
UPDATE public.compliance_templates
SET penalty_config = '{"type": "composite", "parts": [{"type": "interest", "rate": 12, "period": "year", "base": "contribution"}, {"type": "percentage", "rate_min": 5, "rate_max": 25, "base": "contribution"}]}'::jsonb
WHERE penalty LIKE '%12% p.a.%' AND penalty LIKE '%damages%';

-- Percentage of turnover (0.5% of turnover)
UPDATE public.compliance_templates
SET penalty_config = '{"type": "percentage", "rate": 0.5, "base": "turnover", "cap": null}'::jsonb
WHERE penalty LIKE '%0.5% of turnover%' OR penalty LIKE '%0.50% of turnover%';

-- Daily + percentage cap (200/day, max 0.5% turnover)
UPDATE public.compliance_templates
SET penalty_config = '{"type": "daily", "rate": 200, "cap_type": "percentage", "cap_rate": 0.5, "cap_base": "turnover"}'::jsonb
WHERE penalty LIKE '%200/day%' AND penalty LIKE '%0.5%';

-- Range penalties (25000-300000)
UPDATE public.compliance_templates
SET penalty_config = '{"type": "range", "min": 25000, "max": 300000}'::jsonb
WHERE penalty LIKE '%25000-300000%' OR penalty LIKE '%25k%300000%';

-- Fixed + daily (5000 + 500/day)
UPDATE public.compliance_templates
SET penalty_config = '{"type": "composite", "parts": [{"type": "flat", "amount": 5000}, {"type": "daily", "rate": 500}]}'::jsonb
WHERE penalty LIKE '%5000 + %500%day%' OR penalty LIKE '%500|5000|base%';

-- Tax audit (0.5% of turnover, max 150000)
UPDATE public.compliance_templates
SET penalty_config = '{"type": "percentage", "rate": 0.5, "base": "turnover", "cap": 150000}'::jsonb
WHERE penalty LIKE '%0.5% TO%' AND penalty LIKE '%Max 150000%';

-- ITR late fee (5000 or 1000 if income < 5L)
UPDATE public.compliance_templates
SET penalty_config = '{"type": "flat", "amount": 5000, "reduced_amount": 1000, "reduced_condition": "income_under_5l"}'::jsonb
WHERE penalty LIKE '%5000%' AND penalty LIKE '%Income < 5L%1000%';

-- Percentage per invoice (100% Tax or 10000/invoice)
UPDATE public.compliance_templates
SET penalty_config = '{"type": "per_invoice", "rate": 100, "base": "tax_amount", "min_per_invoice": 10000}'::jsonb
WHERE penalty LIKE '%100% Tax%' AND penalty LIKE '%10000/invoice%';

RAISE NOTICE 'Penalty config updates complete';
