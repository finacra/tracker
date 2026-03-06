-- ============================================
-- GENERATE RECURRING COMPLIANCES FOR EXISTING COMPANIES
-- Run this script to generate future periods for all existing companies
-- ============================================

DO $$
DECLARE
  v_result RECORD;
  v_total_generated INTEGER := 0;
  v_companies_processed INTEGER := 0;
  v_companies_with_generated INTEGER := 0;
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
      v_companies_with_generated := v_companies_with_generated + 1;
      RAISE NOTICE 'Company: % - Generated % future compliance periods', 
        v_result.company_name, 
        v_result.periods_generated;
    END IF;
  END LOOP;
  
  RAISE NOTICE '============================================';
  RAISE NOTICE 'COMPLETED!';
  RAISE NOTICE 'Total companies processed: %', v_companies_processed;
  RAISE NOTICE 'Companies with new periods generated: %', v_companies_with_generated;
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
