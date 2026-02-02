-- ============================================
-- FIX TEMPLATE MATCHING ISSUES
-- ============================================
-- Issues fixed:
-- 1. Entity type matching (private, llp, public, etc. → template values)
-- 2. Industry matching too strict (technology ≠ IT & Technology Services)
-- 3. Industry + Industry Category coupling too tight (should be OR, not AND)
-- 4. General case sensitivity issues

-- ============================================
-- IMPROVED MATCH FUNCTION
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

  -- Log for debugging
  RAISE NOTICE 'Matching companies for template with entity_types: %, industries: %, industry_categories: %',
    v_template.entity_types, v_template.industries, v_template.industry_categories;

  RETURN QUERY
  SELECT c.id
  FROM public.companies c
  WHERE 
    -- ============================================
    -- ENTITY TYPE MATCHING (Required if specified)
    -- ============================================
    (
      -- If template has no entity types, match all
      v_template.entity_types IS NULL 
      OR array_length(v_template.entity_types, 1) IS NULL 
      OR array_length(v_template.entity_types, 1) = 0
      -- Also handle {'All'} or empty string in array
      OR 'All' = ANY(v_template.entity_types)
      OR '' = ANY(v_template.entity_types)
      OR (c.type IS NOT NULL AND (
        -- Direct match (case-insensitive)
        LOWER(TRIM(c.type)) = ANY(SELECT LOWER(TRIM(unnest(v_template.entity_types))))
        
        -- ===== MAPPING: Company value "private" =====
        OR (LOWER(TRIM(c.type)) = 'private' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%private%'
        ))
        
        -- ===== MAPPING: Company value "public" =====
        OR (LOWER(TRIM(c.type)) = 'public' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%public%'
        ))
        
        -- ===== MAPPING: Company value "llp" =====
        OR (LOWER(TRIM(c.type)) = 'llp' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%llp%' OR LOWER(t) LIKE '%limited liability%'
        ))
        
        -- ===== MAPPING: Company value "ngo" =====
        OR (LOWER(TRIM(c.type)) = 'ngo' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%ngo%' 
            OR LOWER(t) LIKE '%section 8%' 
            OR LOWER(t) LIKE '%section%8%' 
            OR LOWER(t) LIKE '%society%' 
            OR LOWER(t) LIKE '%trust%'
        ))
        
        -- ===== MAPPING: Company value "partnership" =====
        OR (LOWER(TRIM(c.type)) = 'partnership' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%partnership%'
        ))
        
        -- ===== MAPPING: Company value "sole" =====
        OR (LOWER(TRIM(c.type)) = 'sole' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%sole%' OR LOWER(t) LIKE '%proprietor%'
        ))
        
        -- ===== REVERSE: Template has "Private Limited" and company has "private limited" (full) =====
        OR (LOWER(c.type) LIKE '%private%' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%private%'
        ))
        
        -- ===== REVERSE: Template has "Public Limited" and company has variations =====
        OR (LOWER(c.type) LIKE '%public%' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%public%'
        ))
        
        -- ===== REVERSE: Template has "LLP" and company has variations =====
        OR (LOWER(c.type) LIKE '%llp%' AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%llp%'
        ))
        
        -- ===== REVERSE: Template has NGO variations =====
        OR ((LOWER(c.type) LIKE '%ngo%' OR LOWER(c.type) LIKE '%section%') AND EXISTS (
          SELECT 1 FROM unnest(v_template.entity_types) AS t 
          WHERE LOWER(t) LIKE '%ngo%' OR LOWER(t) LIKE '%section%'
        ))
      ))
    )
    AND
    -- ============================================
    -- INDUSTRY + INDUSTRY CATEGORY (Flexible OR)
    -- If template specifies EITHER industries OR industry_categories,
    -- company can match on EITHER (not both required)
    -- ============================================
    (
      -- If template has neither industries nor industry_categories, match all
      (
        (v_template.industries IS NULL OR array_length(v_template.industries, 1) IS NULL OR array_length(v_template.industries, 1) = 0)
        AND
        (v_template.industry_categories IS NULL OR array_length(v_template.industry_categories, 1) IS NULL OR array_length(v_template.industry_categories, 1) = 0)
      )
      OR
      -- Company matches on industry
      (
        c.industry IS NOT NULL AND (
          -- Direct match
          LOWER(TRIM(c.industry)) = ANY(SELECT LOWER(TRIM(unnest(v_template.industries))))
          -- Partial/synonym matching for industries
          OR (LOWER(c.industry) = 'technology' AND EXISTS (
            SELECT 1 FROM unnest(v_template.industries) AS t 
            WHERE LOWER(t) LIKE '%tech%' OR LOWER(t) LIKE '%it %' OR LOWER(t) = 'it'
          ))
          OR (LOWER(c.industry) = 'finance' AND EXISTS (
            SELECT 1 FROM unnest(v_template.industries) AS t 
            WHERE LOWER(t) LIKE '%finance%' OR LOWER(t) LIKE '%financial%' OR LOWER(t) LIKE '%banking%'
          ))
          OR (LOWER(c.industry) = 'healthcare' AND EXISTS (
            SELECT 1 FROM unnest(v_template.industries) AS t 
            WHERE LOWER(t) LIKE '%health%' OR LOWER(t) LIKE '%medical%' OR LOWER(t) LIKE '%pharma%'
          ))
          OR (LOWER(c.industry) = 'education' AND EXISTS (
            SELECT 1 FROM unnest(v_template.industries) AS t 
            WHERE LOWER(t) LIKE '%educ%' OR LOWER(t) LIKE '%school%' OR LOWER(t) LIKE '%university%'
          ))
          OR (LOWER(c.industry) = 'retail' AND EXISTS (
            SELECT 1 FROM unnest(v_template.industries) AS t 
            WHERE LOWER(t) LIKE '%retail%' OR LOWER(t) LIKE '%trading%' OR LOWER(t) LIKE '%commerce%'
          ))
          OR (LOWER(c.industry) = 'manufacturing' AND EXISTS (
            SELECT 1 FROM unnest(v_template.industries) AS t 
            WHERE LOWER(t) LIKE '%manufactur%' OR LOWER(t) LIKE '%production%'
          ))
          OR (LOWER(c.industry) = 'real-estate' AND EXISTS (
            SELECT 1 FROM unnest(v_template.industries) AS t 
            WHERE LOWER(t) LIKE '%real%estate%' OR LOWER(t) LIKE '%construction%' OR LOWER(t) LIKE '%property%'
          ))
          OR (LOWER(c.industry) = 'consulting' AND EXISTS (
            SELECT 1 FROM unnest(v_template.industries) AS t 
            WHERE LOWER(t) LIKE '%consult%' OR LOWER(t) LIKE '%professional%services%' OR LOWER(t) LIKE '%advisory%'
          ))
          OR (LOWER(c.industry) = 'other' AND EXISTS (
            SELECT 1 FROM unnest(v_template.industries) AS t 
            WHERE LOWER(t) = 'other' OR LOWER(t) LIKE '%other%'
          ))
          -- Reverse: template has partial, company has full
          OR EXISTS (
            SELECT 1 FROM unnest(v_template.industries) AS t 
            WHERE LOWER(c.industry) LIKE '%' || LOWER(t) || '%'
            OR LOWER(t) LIKE '%' || LOWER(c.industry) || '%'
          )
          -- Template has "All Industries" or similar
          OR EXISTS (
            SELECT 1 FROM unnest(v_template.industries) AS t 
            WHERE LOWER(t) = 'all' OR LOWER(t) = 'all industries' OR LOWER(t) = ''
          )
        )
      )
      OR
      -- Company matches on industry_categories
      (
        c.industry_categories IS NOT NULL 
        AND array_length(c.industry_categories, 1) > 0
        AND EXISTS (
          SELECT 1 FROM unnest(c.industry_categories) AS company_cat
          WHERE 
            -- Direct match
            LOWER(TRIM(company_cat)) = ANY(SELECT LOWER(TRIM(unnest(v_template.industry_categories))))
            -- Partial matching for categories
            OR EXISTS (
              SELECT 1 FROM unnest(v_template.industry_categories) AS template_cat
              WHERE LOWER(company_cat) LIKE '%' || LOWER(template_cat) || '%'
              OR LOWER(template_cat) LIKE '%' || LOWER(company_cat) || '%'
            )
        )
      )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.match_companies_to_template(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_companies_to_template(UUID) TO service_role;

-- ============================================
-- DEBUG FUNCTION: See why a company isn't matching
-- ============================================
CREATE OR REPLACE FUNCTION public.debug_company_template_match(
  p_company_id UUID,
  p_template_id UUID
)
RETURNS TABLE(
  check_name TEXT,
  company_value TEXT,
  template_value TEXT,
  matches BOOLEAN
) AS $$
DECLARE
  v_company RECORD;
  v_template RECORD;
BEGIN
  -- Get company details
  SELECT type, industry, industry_categories
  INTO v_company
  FROM public.companies
  WHERE id = p_company_id;
  
  -- Get template details
  SELECT entity_types, industries, industry_categories, is_active
  INTO v_template
  FROM public.compliance_templates
  WHERE id = p_template_id;
  
  -- Check 1: Template is active
  RETURN QUERY SELECT 
    'Template Active'::TEXT,
    'N/A'::TEXT,
    COALESCE(v_template.is_active::TEXT, 'NULL'),
    COALESCE(v_template.is_active, FALSE);
  
  -- Check 2: Entity Type
  RETURN QUERY SELECT 
    'Entity Type'::TEXT,
    COALESCE(v_company.type, 'NULL')::TEXT,
    COALESCE(array_to_string(v_template.entity_types, ', '), 'NULL')::TEXT,
    CASE 
      WHEN v_template.entity_types IS NULL OR array_length(v_template.entity_types, 1) IS NULL THEN TRUE
      WHEN v_company.type IS NULL THEN FALSE
      ELSE EXISTS (
        SELECT 1 FROM unnest(v_template.entity_types) AS t 
        WHERE LOWER(t) LIKE '%' || LOWER(v_company.type) || '%'
        OR LOWER(v_company.type) LIKE '%' || LOWER(
          CASE 
            WHEN LOWER(t) LIKE '%private%' THEN 'private'
            WHEN LOWER(t) LIKE '%public%' THEN 'public'
            WHEN LOWER(t) LIKE '%llp%' THEN 'llp'
            WHEN LOWER(t) LIKE '%ngo%' OR LOWER(t) LIKE '%section%' THEN 'ngo'
            ELSE LOWER(t)
          END
        ) || '%'
      )
    END;
  
  -- Check 3: Industry
  RETURN QUERY SELECT 
    'Industry'::TEXT,
    COALESCE(v_company.industry, 'NULL')::TEXT,
    COALESCE(array_to_string(v_template.industries, ', '), 'NULL')::TEXT,
    CASE 
      WHEN v_template.industries IS NULL OR array_length(v_template.industries, 1) IS NULL THEN TRUE
      WHEN v_company.industry IS NULL THEN FALSE
      ELSE (
        LOWER(TRIM(v_company.industry)) = ANY(SELECT LOWER(TRIM(unnest(v_template.industries))))
        OR EXISTS (
          SELECT 1 FROM unnest(v_template.industries) AS t 
          WHERE LOWER(v_company.industry) LIKE '%' || LOWER(t) || '%'
          OR LOWER(t) LIKE '%' || LOWER(v_company.industry) || '%'
        )
      )
    END;
  
  -- Check 4: Industry Categories
  RETURN QUERY SELECT 
    'Industry Categories'::TEXT,
    COALESCE(array_to_string(v_company.industry_categories, ', '), 'NULL')::TEXT,
    COALESCE(array_to_string(v_template.industry_categories, ', '), 'NULL')::TEXT,
    CASE 
      WHEN v_template.industry_categories IS NULL OR array_length(v_template.industry_categories, 1) IS NULL THEN TRUE
      WHEN v_company.industry_categories IS NULL OR array_length(v_company.industry_categories, 1) IS NULL THEN FALSE
      ELSE EXISTS (
        SELECT 1 FROM unnest(v_company.industry_categories) AS company_cat
        WHERE LOWER(TRIM(company_cat)) = ANY(SELECT LOWER(TRIM(unnest(v_template.industry_categories))))
      )
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.debug_company_template_match(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debug_company_template_match(UUID, UUID) TO service_role;

-- ============================================
-- TEST: Show all companies and their attributes
-- ============================================
SELECT 
  id,
  name,
  type AS entity_type,
  industry,
  industry_categories
FROM public.companies
ORDER BY created_at DESC
LIMIT 10;

-- ============================================
-- TEST: Count how many templates each company matches now
-- ============================================
SELECT 
  c.name,
  c.type,
  c.industry,
  (
    SELECT COUNT(*) 
    FROM public.compliance_templates t 
    WHERE t.is_active = TRUE 
    AND EXISTS (SELECT 1 FROM public.match_companies_to_template(t.id) m WHERE m.company_id = c.id)
  ) AS matching_template_count
FROM public.companies c
ORDER BY c.created_at DESC
LIMIT 10;

-- ============================================
-- DEBUG: Why isn't a specific company matching?
-- Run this with your company_id and template_id
-- ============================================
-- Example: SELECT * FROM public.debug_company_template_match('YOUR_COMPANY_ID', 'YOUR_TEMPLATE_ID');

-- ============================================
-- APPLY TEMPLATES TO ALL EXISTING COMPANIES
-- Run this to retroactively apply templates to companies
-- that were created before this fix
-- ============================================
DO $$
DECLARE
  v_company RECORD;
  v_count INTEGER;
  v_total INTEGER := 0;
BEGIN
  RAISE NOTICE 'Re-applying all templates to existing companies with new matching logic...';
  
  FOR v_company IN 
    SELECT id, name FROM public.companies ORDER BY created_at DESC
  LOOP
    SELECT public.apply_all_templates_to_company(v_company.id) INTO v_count;
    v_total := v_total + COALESCE(v_count, 0);
    RAISE NOTICE 'Company "%": applied % new requirements', v_company.name, v_count;
  END LOOP;
  
  RAISE NOTICE '============================================';
  RAISE NOTICE 'COMPLETED! Total new requirements created: %', v_total;
  RAISE NOTICE '============================================';
END $$;

-- ============================================
-- VERIFY RESULTS
-- ============================================
SELECT 
  c.name,
  c.type AS entity_type,
  c.industry,
  COUNT(rr.id) AS total_requirements,
  COUNT(CASE WHEN rr.compliance_type = 'one-time' THEN 1 END) AS one_time,
  COUNT(CASE WHEN rr.compliance_type = 'monthly' THEN 1 END) AS monthly,
  COUNT(CASE WHEN rr.compliance_type = 'quarterly' THEN 1 END) AS quarterly,
  COUNT(CASE WHEN rr.compliance_type = 'annual' THEN 1 END) AS annual
FROM public.companies c
LEFT JOIN public.regulatory_requirements rr ON c.id = rr.company_id
GROUP BY c.id, c.name, c.type, c.industry
ORDER BY c.created_at DESC;
