-- ============================================
-- MIGRATION: Handle Existing Users for Email Verification
-- Run this AFTER schema-email-verification.sql
-- ============================================
-- This migration handles users who signed up before email verification was implemented

-- 1. Auto-verify existing email/password users (they've been using the system)
--    Only verify users who have password_hash (email/password auth)
UPDATE public.app_users
SET 
  email_verified = TRUE,
  email_verified_at = created_at  -- Use account creation date as verification date
WHERE 
  password_hash IS NOT NULL 
  AND password_hash != ''
  AND email_verified = FALSE;

-- 2. Auto-verify Google OAuth users (emails are verified by Google)
UPDATE public.app_users
SET 
  email_verified = TRUE,
  email_verified_at = created_at
WHERE 
  id IN (
    SELECT DISTINCT ai.app_user_id
    FROM public.auth_identities ai
    WHERE ai.provider = 'passport'
      AND ai.legacy_auth_id IS NOT NULL
      AND ai.legacy_auth_id != ''
  )
  AND (password_hash IS NULL OR password_hash = '')
  AND email_verified = FALSE;

-- 3. Show summary
SELECT 
  'Migration Summary' as status,
  COUNT(*) FILTER (WHERE email_verified = TRUE) as verified_users,
  COUNT(*) FILTER (WHERE email_verified = FALSE) as unverified_users,
  COUNT(*) FILTER (WHERE password_hash IS NOT NULL AND password_hash != '') as email_password_users,
  COUNT(*) FILTER (WHERE password_hash IS NULL OR password_hash = '') as oauth_users
FROM public.app_users;
