-- ============================================
-- FIX: Update match_companies_to_template function
-- to handle short company type values from onboarding
-- 
-- Company types stored: "private", "partnership", "llp", "ngo", "sole"
-- Template entity_types: "Private Limited Company", "Partnership Firm", "LLP", 
--                        "Trust / Society / Sec 8 Company", etc.
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
    -- Industry match: if template has industries specified, company industry must match (case-insensitive)
    (
      v_template.industries IS NULL 
      OR array_length(v_template.industries, 1) IS NULL 
      OR (c.industry IS NOT NULL AND LOWER(TRIM(c.industry)) = ANY(
        SELECT LOWER(TRIM(unnest(v_template.industries)))
      ))
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

-- Verify the fix by checking company types
SELECT 'Companies in database:' AS info;
SELECT id, name, type FROM public.companies LIMIT 10;

-- Check template entity_types
SELECT 'Sample templates with entity_types:' AS info;
SELECT id, requirement, entity_types 
FROM public.compliance_templates 
WHERE entity_types IS NOT NULL 
LIMIT 10;
