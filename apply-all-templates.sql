-- ============================================
-- APPLY ALL COMPLIANCE TEMPLATES TO MATCHING COMPANIES
-- ============================================
-- Run this AFTER running populate-compliance-templates.sql
-- This will create regulatory_requirements for all matching companies

-- Function to apply all active templates to matching companies
DO $$
DECLARE
  v_template_id UUID;
  v_template_name TEXT;
  v_applied_count INTEGER;
  v_total_applied INTEGER := 0;
  v_template_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting to apply all active compliance templates...';
  
  -- Loop through all active templates
  FOR v_template_id, v_template_name IN 
    SELECT id, requirement 
    FROM public.compliance_templates 
    WHERE is_active = TRUE
    ORDER BY compliance_type, category, requirement
  LOOP
    v_template_count := v_template_count + 1;
    
    -- Apply template to all matching companies
    SELECT public.apply_template_to_companies(v_template_id) INTO v_applied_count;
    
    v_total_applied := v_total_applied + COALESCE(v_applied_count, 0);
    
    RAISE NOTICE 'Applied template "%": % requirements created/updated', v_template_name, COALESCE(v_applied_count, 0);
  END LOOP;
  
  RAISE NOTICE '============================================';
  RAISE NOTICE 'COMPLETED!';
  RAISE NOTICE 'Processed % templates', v_template_count;
  RAISE NOTICE 'Total requirements created/updated: %', v_total_applied;
  RAISE NOTICE '============================================';
END $$;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Count regulatory requirements by company
SELECT 
  c.name AS company_name,
  c.type AS company_type,
  COUNT(rr.id) AS requirement_count
FROM public.companies c
LEFT JOIN public.regulatory_requirements rr ON c.id = rr.company_id
GROUP BY c.id, c.name, c.type
ORDER BY c.name;

-- Count regulatory requirements by category
SELECT 
  category,
  compliance_type,
  COUNT(*) AS requirement_count
FROM public.regulatory_requirements
GROUP BY category, compliance_type
ORDER BY category, compliance_type;

-- Show upcoming requirements (next 30 days)
SELECT 
  c.name AS company_name,
  rr.requirement,
  rr.category,
  rr.due_date,
  rr.status
FROM public.regulatory_requirements rr
JOIN public.companies c ON rr.company_id = c.id
WHERE rr.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
ORDER BY rr.due_date, c.name;
