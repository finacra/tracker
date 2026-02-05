-- ============================================
-- Hybrid Subscription Schema
-- ============================================
-- Supports two subscription models:
-- 1. Company-first (Starter/Professional): Subscription tied to company_id
-- 2. User-first (Enterprise): Subscription tied to user_id with company_id = NULL
-- ============================================

-- 1. Add subscription_type column (without constraint first)
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS subscription_type TEXT;

-- 2. Set default subscription_type for existing rows
UPDATE public.subscriptions
SET subscription_type = 'company'
WHERE subscription_type IS NULL;

-- 3. Migrate Enterprise subscriptions to user-first BEFORE adding constraint
UPDATE public.subscriptions
SET 
  subscription_type = 'user',
  company_id = NULL
WHERE tier = 'enterprise'
  AND subscription_type = 'company';

-- 4. Ensure Starter/Professional subscriptions have company_id
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

-- 5. Mark invalid subscriptions (Starter/Pro without company_id and no companies found)
UPDATE public.subscriptions
SET status = 'cancelled'
WHERE tier IN ('starter', 'professional')
  AND subscription_type = 'company'
  AND company_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.companies c WHERE c.user_id = subscriptions.user_id
  );

-- 6. Now add the CHECK constraint
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS check_subscription_type_company_id;
ALTER TABLE public.subscriptions ADD CONSTRAINT check_subscription_type_company_id CHECK (
  (subscription_type = 'company' AND company_id IS NOT NULL) OR
  (subscription_type = 'user' AND company_id IS NULL)
);

-- 7. Add NOT NULL constraint to subscription_type now that all rows have values
ALTER TABLE public.subscriptions ALTER COLUMN subscription_type SET NOT NULL;
ALTER TABLE public.subscriptions ALTER COLUMN subscription_type SET DEFAULT 'company';

-- Create index for company-based lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_company_id ON public.subscriptions(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_type ON public.subscriptions(subscription_type);

-- 2. Update RLS policies for hybrid model
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can view subscriptions for their companies" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Superadmins can manage all subscriptions" ON public.subscriptions;

-- Users can view subscriptions where:
-- - They are the user (user-first subscriptions)
-- - They own the company (company-first subscriptions)
CREATE POLICY "Users can view their subscriptions"
  ON public.subscriptions
  FOR SELECT
  USING (
    auth.uid() = user_id OR
    (
      company_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = company_id AND c.user_id = auth.uid()
      )
    )
  );

-- Users can insert subscriptions where:
-- - They are the user (for user-first)
-- - They own the company (for company-first)
CREATE POLICY "Users can insert their subscriptions"
  ON public.subscriptions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND (
      (subscription_type = 'user' AND company_id IS NULL) OR
      (
        subscription_type = 'company' AND
        company_id IS NOT NULL AND
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = company_id AND c.user_id = auth.uid()
        )
      )
    )
  );

-- Users can update subscriptions they own or for companies they own
CREATE POLICY "Users can update their subscriptions"
  ON public.subscriptions
  FOR UPDATE
  USING (
    auth.uid() = user_id OR
    (
      company_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = company_id AND c.user_id = auth.uid()
      )
    )
  );

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

-- 3. Function to check if a company has active subscription (for Starter/Professional)
CREATE OR REPLACE FUNCTION public.check_company_subscription(p_company_id UUID)
RETURNS TABLE (
  has_subscription BOOLEAN,
  tier TEXT,
  is_trial BOOLEAN,
  trial_days_remaining INTEGER,
  subscription_id UUID,
  end_date TIMESTAMPTZ
) AS $$
DECLARE
  sub RECORD;
  days_remaining INTEGER;
BEGIN
  -- Check for active paid subscription for this company
  SELECT s.* INTO sub
  FROM public.subscriptions s
  WHERE s.company_id = p_company_id
    AND s.subscription_type = 'company'
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
      sub.id,
      sub.end_date;
    RETURN;
  END IF;

  -- Check for active trial for this company
  SELECT s.* INTO sub
  FROM public.subscriptions s
  WHERE s.company_id = p_company_id
    AND s.subscription_type = 'company'
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
      sub.id,
      sub.trial_ends_at;
    RETURN;
  END IF;

  -- No active subscription
  RETURN QUERY SELECT FALSE, 'none'::TEXT, FALSE, 0, NULL::UUID, NULL::TIMESTAMPTZ;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update check_user_subscription to only check user-first subscriptions (Enterprise)
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
  -- Check for active paid subscription (user-first only)
  SELECT s.* INTO sub
  FROM public.subscriptions s
  WHERE s.user_id = target_user_id
    AND s.subscription_type = 'user'
    AND s.status = 'active'
    AND (s.is_trial IS NULL OR s.is_trial = FALSE)
    AND s.end_date > NOW()
  ORDER BY s.end_date DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT 
      TRUE,
      COALESCE(sub.tier, 'enterprise'),
      FALSE,
      0,
      CASE sub.tier
        WHEN 'enterprise' THEN 100  -- High limit for Enterprise
        ELSE 100
      END,
      CASE sub.tier
        WHEN 'enterprise' THEN 999999
        ELSE 999999
      END;
    RETURN;
  END IF;

  -- Check for active trial (user-first only)
  SELECT s.* INTO sub
  FROM public.subscriptions s
  WHERE s.user_id = target_user_id
    AND s.subscription_type = 'user'
    AND s.is_trial = TRUE
    AND s.status IN ('active', 'trial')
    AND s.trial_ends_at > NOW()
  ORDER BY s.trial_ends_at DESC
  LIMIT 1;

  IF FOUND THEN
    days_remaining := GREATEST(0, EXTRACT(DAY FROM (sub.trial_ends_at - NOW()))::INTEGER);
    RETURN QUERY SELECT 
      TRUE,
      COALESCE(sub.tier, 'enterprise'),
      TRUE,
      days_remaining,
      100,  -- Trial gets enterprise limits
      999999;
    RETURN;
  END IF;

  -- No active subscription
  RETURN QUERY SELECT FALSE, 'none'::TEXT, FALSE, 0, 0, 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Unified function to check company access (routes based on subscription type)
CREATE OR REPLACE FUNCTION public.check_company_access(p_user_id UUID, p_company_id UUID)
RETURNS TABLE (
  has_access BOOLEAN,
  access_type TEXT,
  tier TEXT,
  is_trial BOOLEAN,
  trial_days_remaining INTEGER
) AS $$
DECLARE
  v_is_owner BOOLEAN;
  v_is_invited BOOLEAN;
  v_is_superadmin BOOLEAN;
  v_owner_id UUID;
  company_sub RECORD;
  user_sub RECORD;
  days_remaining INTEGER;
BEGIN
  -- Check if user is superadmin
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id 
    AND role = 'superadmin' 
    AND company_id IS NULL
  ) INTO v_is_superadmin;
  
  IF v_is_superadmin THEN
    RETURN QUERY SELECT TRUE, 'superadmin'::TEXT, 'enterprise'::TEXT, FALSE, 0;
    RETURN;
  END IF;

  -- Check if user is company owner
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = p_company_id AND user_id = p_user_id
  ) INTO v_is_owner;

  -- Get owner ID
  SELECT user_id INTO v_owner_id
  FROM public.companies
  WHERE id = p_company_id;

  -- Check if user is invited (has role but not owner)
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id 
    AND company_id = p_company_id
  ) INTO v_is_invited;

  -- If user is invited member, check owner's subscription
  IF v_is_invited AND NOT v_is_owner AND v_owner_id IS NOT NULL THEN
    -- Check owner's subscription (could be company-first or user-first)
    -- First check if owner has user-first subscription (Enterprise)
    SELECT * INTO user_sub FROM public.check_user_subscription(v_owner_id);
    
    IF user_sub.has_subscription THEN
      RETURN QUERY SELECT TRUE, 'invited'::TEXT, user_sub.tier, user_sub.is_trial, user_sub.trial_days_remaining;
      RETURN;
    END IF;
    
    -- If no user-first, check company-first subscription
    SELECT * INTO company_sub FROM public.check_company_subscription(p_company_id);
    
    IF company_sub.has_subscription THEN
      RETURN QUERY SELECT TRUE, 'invited'::TEXT, company_sub.tier, company_sub.is_trial, company_sub.trial_days_remaining;
      RETURN;
    END IF;
    
    -- Owner has no subscription
    RETURN QUERY SELECT FALSE, 'none'::TEXT, 'none'::TEXT, FALSE, 0;
    RETURN;
  END IF;

  -- If user is owner, check subscription based on tier
  IF v_is_owner THEN
    -- First check if user has Enterprise (user-first) subscription
    SELECT * INTO user_sub FROM public.check_user_subscription(p_user_id);
    
    IF user_sub.has_subscription THEN
      -- User has Enterprise subscription, grant access
      RETURN QUERY SELECT TRUE, 'subscription'::TEXT, user_sub.tier, user_sub.is_trial, user_sub.trial_days_remaining;
      RETURN;
    END IF;
    
    -- Check company-first subscription (Starter/Professional)
    SELECT * INTO company_sub FROM public.check_company_subscription(p_company_id);
    
    IF company_sub.has_subscription THEN
      RETURN QUERY SELECT TRUE, 'subscription'::TEXT, company_sub.tier, company_sub.is_trial, company_sub.trial_days_remaining;
      RETURN;
    END IF;
    
    -- No subscription found
    RETURN QUERY SELECT FALSE, 'none'::TEXT, 'none'::TEXT, FALSE, 0;
    RETURN;
  END IF;

  -- User is neither owner nor invited
  RETURN QUERY SELECT FALSE, 'none'::TEXT, 'none'::TEXT, FALSE, 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to create company trial (for Starter/Professional)
CREATE OR REPLACE FUNCTION public.create_company_trial(p_user_id UUID, p_company_id UUID)
RETURNS UUID AS $$
DECLARE
  new_sub_id UUID;
BEGIN
  -- Verify user owns the company
  IF NOT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = p_company_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'User does not own this company';
  END IF;

  -- Check if company already has an active subscription
  IF EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.company_id = p_company_id
    AND s.subscription_type = 'company'
    AND (
      (s.status = 'active' AND s.end_date > NOW())
      OR (s.is_trial = TRUE AND s.trial_ends_at > NOW())
    )
  ) THEN
    RAISE EXCEPTION 'Company already has an active subscription or trial';
  END IF;

  -- Create trial subscription
  INSERT INTO public.subscriptions (
    user_id,
    company_id,
    subscription_type,
    status,
    tier,
    billing_cycle,
    amount,
    currency,
    is_trial,
    trial_started_at,
    trial_ends_at,
    start_date,
    end_date
  ) VALUES (
    p_user_id,
    p_company_id,
    'company',
    'trial',
    'starter',
    'monthly',
    0,
    'INR',
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

-- 7. Update create_user_trial to only create user-first trials (Enterprise)
CREATE OR REPLACE FUNCTION public.create_user_trial(target_user_id UUID)
RETURNS UUID AS $$
DECLARE
  new_sub_id UUID;
BEGIN
  -- Check if user already has a user-first subscription
  IF EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = target_user_id
    AND s.subscription_type = 'user'
    AND (
      (s.status = 'active' AND s.end_date > NOW())
      OR (s.is_trial = TRUE AND s.trial_ends_at > NOW())
    )
  ) THEN
    RAISE EXCEPTION 'User already has an active subscription or trial';
  END IF;

  -- Create trial subscription (user-first)
  INSERT INTO public.subscriptions (
    user_id,
    company_id,
    subscription_type,
    status,
    tier,
    billing_cycle,
    amount,
    currency,
    is_trial,
    trial_started_at,
    trial_ends_at,
    start_date,
    end_date
  ) VALUES (
    target_user_id,
    NULL,
    'user',
    'trial',
    'enterprise',
    'monthly',
    0,
    'INR',
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

-- 8. Update get_user_company_limits to work with hybrid model
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
  -- Get user-first subscription info (Enterprise)
  SELECT * INTO sub_info FROM public.check_user_subscription(target_user_id);
  
  -- Count user's companies
  SELECT COUNT(*)::INTEGER INTO company_count
  FROM public.companies c
  WHERE c.user_id = target_user_id;

  -- For Enterprise (user-first), return limits
  -- For Starter/Professional (company-first), limits don't apply (each company needs its own subscription)
  IF sub_info.has_subscription THEN
    RETURN QUERY SELECT 
      company_count,
      sub_info.company_limit,
      sub_info.has_subscription AND company_count < sub_info.company_limit;
  ELSE
    -- No Enterprise subscription - company-first model doesn't have user-level limits
    RETURN QUERY SELECT 
      company_count,
      999999,  -- No limit (but each company needs subscription)
      TRUE;  -- Can create, but will need to subscribe
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_company_subscription(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_subscription(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_company_access(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_company_trial(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_trial(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_company_limits(UUID) TO authenticated;
