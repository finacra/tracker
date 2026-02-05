-- ============================================
-- Comprehensive Fix: Resolve ALL subscription_type constraint violations
-- ============================================
-- Run this to fix ALL edge cases before adding constraint
-- ============================================

-- 1. Drop the constraint if it exists
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS check_subscription_type_company_id;

-- 2. Add subscription_type column if it doesn't exist
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS subscription_type TEXT;

-- 3. Handle NULL tier cases first - set default tier
UPDATE public.subscriptions
SET tier = 'starter'
WHERE tier IS NULL;

-- 4. Set default subscription_type for existing rows (company-first by default)
UPDATE public.subscriptions
SET subscription_type = 'company'
WHERE subscription_type IS NULL;

-- 5. Migrate Enterprise subscriptions to user-first
UPDATE public.subscriptions
SET 
  subscription_type = 'user',
  company_id = NULL
WHERE tier = 'enterprise'
  AND subscription_type = 'company';

-- 6. Ensure Starter/Professional subscriptions have company_id
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

-- 7. For Starter/Professional subscriptions without company_id and no companies found:
-- Option A: Cancel them (if they're not active)
UPDATE public.subscriptions
SET status = 'cancelled'
WHERE tier IN ('starter', 'professional')
  AND subscription_type = 'company'
  AND company_id IS NULL
  AND status != 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.companies c WHERE c.user_id = subscriptions.user_id
  );

-- Option B: Convert to user-first trial (if they're active trials)
UPDATE public.subscriptions
SET 
  subscription_type = 'user',
  company_id = NULL,
  tier = 'enterprise'  -- Upgrade to enterprise for user-first
WHERE tier IN ('starter', 'professional')
  AND subscription_type = 'company'
  AND company_id IS NULL
  AND is_trial = TRUE
  AND status IN ('active', 'trial')
  AND NOT EXISTS (
    SELECT 1 FROM public.companies c WHERE c.user_id = subscriptions.user_id
  );

-- 8. Final verification - this should return 0 rows
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
    WHEN subscription_type IS NULL THEN 'MISSING: subscription_type is NULL'
    ELSE 'OK'
  END AS validation_status
FROM public.subscriptions
WHERE 
  subscription_type IS NULL
  OR (subscription_type = 'company' AND company_id IS NULL)
  OR (subscription_type = 'user' AND company_id IS NOT NULL);

-- If the above query returns rows, those need manual review
-- Otherwise, you can proceed to add the constraint in schema-subscriptions-hybrid.sql
