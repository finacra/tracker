-- ============================================
-- SYNC REQUIRED DOCUMENTS FROM TEMPLATES TO REQUIREMENTS
-- Run this to populate required_documents for existing requirements
-- ============================================

-- First, check the current state
SELECT 
  rr.id,
  rr.requirement,
  rr.required_documents AS current_docs,
  ct.required_documents AS template_docs,
  ct.id AS template_id
FROM public.regulatory_requirements rr
LEFT JOIN public.compliance_templates ct ON rr.template_id = ct.id
WHERE rr.template_id IS NOT NULL
LIMIT 10;

-- Update ALL requirements with required_documents from their templates
UPDATE public.regulatory_requirements rr
SET 
  required_documents = COALESCE(ct.required_documents, '{}'),
  possible_legal_action = COALESCE(rr.possible_legal_action, ct.possible_legal_action),
  penalty_config = COALESCE(rr.penalty_config, ct.penalty_config)
FROM public.compliance_templates ct
WHERE rr.template_id = ct.id
  AND rr.template_id IS NOT NULL;

-- Verify the update
SELECT 
  rr.requirement,
  rr.required_documents,
  rr.possible_legal_action,
  rr.penalty_config
FROM public.regulatory_requirements rr
WHERE rr.required_documents IS NOT NULL 
  AND array_length(rr.required_documents, 1) > 0
LIMIT 10;
