-- Migration: Restore missing compliance_templates from regulatory_requirements
-- This script recreates templates that were deleted but still have requirements referencing them

-- Step 1: Create a function to restore templates from requirements
CREATE OR REPLACE FUNCTION public.restore_templates_from_requirements()
RETURNS TABLE(
  restored_count INTEGER,
  skipped_count INTEGER,
  error_count INTEGER
) AS $$
DECLARE
  v_restored_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_req RECORD;
  v_template_id UUID;
  v_existing_template UUID;
BEGIN
  -- Find all requirements that have a template_id but the template doesn't exist
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
      -- Get due date info from the first requirement with this template_id
      (SELECT due_date FROM public.regulatory_requirements 
       WHERE template_id = rr.template_id AND due_date IS NOT NULL 
       LIMIT 1) as due_date,
      -- Get due_date_offset from template if it exists, otherwise calculate
      NULL::INTEGER as due_date_offset,
      NULL::INTEGER as due_month,
      NULL::INTEGER as due_day
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
        
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;
      
      -- Calculate due_date_offset, due_month, due_day from compliance_type and due_date
      IF v_req.compliance_type = 'monthly' AND v_req.due_date IS NOT NULL THEN
        v_req.due_date_offset := EXTRACT(DAY FROM v_req.due_date)::INTEGER;
      ELSIF v_req.compliance_type IN ('quarterly', 'annual') AND v_req.due_date IS NOT NULL THEN
        v_req.due_month := EXTRACT(MONTH FROM v_req.due_date)::INTEGER;
        v_req.due_day := EXTRACT(DAY FROM v_req.due_date)::INTEGER;
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
        v_req.template_id, -- Use the original template_id
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
        v_req.due_date_offset,
        v_req.due_month,
        v_req.due_day,
        CASE WHEN v_req.compliance_type = 'one-time' THEN v_req.due_date ELSE NULL END,
        COALESCE(v_req.year_type, 'FY'),
        COALESCE(v_req.required_documents, ARRAY[]::TEXT[]),
        v_req.possible_legal_action,
        true, -- Set as active
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
  
  RETURN QUERY SELECT v_restored_count, v_skipped_count, v_error_count;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Run the restoration function
SELECT * FROM public.restore_templates_from_requirements();

-- Step 3: Clean up - drop the function if you don't need it anymore
-- DROP FUNCTION IF EXISTS public.restore_templates_from_requirements();

COMMENT ON FUNCTION public.restore_templates_from_requirements IS 'Restores missing compliance_templates from regulatory_requirements that still reference them. Returns counts of restored, skipped, and error templates.';
