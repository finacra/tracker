-- ============================================
-- APP-OWNED IDENTITY SCHEMA
-- Canonical application users and auth-provider mappings
-- Supports current Supabase auth and future Passport migration
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. APP USERS
-- Canonical user record owned by the application
-- ============================================
CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  primary_email TEXT NOT NULL,
  full_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.app_users IS 'Canonical application-owned user identity';
COMMENT ON COLUMN public.app_users.primary_email IS 'Primary email used by the application for user identity';
COMMENT ON COLUMN public.app_users.status IS 'Application-level user lifecycle state';

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_primary_email_lower
  ON public.app_users (LOWER(primary_email));

-- ============================================
-- 2. AUTH IDENTITIES
-- Maps provider identities to canonical app users
-- ============================================
CREATE TABLE IF NOT EXISTS public.auth_identities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  app_user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('supabase', 'passport')),
  legacy_auth_id TEXT,
  email TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.auth_identities IS 'Provider-to-app-user identity bridge table';
COMMENT ON COLUMN public.auth_identities.legacy_auth_id IS 'Provider-specific user identifier such as Supabase auth user id or Passport provider subject';
COMMENT ON COLUMN public.auth_identities.is_primary IS 'Marks the preferred identity row for a canonical app user';

CREATE INDEX IF NOT EXISTS idx_auth_identities_app_user_id
  ON public.auth_identities(app_user_id);

CREATE INDEX IF NOT EXISTS idx_auth_identities_email_lower
  ON public.auth_identities (LOWER(email));

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_identities_provider_legacy_auth_id
  ON public.auth_identities(provider, legacy_auth_id)
  WHERE legacy_auth_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_identities_one_primary_per_user
  ON public.auth_identities(app_user_id)
  WHERE is_primary = TRUE;

-- ============================================
-- 3. UPDATED_AT TRIGGER
-- Keeps app_users.updated_at fresh without app-side boilerplate
-- ============================================
CREATE OR REPLACE FUNCTION public.set_app_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_app_users_updated_at ON public.app_users;
CREATE TRIGGER trg_set_app_users_updated_at
  BEFORE UPDATE ON public.app_users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_app_users_updated_at();

-- ============================================
-- 4. SECURITY
-- Keep identity tables server-managed by default
-- ============================================
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_identities ENABLE ROW LEVEL SECURITY;

-- No client-facing policies are created here intentionally.
-- Access should go through trusted server-side code and service-role operations.
