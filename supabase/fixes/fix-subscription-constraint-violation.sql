-- ============================================
-- Fix: Resolve subscription_type constraint violation
-- ============================================
-- Run this BEFORE running schema-subscriptions-hybrid.sql
-- OR if you already ran it and got constraint violation
-- ============================================

-- 1. Drop the constraint if it exists
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS check_subscription_type_company_id;

-- 2. Add subscription_type column if it doesn't exist
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS subscription_type TEXT;

-- 3. Set default subscription_type for existing rows
UPDATE public.subscriptions
SET subscription_type = 'company'
WHERE subscription_type IS NULL;

-- 4. Migrate Enterprise subscriptions to user-first
UPDATE public.subscriptions
SET 
  subscription_type = 'user',
  company_id = NULL
WHERE tier = 'enterprise'
  AND subscription_type = 'company';

-- 5. Ensure Starter/Professional subscriptions have company_id
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

-- 6. Mark invalid subscriptions (Starter/Pro without company_id and no companies found)
UPDATE public.subscriptions
SET status = 'cancelled'
WHERE tier IN ('starter', 'professional')
  AND subscription_type = 'company'
  AND company_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.companies c WHERE c.user_id = subscriptions.user_id
  );

-- 7. Verify data is now compliant (this query should return 0 rows)
SELECT 
  id,
  user_id,
  company_id,
  tier,
  subscription_type,
  status,
  CASE 
    WHEN subscription_type = 'company' AND company_id IS NULL THEN 'VIOLATION: Company-first without company_id'
    WHEN subscription_type = 'user' AND company_id IS NOT NULL THEN 'VIOLATION: User-first with company_id'
    ELSE 'OK'
  END AS validation_status
FROM public.subscriptions
WHERE 
  (subscription_type = 'company' AND company_id IS NULL)
  OR (subscription_type = 'user' AND company_id IS NOT NULL);

-- 8. If the above query returns 0 rows, you can now add the constraint:
-- ALTER TABLE public.subscriptions ADD CONSTRAINT check_subscription_type_company_id CHECK (
--   (subscription_type = 'company' AND company_id IS NOT NULL) OR
--   (subscription_type = 'user' AND company_id IS NULL)
-- );
