-- Diagnostic script to understand the template/requirement situation

-- 1. Check if there are any requirements with template_id that point to missing templates
SELECT 
  'Requirements with template_id pointing to missing templates' as check_type,
  COUNT(*) as count
FROM public.regulatory_requirements rr
WHERE rr.template_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.compliance_templates ct 
  WHERE ct.id = rr.template_id
);

-- 2. Check how many requirements have NULL template_id
SELECT 
  'Requirements with NULL template_id' as check_type,
  COUNT(*) as count
FROM public.regulatory_requirements
WHERE template_id IS NULL;

-- 3. Check total templates vs total requirements
SELECT 
  'Total compliance_templates' as check_type,
  COUNT(*) as count
FROM public.compliance_templates
UNION ALL
SELECT 
  'Total regulatory_requirements' as check_type,
  COUNT(*) as count
FROM public.regulatory_requirements;

-- 4. Show sample requirements with NULL template_id (to see if we can recreate templates from them)
SELECT 
  category,
  requirement,
  compliance_type,
  entity_type,
  industry,
  industry_category,
  COUNT(*) as requirement_count
FROM public.regulatory_requirements
WHERE template_id IS NULL
GROUP BY category, requirement, compliance_type, entity_type, industry, industry_category
ORDER BY requirement_count DESC
LIMIT 20;

-- 5. Show sample requirements with template_id that exists
SELECT 
  rr.category,
  rr.requirement,
  rr.compliance_type,
  COUNT(*) as requirement_count,
  COUNT(DISTINCT rr.template_id) as unique_template_ids
FROM public.regulatory_requirements rr
WHERE rr.template_id IS NOT NULL
AND EXISTS (
  SELECT 1 FROM public.compliance_templates ct 
  WHERE ct.id = rr.template_id
)
GROUP BY rr.category, rr.requirement, rr.compliance_type
ORDER BY requirement_count DESC
LIMIT 20;
