-- ============================================
-- Diagnose: Find rows violating subscription_type constraint
-- ============================================

-- Find all subscriptions that violate the constraint
SELECT 
  id,
  user_id,
  company_id,
  tier,
  subscription_type,
  status,
  is_trial,
  created_at,
  CASE 
    WHEN subscription_type = 'company' AND company_id IS NULL THEN 'VIOLATION: Company-first without company_id'
    WHEN subscription_type = 'user' AND company_id IS NOT NULL THEN 'VIOLATION: User-first with company_id'
    WHEN subscription_type IS NULL THEN 'MISSING: subscription_type is NULL'
    WHEN tier IS NULL THEN 'MISSING: tier is NULL'
    ELSE 'OK'
  END AS issue
FROM public.subscriptions
WHERE 
  subscription_type IS NULL
  OR tier IS NULL
  OR (subscription_type = 'company' AND company_id IS NULL)
  OR (subscription_type = 'user' AND company_id IS NOT NULL)
ORDER BY created_at DESC;
