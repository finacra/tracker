-- ============================================
-- GENERATE RECURRING COMPLIANCE INSTANCES
-- Automatically creates future periods for monthly, quarterly, and annual compliances
-- ============================================

-- Function to generate future compliance instances for a specific company
CREATE OR REPLACE FUNCTION public.generate_recurring_compliances_for_company(
  p_company_id UUID,
  p_months_ahead INTEGER DEFAULT 12
)
RETURNS INTEGER AS $$
DECLARE
  v_requirement RECORD;
  v_new_due_date DATE;
  v_periods_generated INTEGER := 0;
  v_year_type TEXT;
  v_fy_start_year INTEGER;
  v_current_date DATE := CURRENT_DATE;
  v_end_date DATE := CURRENT_DATE + (p_months_ahead || ' months')::INTERVAL;
BEGIN
  -- Get company's year_type
  SELECT year_type INTO v_year_type
  FROM public.companies
  WHERE id = p_company_id;
  
  v_year_type := COALESCE(v_year_type, 'FY');
  
  -- Loop through all recurring compliance requirements for this company
  FOR v_requirement IN
    SELECT 
      id,
      template_id,
      category,
      requirement,
      description,
      due_date,
      penalty,
      penalty_config,
      penalty_base_amount,
      is_critical,
      financial_year,
      compliance_type,
      year_type,
      required_documents,
      possible_legal_action,
      created_by
    FROM public.regulatory_requirements
    WHERE company_id = p_company_id
      AND compliance_type IN ('monthly', 'quarterly', 'annual')
      AND status != 'completed'  -- Don't generate for completed items
  LOOP
    -- Use requirement's year_type or fall back to company's
    v_year_type := COALESCE(v_requirement.year_type, v_year_type, 'FY');
    
    -- Generate future periods based on compliance type
    IF v_requirement.compliance_type = 'monthly' THEN
      -- Generate monthly instances for the next N months
      FOR i IN 1..p_months_ahead LOOP
        v_new_due_date := (v_requirement.due_date + (i || ' months')::INTERVAL)::DATE;
        
        -- Only generate if within the target date range and doesn't already exist
        IF v_new_due_date <= v_end_date THEN
          -- Check if this period already exists
          IF NOT EXISTS (
            SELECT 1 FROM public.regulatory_requirements
            WHERE company_id = p_company_id
              AND template_id = v_requirement.template_id
              AND compliance_type = 'monthly'
              AND due_date = v_new_due_date
          ) THEN
            -- Create new requirement instance
            INSERT INTO public.regulatory_requirements (
              company_id,
              template_id,
              category,
              requirement,
              description,
              due_date,
              penalty,
              penalty_config,
              penalty_base_amount,
              is_critical,
              financial_year,
              compliance_type,
              year_type,
              required_documents,
              possible_legal_action,
              status,
              created_by,
              updated_by
            ) VALUES (
              p_company_id,
              v_requirement.template_id,
              v_requirement.category,
              v_requirement.requirement,
              v_requirement.description,
              v_new_due_date,
              v_requirement.penalty,
              v_requirement.penalty_config,
              v_requirement.penalty_base_amount,
              v_requirement.is_critical,
              NULL, -- Financial year will be calculated based on due_date
              'monthly',
              v_year_type,
              v_requirement.required_documents,
              v_requirement.possible_legal_action,
              'not_started',
              v_requirement.created_by,
              v_requirement.created_by
            );
            
            v_periods_generated := v_periods_generated + 1;
          END IF;
        END IF;
      END LOOP;
      
    ELSIF v_requirement.compliance_type = 'quarterly' THEN
      -- Generate quarterly instances
      -- Calculate quarters based on year_type
      DECLARE
        v_base_date DATE := v_requirement.due_date;
        v_quarter_date DATE;
        v_quarters_ahead INTEGER := CEIL(p_months_ahead / 3.0)::INTEGER;
      BEGIN
        FOR i IN 1..v_quarters_ahead LOOP
          v_quarter_date := v_base_date + (i * 3 || ' months')::INTERVAL;
          
          IF v_quarter_date <= v_end_date THEN
            -- Check if this quarter already exists (within 1 day tolerance)
            -- Note: date - date returns integer (days) in PostgreSQL
            IF NOT EXISTS (
              SELECT 1 FROM public.regulatory_requirements
              WHERE company_id = p_company_id
                AND template_id = v_requirement.template_id
                AND compliance_type = 'quarterly'
                AND ABS(due_date - v_quarter_date) < 1
            ) THEN
              INSERT INTO public.regulatory_requirements (
                company_id, template_id, category, requirement, description,
                due_date, penalty, penalty_config, penalty_base_amount,
                is_critical, financial_year, compliance_type, year_type,
                required_documents, possible_legal_action, status,
                created_by, updated_by
              ) VALUES (
                p_company_id, v_requirement.template_id, v_requirement.category,
                v_requirement.requirement, v_requirement.description,
                v_quarter_date, v_requirement.penalty, v_requirement.penalty_config,
                v_requirement.penalty_base_amount, v_requirement.is_critical,
                NULL, 'quarterly', v_year_type,
                v_requirement.required_documents, v_requirement.possible_legal_action,
                'not_started', v_requirement.created_by, v_requirement.created_by
              );
              
              v_periods_generated := v_periods_generated + 1;
            END IF;
          END IF;
        END LOOP;
      END;
      
    ELSIF v_requirement.compliance_type = 'annual' THEN
      -- Generate annual instances for the next N years
      DECLARE
        v_base_date DATE := v_requirement.due_date;
        v_annual_date DATE;
        v_years_ahead INTEGER := CEIL(p_months_ahead / 12.0)::INTEGER;
      BEGIN
        FOR i IN 1..v_years_ahead LOOP
          v_annual_date := v_base_date + (i || ' years')::INTERVAL;
          
          IF v_annual_date <= v_end_date THEN
            -- Check if this year already exists (within 30 days tolerance)
            -- Note: date - date returns integer (days) in PostgreSQL
            IF NOT EXISTS (
              SELECT 1 FROM public.regulatory_requirements
              WHERE company_id = p_company_id
                AND template_id = v_requirement.template_id
                AND compliance_type = 'annual'
                AND ABS(due_date - v_annual_date) < 30
            ) THEN
              INSERT INTO public.regulatory_requirements (
                company_id, template_id, category, requirement, description,
                due_date, penalty, penalty_config, penalty_base_amount,
                is_critical, financial_year, compliance_type, year_type,
                required_documents, possible_legal_action, status,
                created_by, updated_by
              ) VALUES (
                p_company_id, v_requirement.template_id, v_requirement.category,
                v_requirement.requirement, v_requirement.description,
                v_annual_date, v_requirement.penalty, v_requirement.penalty_config,
                v_requirement.penalty_base_amount, v_requirement.is_critical,
                NULL, 'annual', v_year_type,
                v_requirement.required_documents, v_requirement.possible_legal_action,
                'not_started', v_requirement.created_by, v_requirement.created_by
              );
              
              v_periods_generated := v_periods_generated + 1;
            END IF;
          END IF;
        END LOOP;
      END;
    END IF;
  END LOOP;
  
  RETURN v_periods_generated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate recurring compliances for all companies
CREATE OR REPLACE FUNCTION public.generate_recurring_compliances_all(
  p_months_ahead INTEGER DEFAULT 12
)
RETURNS TABLE(company_id UUID, company_name TEXT, periods_generated INTEGER) AS $$
DECLARE
  v_company RECORD;
  v_generated INTEGER;
BEGIN
  FOR v_company IN
    SELECT id, name FROM public.companies
  LOOP
    SELECT public.generate_recurring_compliances_for_company(v_company.id, p_months_ahead) INTO v_generated;
    
    IF v_generated > 0 THEN
      company_id := v_company.id;
      company_name := v_company.name;
      periods_generated := v_generated;
      RETURN NEXT;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.generate_recurring_compliances_for_company(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_recurring_compliances_all(INTEGER) TO authenticated;

-- ============================================
-- AUTOMATICALLY GENERATE FOR ALL EXISTING COMPANIES
-- This will process all existing companies when the script is run
-- ============================================

DO $$
DECLARE
  v_result RECORD;
  v_total_generated INTEGER := 0;
  v_companies_processed INTEGER := 0;
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Generating recurring compliances for all existing companies...';
  RAISE NOTICE 'This may take a few minutes depending on the number of companies.';
  RAISE NOTICE '============================================';
  
  -- Generate for all companies (12 months ahead by default)
  FOR v_result IN
    SELECT * FROM public.generate_recurring_compliances_all(12)
  LOOP
    v_companies_processed := v_companies_processed + 1;
    v_total_generated := v_total_generated + COALESCE(v_result.periods_generated, 0);
    
    IF v_result.periods_generated > 0 THEN
      RAISE NOTICE 'Company: % - Generated % future compliance periods', 
        v_result.company_name, 
        v_result.periods_generated;
    END IF;
  END LOOP;
  
  RAISE NOTICE '============================================';
  RAISE NOTICE 'COMPLETED!';
  RAISE NOTICE 'Companies processed: %', v_companies_processed;
  RAISE NOTICE 'Total future periods generated: %', v_total_generated;
  RAISE NOTICE '============================================';
END $$;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Show count of recurring compliances by type
SELECT 
  compliance_type,
  COUNT(*) as total_count,
  COUNT(CASE WHEN due_date > CURRENT_DATE THEN 1 END) as future_count,
  COUNT(CASE WHEN due_date <= CURRENT_DATE THEN 1 END) as past_current_count
FROM public.regulatory_requirements
WHERE compliance_type IN ('monthly', 'quarterly', 'annual')
GROUP BY compliance_type
ORDER BY compliance_type;

-- Show sample of generated future compliances
SELECT 
  c.name as company_name,
  rr.requirement,
  rr.compliance_type,
  rr.due_date,
  rr.status
FROM public.regulatory_requirements rr
JOIN public.companies c ON rr.company_id = c.id
WHERE rr.compliance_type IN ('monthly', 'quarterly', 'annual')
  AND rr.due_date > CURRENT_DATE
ORDER BY rr.due_date
LIMIT 20;

-- ============================================
-- IMPORTANT: SET UP AUTOMATIC GENERATION
-- ============================================
-- After running this script, you MUST also run:
-- auto-generate-recurring-compliances.sql
-- 
-- This will set up:
-- 1. A trigger that auto-generates when compliances are completed
-- 2. A scheduled function you can call daily to ensure all companies have enough future periods
-- 
-- See auto-generate-recurring-compliances.sql for details
