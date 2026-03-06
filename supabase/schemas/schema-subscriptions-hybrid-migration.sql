-- ============================================
-- Migration: Convert existing subscriptions to hybrid model
-- ============================================
-- Run this AFTER schema-subscriptions-hybrid.sql
-- ============================================

-- 1. Set default subscription_type for existing subscriptions
UPDATE public.subscriptions
SET subscription_type = 'company'
WHERE subscription_type IS NULL;

-- 2. Migrate Enterprise subscriptions to user-first
UPDATE public.subscriptions
SET 
  subscription_type = 'user',
  company_id = NULL
WHERE tier = 'enterprise'
  AND subscription_type = 'company';

-- 3. Ensure Starter/Professional subscriptions are company-first
-- If a Starter/Pro subscription has company_id = NULL, try to find user's first company
UPDATE public.subscriptions s
SET company_id = (
  SELECT c.id
  FROM public.companies c
  WHERE c.user_id = s.user_id
  ORDER BY c.created_at ASC
  LIMIT 1
)
WHERE s.tier IN ('starter', 'professional')
  AND s.subscription_type = 'company'
  AND s.company_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.companies c WHERE c.user_id = s.user_id
  );

-- 4. Mark invalid subscriptions (Starter/Pro without company_id and no companies found)
-- These will need manual review
UPDATE public.subscriptions
SET status = 'cancelled'
WHERE tier IN ('starter', 'professional')
  AND subscription_type = 'company'
  AND company_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.companies c WHERE c.user_id = subscriptions.user_id
  );

-- 5. Verify migration
-- Check for any remaining invalid states
SELECT 
  id,
  user_id,
  company_id,
  tier,
  subscription_type,
  status,
  CASE 
    WHEN subscription_type = 'company' AND company_id IS NULL THEN 'INVALID: Company-first without company_id'
    WHEN subscription_type = 'user' AND company_id IS NOT NULL THEN 'INVALID: User-first with company_id'
    ELSE 'OK'
  END AS validation_status
FROM public.subscriptions
WHERE 
  (subscription_type = 'company' AND company_id IS NULL)
  OR (subscription_type = 'user' AND company_id IS NOT NULL)
ORDER BY created_at DESC;

-- If the above query returns rows, those subscriptions need manual review
