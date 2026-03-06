-- ============================================
-- SUBSCRIPTION TRIAL SUPPORT
-- Run this after schema-subscriptions.sql
-- ============================================

-- Add trial fields to subscriptions table
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT FALSE;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Create index for trial lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_ends_at ON public.subscriptions(trial_ends_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_is_trial ON public.subscriptions(is_trial);

-- ============================================
-- Function to check if user has access to a company
-- Returns: 'subscription', 'trial', 'invited', or NULL (no access)
-- ============================================
CREATE OR REPLACE FUNCTION public.check_company_access(p_user_id UUID, p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_is_owner BOOLEAN;
  v_has_subscription BOOLEAN;
  v_has_trial BOOLEAN;
  v_is_invited BOOLEAN;
  v_is_superadmin BOOLEAN;
BEGIN
  -- Check if user is superadmin (always has access)
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id 
    AND role = 'superadmin' 
    AND company_id IS NULL
  ) INTO v_is_superadmin;
  
  IF v_is_superadmin THEN
    RETURN 'superadmin';
  END IF;

  -- Check if user is company owner
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = p_company_id AND user_id = p_user_id
  ) INTO v_is_owner;

  -- Check if user is invited (has role but not owner)
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id 
    AND company_id = p_company_id
  ) INTO v_is_invited;

  -- If user is invited (not owner), they always have access
  IF v_is_invited AND NOT v_is_owner THEN
    RETURN 'invited';
  END IF;

  -- If user is owner, check subscription/trial status
  IF v_is_owner THEN
    -- Check for active subscription
    SELECT EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = p_user_id
      AND company_id = p_company_id
      AND status = 'active'
      AND is_trial = FALSE
      AND end_date > NOW()
    ) INTO v_has_subscription;

    IF v_has_subscription THEN
      RETURN 'subscription';
    END IF;

    -- Check for active trial
    SELECT EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = p_user_id
      AND company_id = p_company_id
      AND status IN ('active', 'trial')
      AND is_trial = TRUE
      AND trial_ends_at > NOW()
    ) INTO v_has_trial;

    IF v_has_trial THEN
      RETURN 'trial';
    END IF;
  END IF;

  -- No access
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function to create a trial subscription for a company
-- ============================================
CREATE OR REPLACE FUNCTION public.create_trial_subscription(
  p_user_id UUID,
  p_company_id UUID,
  p_trial_days INTEGER DEFAULT 15
)
RETURNS UUID AS $$
DECLARE
  v_subscription_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_trial_end TIMESTAMPTZ := NOW() + (p_trial_days || ' days')::INTERVAL;
BEGIN
  -- Check if trial already exists for this company
  SELECT id INTO v_subscription_id
  FROM public.subscriptions
  WHERE user_id = p_user_id
  AND company_id = p_company_id
  AND is_trial = TRUE;

  IF v_subscription_id IS NOT NULL THEN
    -- Trial already exists, return existing ID
    RETURN v_subscription_id;
  END IF;

  -- Create new trial subscription
  INSERT INTO public.subscriptions (
    user_id,
    company_id,
    tier,
    billing_cycle,
    amount,
    currency,
    status,
    is_trial,
    trial_started_at,
    trial_ends_at,
    start_date,
    end_date
  ) VALUES (
    p_user_id,
    p_company_id,
    'starter',  -- Default trial tier
    'monthly',
    0,          -- Trial is free
    'INR',
    'trial',
    TRUE,
    v_now,
    v_trial_end,
    v_now,
    v_trial_end
  )
  RETURNING id INTO v_subscription_id;

  RETURN v_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function to get trial status for a company
-- Returns days remaining (negative if expired)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_trial_days_remaining(p_user_id UUID, p_company_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_trial_end TIMESTAMPTZ;
  v_days_remaining INTEGER;
BEGIN
  SELECT trial_ends_at INTO v_trial_end
  FROM public.subscriptions
  WHERE user_id = p_user_id
  AND company_id = p_company_id
  AND is_trial = TRUE
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_trial_end IS NULL THEN
    RETURN NULL;
  END IF;

  v_days_remaining := EXTRACT(DAY FROM (v_trial_end - NOW()));
  RETURN v_days_remaining;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
