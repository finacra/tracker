-- ============================================
-- SUBSCRIPTIONS & PAYMENTS SCHEMA
-- ============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. SUBSCRIPTIONS TABLE
-- Stores user/company subscriptions
-- ============================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('starter', 'professional', 'enterprise')),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'quarterly', 'half-yearly', 'annual')),
  amount DECIMAL(10, 2) NOT NULL, -- Amount in rupees
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'cancelled', 'expired', 'pending', 'trial')),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  razorpay_subscription_id TEXT, -- Razorpay subscription ID (for recurring)
  razorpay_plan_id TEXT, -- Razorpay plan ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_company_id ON public.subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON public.subscriptions(end_date);

-- ============================================
-- 2. PAYMENTS TABLE
-- Stores payment transactions
-- ============================================
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  razorpay_order_id TEXT NOT NULL,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  amount DECIMAL(10, 2) NOT NULL, -- Amount in rupees
  amount_paid DECIMAL(10, 2) DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
  payment_method TEXT, -- 'card', 'upi', 'netbanking', 'wallet', etc.
  tier TEXT NOT NULL CHECK (tier IN ('starter', 'professional', 'enterprise')),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'quarterly', 'half-yearly', 'annual')),
  receipt TEXT,
  notes JSONB,
  error_code TEXT,
  error_description TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON public.payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id ON public.payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_payment_id ON public.payments(razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- Unique constraint on Razorpay order ID
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_razorpay_order_unique ON public.payments(razorpay_order_id);

-- ============================================
-- 3. RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then create new ones
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can view their own payments" ON public.payments;
DROP POLICY IF EXISTS "Users can insert their own payments" ON public.payments;

-- Subscriptions: Users can view their own subscriptions
CREATE POLICY "Users can view their own subscriptions"
  ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Subscriptions: Users can insert their own subscriptions
CREATE POLICY "Users can insert their own subscriptions"
  ON public.subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Subscriptions: Users can update their own subscriptions
CREATE POLICY "Users can update their own subscriptions"
  ON public.subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Payments: Users can view their own payments
CREATE POLICY "Users can view their own payments"
  ON public.payments
  FOR SELECT
  USING (auth.uid() = user_id);

-- Payments: Users can insert their own payments
CREATE POLICY "Users can insert their own payments"
  ON public.payments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Payments: System can update payments (via service role)
-- Note: This requires service role key, handled in API routes

-- ============================================
-- 4. FUNCTIONS
-- ============================================

-- Function to get active subscription for a user
CREATE OR REPLACE FUNCTION get_active_subscription(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  tier TEXT,
  billing_cycle TEXT,
  status TEXT,
  end_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.tier,
    s.billing_cycle,
    s.status,
    s.end_date
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
    AND s.end_date > NOW()
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has active subscription
CREATE OR REPLACE FUNCTION has_active_subscription(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND end_date > NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
