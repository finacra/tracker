-- ============================================================================
-- Drop all foreign keys in public.* that reference auth.users(id).
--
-- Why: this project uses Passport JWT auth. Users live in public.app_users,
-- not auth.users. The legacy Supabase-auth SQL schemas under supabase/schemas
-- still carry FK constraints pointing at auth.users, which were never
-- re-pointed when the auth migration landed. On any INSERT into the tables
-- below, Postgres enforces the FK against auth.users, which either fails
-- (Passport user is not in auth.users) or silently leaves user_id NULL.
-- See CLAUDE.md §9.
--
-- This script is idempotent: it uses information_schema to find and drop
-- every FK that targets auth.users at run time. Safe to re-run; does
-- nothing on a clean DB.
--
-- HOW TO APPLY
--   1. Apply to a staging database FIRST and verify application flows
--      (signup, invite accept, subscription, document upload).
--   2. Then apply to production via the Supabase SQL editor or psql.
--
-- WHAT THIS DOES NOT DO
--   - It does NOT delete any data.
--   - It does NOT add replacement FK constraints to public.app_users.
--     That is a follow-up — do it in the Prisma schema so the ORM-level
--     relationships remain consistent.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      tc.table_schema,
      tc.table_name,
      tc.constraint_name
    FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc
      ON  rc.constraint_name   = tc.constraint_name
      AND rc.constraint_schema = tc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON  rc.unique_constraint_name   = ccu.constraint_name
      AND rc.unique_constraint_schema = ccu.constraint_schema
    WHERE tc.table_schema = 'public'
      AND ccu.table_schema = 'auth'
      AND ccu.table_name   = 'users'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      r.table_schema, r.table_name, r.constraint_name
    );
    RAISE NOTICE 'Dropped FK % on %.%',
      r.constraint_name, r.table_schema, r.table_name;
  END LOOP;
END $$;

-- Sanity check — should return zero rows after a successful run.
SELECT
  tc.table_schema,
  tc.table_name,
  tc.constraint_name
FROM information_schema.referential_constraints rc
JOIN information_schema.table_constraints tc
  ON  rc.constraint_name   = tc.constraint_name
  AND rc.constraint_schema = tc.constraint_schema
JOIN information_schema.constraint_column_usage ccu
  ON  rc.unique_constraint_name   = ccu.constraint_name
  AND rc.unique_constraint_schema = ccu.constraint_schema
WHERE tc.table_schema = 'public'
  AND ccu.table_schema = 'auth'
  AND ccu.table_name   = 'users';
