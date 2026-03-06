-- Quick check: See all templates and their status

-- 1. Count templates by is_active status
SELECT 
  is_active,
  COUNT(*) as count
FROM public.compliance_templates
GROUP BY is_active
ORDER BY is_active DESC;

-- 2. Show all templates with their creation date and active status
SELECT 
  id,
  category,
  requirement,
  compliance_type,
  is_active,
  created_at,
  updated_at
FROM public.compliance_templates
ORDER BY created_at DESC
LIMIT 50;

-- 3. Count how many requirements reference each template
SELECT 
  ct.id,
  ct.category,
  ct.requirement,
  ct.is_active,
  COUNT(rr.id) as requirement_count
FROM public.compliance_templates ct
LEFT JOIN public.regulatory_requirements rr ON rr.template_id = ct.id
GROUP BY ct.id, ct.category, ct.requirement, ct.is_active
ORDER BY requirement_count DESC, ct.created_at DESC
LIMIT 50;
