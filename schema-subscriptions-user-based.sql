-- ============================================
-- User-Based Subscription Schema
-- ============================================
-- Subscriptions are tied to USERS, not companies.
-- Users can create companies up to their plan limit.
-- Invited team members get access without needing their own subscription.
-- ============================================

-- 1. First, let's check existing subscriptions table structure
-- and modify it to be user-based

-- Add tier field if not exists
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'starter';

-- Make sure user_id is the primary relationship (not company_id)
-- company_id should be nullable for user-based subscriptions
ALTER TABLE public.subscriptions ALTER COLUMN company_id DROP NOT NULL;

-- Update index for user-based lookups
DROP INDEX IF EXISTS idx_subscriptions_user_id;
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);

-- 2. Drop old RLS policies
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can view subscriptions for their companies" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Owners can insert subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Owners can update subscriptions" ON public.subscriptions;

-- 3. Create new RLS policies for user-based subscriptions
-- Users can view their own subscriptions
CREATE POLICY "Users can view their own subscriptions"
  ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own subscriptions
CREATE POLICY "Users can insert their own subscriptions"
  ON public.subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own subscriptions
CREATE POLICY "Users can update their own subscriptions"
  ON public.subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Superadmins can do everything
CREATE POLICY "Superadmins can manage all subscriptions"
  ON public.subscriptions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role = 'superadmin' 
      AND ur.company_id IS NULL
    )
  );

-- 4. Function to check if user has active subscription
CREATE OR REPLACE FUNCTION public.check_user_subscription(target_user_id UUID)
RETURNS TABLE (
  has_subscription BOOLEAN,
  tier TEXT,
  is_trial BOOLEAN,
  trial_days_remaining INTEGER,
  company_limit INTEGER,
  user_limit INTEGER
) AS $$
DECLARE
  sub RECORD;
  trial_end TIMESTAMPTZ;
  days_remaining INTEGER;
BEGIN
  -- Check for active paid subscription
  SELECT s.* INTO sub
  FROM public.subscriptions s
  WHERE s.user_id = target_user_id
    AND s.status = 'active'
    AND (s.is_trial IS NULL OR s.is_trial = FALSE)
    AND s.end_date > NOW()
  ORDER BY s.end_date DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT 
      TRUE,
      COALESCE(sub.tier, 'starter'),
      FALSE,
      0,
      CASE sub.tier
        WHEN 'starter' THEN 5
        WHEN 'professional' THEN 20
        WHEN 'enterprise' THEN 999999
        ELSE 5
      END,
      CASE sub.tier
        WHEN 'starter' THEN 3
        WHEN 'professional' THEN 10
        WHEN 'enterprise' THEN 999999
        ELSE 3
      END;
    RETURN;
  END IF;

  -- Check for active trial
  SELECT s.* INTO sub
  FROM public.subscriptions s
  WHERE s.user_id = target_user_id
    AND s.is_trial = TRUE
    AND s.status IN ('active', 'trial')
    AND s.trial_ends_at > NOW()
  ORDER BY s.trial_ends_at DESC
  LIMIT 1;

  IF FOUND THEN
    days_remaining := GREATEST(0, EXTRACT(DAY FROM (sub.trial_ends_at - NOW()))::INTEGER);
    RETURN QUERY SELECT 
      TRUE,
      COALESCE(sub.tier, 'starter'),
      TRUE,
      days_remaining,
      5,  -- Trial gets starter limits
      3;
    RETURN;
  END IF;

  -- No active subscription
  RETURN QUERY SELECT FALSE, 'none'::TEXT, FALSE, 0, 0, 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Function to check if user can create more companies
CREATE OR REPLACE FUNCTION public.can_user_create_company(target_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  sub_info RECORD;
  company_count INTEGER;
BEGIN
  -- Get subscription info
  SELECT * INTO sub_info FROM public.check_user_subscription(target_user_id);
  
  IF NOT sub_info.has_subscription THEN
    RETURN FALSE;
  END IF;

  -- Count user's companies
  SELECT COUNT(*) INTO company_count
  FROM public.companies c
  WHERE c.user_id = target_user_id;

  RETURN company_count < sub_info.company_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to get user's company count and limit
CREATE OR REPLACE FUNCTION public.get_user_company_limits(target_user_id UUID)
RETURNS TABLE (
  current_count INTEGER,
  max_allowed INTEGER,
  can_create_more BOOLEAN
) AS $$
DECLARE
  sub_info RECORD;
  company_count INTEGER;
BEGIN
  -- Get subscription info
  SELECT * INTO sub_info FROM public.check_user_subscription(target_user_id);
  
  -- Count user's companies
  SELECT COUNT(*)::INTEGER INTO company_count
  FROM public.companies c
  WHERE c.user_id = target_user_id;

  RETURN QUERY SELECT 
    company_count,
    sub_info.company_limit,
    sub_info.has_subscription AND company_count < sub_info.company_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function to create a user trial subscription
CREATE OR REPLACE FUNCTION public.create_user_trial(target_user_id UUID)
RETURNS UUID AS $$
DECLARE
  new_sub_id UUID;
BEGIN
  -- Check if user already has a subscription
  IF EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = target_user_id
    AND (
      (s.status = 'active' AND s.end_date > NOW())
      OR (s.is_trial = TRUE AND s.trial_ends_at > NOW())
    )
  ) THEN
    RAISE EXCEPTION 'User already has an active subscription or trial';
  END IF;

  -- Create trial subscription
  INSERT INTO public.subscriptions (
    user_id,
    company_id,
    status,
    tier,
    is_trial,
    trial_started_at,
    trial_ends_at,
    start_date,
    end_date
  ) VALUES (
    target_user_id,
    NULL,  -- User-based, not company-based
    'trial',
    'starter',
    TRUE,
    NOW(),
    NOW() + INTERVAL '15 days',
    NOW(),
    NOW() + INTERVAL '15 days'
  )
  RETURNING id INTO new_sub_id;

  RETURN new_sub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_user_subscription(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_user_create_company(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_company_limits(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_trial(UUID) TO authenticated;

-- 9. Migration: Convert existing company-based subscriptions to user-based
-- This updates any existing subscriptions to use the company owner as the user
UPDATE public.subscriptions s
SET user_id = c.user_id
FROM public.companies c
WHERE s.company_id = c.id
AND s.user_id IS NULL;

-- ============================================
-- IMPORTANT: Run this to fix the SELECT policy
-- ============================================
-- If you're getting 406 errors, run this to fix the RLS policy:

-- DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.subscriptions;
-- CREATE POLICY "Users can view their own subscriptions"
--   ON public.subscriptions
--   FOR SELECT
--   USING (auth.uid() = user_id);
