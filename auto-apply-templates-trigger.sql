-- ============================================
-- AUTO-APPLY TEMPLATES TO NEW COMPANIES
-- This trigger automatically applies all active compliance templates
-- when a new company is created
-- ============================================

-- Function to apply all templates to a single company
CREATE OR REPLACE FUNCTION public.apply_all_templates_to_company(p_company_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_template RECORD;
  v_template_id UUID;
  v_total_count INTEGER := 0;
  v_applied_count INTEGER;
BEGIN
  -- Loop through all active templates
  FOR v_template IN 
    SELECT id FROM public.compliance_templates WHERE is_active = TRUE
  LOOP
    -- Check if this company matches the template criteria
    IF EXISTS (
      SELECT 1 FROM public.match_companies_to_template(v_template.id) 
      WHERE company_id = p_company_id
    ) THEN
      -- Apply the template to this company
      SELECT public.apply_template_to_companies(v_template.id) INTO v_applied_count;
      v_total_count := v_total_count + COALESCE(v_applied_count, 0);
    END IF;
  END LOOP;

  RETURN v_total_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function that fires after a company is inserted
CREATE OR REPLACE FUNCTION public.on_company_created()
RETURNS TRIGGER AS $$
DECLARE
  v_applied_count INTEGER;
BEGIN
  -- Apply all templates to the new company
  RAISE NOTICE 'New company created: %, applying templates...', NEW.id;
  
  SELECT public.apply_all_templates_to_company(NEW.id) INTO v_applied_count;
  
  RAISE NOTICE 'Applied % compliance requirements to company %', v_applied_count, NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger (drop first if exists)
DROP TRIGGER IF EXISTS trigger_apply_templates_on_company_create ON public.companies;

CREATE TRIGGER trigger_apply_templates_on_company_create
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.on_company_created();

-- ============================================
-- ALSO: Apply templates to ALL existing companies that don't have requirements yet
-- This catches any companies created before the trigger was set up
-- ============================================

DO $$
DECLARE
  company_rec RECORD;
  v_count INTEGER;
  v_total INTEGER := 0;
BEGIN
  RAISE NOTICE 'Checking for companies without compliance requirements...';
  
  FOR company_rec IN 
    SELECT c.id, c.name 
    FROM public.companies c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.regulatory_requirements rr 
      WHERE rr.company_id = c.id
    )
  LOOP
    RAISE NOTICE 'Applying templates to company: % (%)', company_rec.name, company_rec.id;
    SELECT public.apply_all_templates_to_company(company_rec.id) INTO v_count;
    v_total := v_total + COALESCE(v_count, 0);
    RAISE NOTICE 'Applied % requirements', v_count;
  END LOOP;
  
  RAISE NOTICE 'Total: Applied % requirements to companies without existing compliance data', v_total;
END $$;

-- Verify the trigger exists
SELECT 'Trigger created successfully!' AS status;
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers 
WHERE trigger_name = 'trigger_apply_templates_on_company_create';
