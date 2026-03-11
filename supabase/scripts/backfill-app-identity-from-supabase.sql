-- ============================================
-- BACKFILL APP IDENTITY FROM SUPABASE AUTH
-- Creates canonical app_users and auth_identities for existing auth.users
-- Idempotent: safe to re-run after reviewing the verification queries below
-- ============================================

BEGIN;

-- Safety checks: the app-owned identity schema must exist first.
DO $$
BEGIN
  IF to_regclass('public.app_users') IS NULL THEN
    RAISE EXCEPTION 'Missing table public.app_users. Run schema-app-identity.sql first.';
  END IF;

  IF to_regclass('public.auth_identities') IS NULL THEN
    RAISE EXCEPTION 'Missing table public.auth_identities. Run schema-app-identity.sql first.';
  END IF;
END $$;

-- ============================================
-- 1. STAGE SOURCE USERS
-- Only include auth users with a non-empty email and no soft deletion.
-- ============================================
CREATE TEMP TABLE tmp_supabase_identity_source AS
SELECT
  u.id AS supabase_user_id,
  LOWER(TRIM(u.email)) AS normalized_email,
  TRIM(u.email) AS original_email,
  NULLIF(
    COALESCE(
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      u.raw_user_meta_data->>'display_name'
    ),
    ''
  ) AS full_name,
  u.raw_user_meta_data AS user_metadata,
  u.created_at
FROM auth.users u
WHERE COALESCE(TRIM(u.email), '') <> ''
  AND u.deleted_at IS NULL;

CREATE INDEX ON tmp_supabase_identity_source(supabase_user_id);
CREATE INDEX ON tmp_supabase_identity_source(normalized_email);

-- ============================================
-- 2. CREATE OR REUSE CANONICAL APP USERS
-- The canonical record is keyed by normalized primary email.
-- ============================================
INSERT INTO public.app_users (
  primary_email,
  full_name,
  status
)
SELECT DISTINCT ON (src.normalized_email)
  src.original_email,
  src.full_name,
  'active'
FROM tmp_supabase_identity_source src
LEFT JOIN public.app_users au
  ON LOWER(au.primary_email) = src.normalized_email
WHERE au.id IS NULL
ORDER BY src.normalized_email, src.created_at ASC;

-- Fill missing names on already-created canonical users when the staged source has one.
UPDATE public.app_users au
SET full_name = src.full_name
FROM (
  SELECT DISTINCT ON (normalized_email)
    normalized_email,
    full_name,
    created_at
  FROM tmp_supabase_identity_source
  WHERE full_name IS NOT NULL
  ORDER BY normalized_email, created_at ASC
) src
WHERE LOWER(au.primary_email) = src.normalized_email
  AND au.full_name IS NULL;

-- ============================================
-- 3. MAP SUPABASE AUTH USERS TO AUTH IDENTITIES
-- One row per provider identity; provider is currently "supabase".
-- ============================================
INSERT INTO public.auth_identities (
  app_user_id,
  provider,
  legacy_auth_id,
  email,
  is_primary,
  metadata
)
SELECT
  au.id,
  'supabase',
  src.supabase_user_id::text,
  src.original_email,
  NOT EXISTS (
    SELECT 1
    FROM public.auth_identities existing_primary
    WHERE existing_primary.app_user_id = au.id
      AND existing_primary.is_primary = TRUE
  ) AS is_primary,
  jsonb_build_object(
    'source', 'backfill-app-identity-from-supabase',
    'supabase_user_id', src.supabase_user_id,
    'backfilled_at', NOW(),
    'raw_user_meta_data', COALESCE(src.user_metadata, '{}'::jsonb)
  )
FROM tmp_supabase_identity_source src
JOIN public.app_users au
  ON LOWER(au.primary_email) = src.normalized_email
LEFT JOIN public.auth_identities ai
  ON ai.provider = 'supabase'
 AND ai.legacy_auth_id = src.supabase_user_id::text
WHERE ai.id IS NULL;

COMMIT;

-- ============================================
-- VERIFICATION QUERIES
-- Run these after the transaction to confirm backfill quality.
-- ============================================

-- 1. How many active auth.users were eligible for backfill?
SELECT COUNT(*) AS eligible_supabase_users
FROM auth.users u
WHERE COALESCE(TRIM(u.email), '') <> ''
  AND u.deleted_at IS NULL;

-- 2. How many supabase auth identities were created?
SELECT COUNT(*) AS supabase_identity_rows
FROM public.auth_identities
WHERE provider = 'supabase';

-- 3. Which eligible auth.users still do not have an auth_identities row?
SELECT
  u.id,
  u.email,
  u.created_at
FROM auth.users u
LEFT JOIN public.auth_identities ai
  ON ai.provider = 'supabase'
 AND ai.legacy_auth_id = u.id::text
WHERE COALESCE(TRIM(u.email), '') <> ''
  AND u.deleted_at IS NULL
  AND ai.id IS NULL
ORDER BY u.created_at ASC;

-- 4. Check for canonical users missing a primary identity.
SELECT
  au.id,
  au.primary_email
FROM public.app_users au
LEFT JOIN public.auth_identities ai
  ON ai.app_user_id = au.id
 AND ai.is_primary = TRUE
WHERE ai.id IS NULL
ORDER BY au.created_at ASC;

-- ============================================
-- ROLLBACK GUIDANCE
-- If you need to undo this backfill before runtime cutover:
-- 1. Delete auth_identities rows where metadata->>'source' equals this script name.
-- 2. Delete app_users that have no remaining auth_identities rows.
-- 3. Re-run the verification queries to confirm cleanup.
-- ============================================
