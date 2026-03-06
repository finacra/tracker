-- Migration V2: Restore/create compliance_templates from regulatory_requirements
-- This version handles both:
-- 1. Requirements with template_id pointing to missing templates
-- 2. Requirements with NULL template_id (creates new templates and links them)

CREATE OR REPLACE FUNCTION public.restore_templates_from_requirements_v2()
RETURNS TABLE(
  restored_count INTEGER,
  created_count INTEGER,
  linked_count INTEGER,
  skipped_count INTEGER,
  error_count INTEGER
) AS $$
DECLARE
  v_restored_count INTEGER := 0;
  v_created_count INTEGER := 0;
  v_linked_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_req RECORD;
  v_template_id UUID;
  v_existing_template UUID;
  v_new_template_id UUID;
  v_due_date_offset INTEGER;
  v_due_month INTEGER;
  v_due_day INTEGER;
BEGIN
  -- PART 1: Restore templates for requirements with template_id pointing to missing templates
  FOR v_req IN 
    SELECT DISTINCT 
      rr.template_id,
      rr.category,
      rr.requirement,
      rr.description,
      rr.compliance_type,
      rr.entity_type,
      rr.industry,
      rr.industry_category,
      rr.penalty,
      rr.is_critical,
      rr.financial_year,
      rr.year_type,
      rr.required_documents,
      rr.possible_legal_action,
      (SELECT due_date FROM public.regulatory_requirements 
       WHERE template_id = rr.template_id AND due_date IS NOT NULL 
       LIMIT 1) as due_date
    FROM public.regulatory_requirements rr
    WHERE rr.template_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.compliance_templates ct 
      WHERE ct.id = rr.template_id
    )
    GROUP BY 
      rr.template_id,
      rr.category,
      rr.requirement,
      rr.description,
      rr.compliance_type,
      rr.entity_type,
      rr.industry,
      rr.industry_category,
      rr.penalty,
      rr.is_critical,
      rr.financial_year,
      rr.year_type,
      rr.required_documents,
      rr.possible_legal_action
  LOOP
    BEGIN
      -- Check if a template with the same category and requirement already exists
      SELECT id INTO v_existing_template
      FROM public.compliance_templates
      WHERE category = v_req.category
      AND requirement = v_req.requirement
      LIMIT 1;
      
      IF v_existing_template IS NOT NULL THEN
        -- Template already exists, update the requirements to point to it
        UPDATE public.regulatory_requirements
        SET template_id = v_existing_template
        WHERE template_id = v_req.template_id;
        
        v_linked_count := v_linked_count + 1;
        CONTINUE;
      END IF;
      
      -- Calculate due_date_offset, due_month, due_day from compliance_type and due_date
      v_due_date_offset := NULL;
      v_due_month := NULL;
      v_due_day := NULL;
      
      IF v_req.compliance_type = 'monthly' AND v_req.due_date IS NOT NULL THEN
        v_due_date_offset := EXTRACT(DAY FROM v_req.due_date)::INTEGER;
      ELSIF v_req.compliance_type IN ('quarterly', 'annual') AND v_req.due_date IS NOT NULL THEN
        v_due_month := EXTRACT(MONTH FROM v_req.due_date)::INTEGER;
        v_due_day := EXTRACT(DAY FROM v_req.due_date)::INTEGER;
      END IF;
      
      -- Create the template with the original template_id
      INSERT INTO public.compliance_templates (
        id,
        category,
        requirement,
        description,
        compliance_type,
        entity_types,
        industries,
        industry_categories,
        penalty,
        is_critical,
        financial_year,
        due_date_offset,
        due_month,
        due_day,
        due_date,
        year_type,
        required_documents,
        possible_legal_action,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        v_req.template_id,
        v_req.category,
        v_req.requirement,
        v_req.description,
        v_req.compliance_type,
        CASE WHEN v_req.entity_type IS NOT NULL THEN ARRAY[v_req.entity_type] ELSE ARRAY[]::TEXT[] END,
        CASE WHEN v_req.industry IS NOT NULL THEN ARRAY[v_req.industry] ELSE ARRAY[]::TEXT[] END,
        CASE WHEN v_req.industry_category IS NOT NULL THEN ARRAY[v_req.industry_category] ELSE ARRAY[]::TEXT[] END,
        v_req.penalty,
        COALESCE(v_req.is_critical, false),
        v_req.financial_year,
        v_due_date_offset,
        v_due_month,
        v_due_day,
        CASE WHEN v_req.compliance_type = 'one-time' THEN v_req.due_date ELSE NULL END,
        COALESCE(v_req.year_type, 'FY'),
        COALESCE(v_req.required_documents, ARRAY[]::TEXT[]),
        v_req.possible_legal_action,
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
      
      IF FOUND THEN
        v_restored_count := v_restored_count + 1;
      ELSE
        v_skipped_count := v_skipped_count + 1;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING 'Error restoring template %: %', v_req.template_id, SQLERRM;
    END;
  END LOOP;
  
  -- PART 2: Create templates for requirements with NULL template_id
  -- Group by category, requirement, compliance_type to create one template per unique combination
  FOR v_req IN 
    SELECT DISTINCT
      rr.category,
      rr.requirement,
      rr.description,
      rr.compliance_type,
      -- Aggregate entity_types, industries, industry_categories
      ARRAY_AGG(DISTINCT rr.entity_type) FILTER (WHERE rr.entity_type IS NOT NULL) as entity_types,
      ARRAY_AGG(DISTINCT rr.industry) FILTER (WHERE rr.industry IS NOT NULL) as industries,
      ARRAY_AGG(DISTINCT rr.industry_category) FILTER (WHERE rr.industry_category IS NOT NULL) as industry_categories,
      -- Get most common values
      MODE() WITHIN GROUP (ORDER BY rr.penalty) as penalty,
      MODE() WITHIN GROUP (ORDER BY rr.is_critical) as is_critical,
      MODE() WITHIN GROUP (ORDER BY rr.financial_year) as financial_year,
      MODE() WITHIN GROUP (ORDER BY rr.year_type) as year_type,
      MODE() WITHIN GROUP (ORDER BY rr.possible_legal_action) as possible_legal_action,
      -- Get due_date from first requirement
      (SELECT due_date FROM public.regulatory_requirements 
       WHERE category = rr.category 
       AND requirement = rr.requirement 
       AND compliance_type = rr.compliance_type
       AND template_id IS NULL
       AND due_date IS NOT NULL 
       LIMIT 1) as due_date,
      -- Get required_documents from first requirement
      (SELECT required_documents FROM public.regulatory_requirements 
       WHERE category = rr.category 
       AND requirement = rr.requirement 
       AND compliance_type = rr.compliance_type
       AND template_id IS NULL
       AND required_documents IS NOT NULL 
       AND array_length(required_documents, 1) > 0
       LIMIT 1) as required_documents
    FROM public.regulatory_requirements rr
    WHERE rr.template_id IS NULL
    GROUP BY rr.category, rr.requirement, rr.description, rr.compliance_type
    HAVING NOT EXISTS (
      -- Don't create if a template with same category and requirement already exists
      SELECT 1 FROM public.compliance_templates ct
      WHERE ct.category = rr.category
      AND ct.requirement = rr.requirement
    )
  LOOP
    BEGIN
      -- Check if template already exists
      SELECT id INTO v_existing_template
      FROM public.compliance_templates
      WHERE category = v_req.category
      AND requirement = v_req.requirement
      LIMIT 1;
      
      IF v_existing_template IS NOT NULL THEN
        -- Link requirements to existing template
        UPDATE public.regulatory_requirements
        SET template_id = v_existing_template
        WHERE template_id IS NULL
        AND category = v_req.category
        AND requirement = v_req.requirement
        AND compliance_type = v_req.compliance_type;
        
        v_linked_count := v_linked_count + 1;
        CONTINUE;
      END IF;
      
      -- Calculate due_date fields
      v_due_date_offset := NULL;
      v_due_month := NULL;
      v_due_day := NULL;
      
      IF v_req.compliance_type = 'monthly' AND v_req.due_date IS NOT NULL THEN
        v_due_date_offset := EXTRACT(DAY FROM v_req.due_date)::INTEGER;
      ELSIF v_req.compliance_type IN ('quarterly', 'annual') AND v_req.due_date IS NOT NULL THEN
        v_due_month := EXTRACT(MONTH FROM v_req.due_date)::INTEGER;
        v_due_day := EXTRACT(DAY FROM v_req.due_date)::INTEGER;
      END IF;
      
      -- Generate new template_id
      v_new_template_id := gen_random_uuid();
      
      -- Create new template
      INSERT INTO public.compliance_templates (
        id,
        category,
        requirement,
        description,
        compliance_type,
        entity_types,
        industries,
        industry_categories,
        penalty,
        is_critical,
        financial_year,
        due_date_offset,
        due_month,
        due_day,
        due_date,
        year_type,
        required_documents,
        possible_legal_action,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        v_new_template_id,
        v_req.category,
        v_req.requirement,
        v_req.description,
        v_req.compliance_type,
        COALESCE(v_req.entity_types, ARRAY[]::TEXT[]),
        COALESCE(v_req.industries, ARRAY[]::TEXT[]),
        COALESCE(v_req.industry_categories, ARRAY[]::TEXT[]),
        v_req.penalty,
        COALESCE(v_req.is_critical, false),
        v_req.financial_year,
        v_due_date_offset,
        v_due_month,
        v_due_day,
        CASE WHEN v_req.compliance_type = 'one-time' THEN v_req.due_date ELSE NULL END,
        COALESCE(v_req.year_type, 'FY'),
        COALESCE(v_req.required_documents, ARRAY[]::TEXT[]),
        v_req.possible_legal_action,
        true,
        NOW(),
        NOW()
      );
      
      -- Link all matching requirements to the new template
      UPDATE public.regulatory_requirements
      SET template_id = v_new_template_id
      WHERE template_id IS NULL
      AND category = v_req.category
      AND requirement = v_req.requirement
      AND compliance_type = v_req.compliance_type;
      
      v_created_count := v_created_count + 1;
      
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING 'Error creating template for % - %: %', v_req.category, v_req.requirement, SQLERRM;
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_restored_count, v_created_count, v_linked_count, v_skipped_count, v_error_count;
END;
$$ LANGUAGE plpgsql;

-- Run the diagnostic first
SELECT '=== DIAGNOSTIC RESULTS ===' as info;

SELECT * FROM (
  SELECT 'Requirements with template_id pointing to missing templates' as check_type, COUNT(*)::TEXT as count
  FROM public.regulatory_requirements rr
  WHERE rr.template_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.compliance_templates ct WHERE ct.id = rr.template_id)
  UNION ALL
  SELECT 'Requirements with NULL template_id' as check_type, COUNT(*)::TEXT as count
  FROM public.regulatory_requirements WHERE template_id IS NULL
  UNION ALL
  SELECT 'Total compliance_templates' as check_type, COUNT(*)::TEXT as count
  FROM public.compliance_templates
  UNION ALL
  SELECT 'Total regulatory_requirements' as check_type, COUNT(*)::TEXT as count
  FROM public.regulatory_requirements
) diagnostics;

-- Run the restoration
SELECT '=== RUNNING RESTORATION ===' as info;
SELECT * FROM public.restore_templates_from_requirements_v2();

-- Clean up function (optional - comment out if you want to keep it)
-- DROP FUNCTION IF EXISTS public.restore_templates_from_requirements_v2();

COMMENT ON FUNCTION public.restore_templates_from_requirements_v2 IS 'Restores missing templates and creates new templates for requirements with NULL template_id. Returns counts of restored, created, linked, skipped, and error templates.';
