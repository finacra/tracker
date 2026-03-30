-- Migration: Add NIC code and listing status to companies
--
-- PRODUCTION SAFETY:
--   Step 1 (ADD COLUMN)  — metadata-only in Postgres, instant, zero downtime.
--   Step 2 (UPDATE)      — row-level locks only; reads are never blocked (MVCC).
--                          Runs only on Indian companies with a valid CIN — small set.
--   Step 3 (CREATE INDEX CONCURRENTLY) — builds index without holding a write lock.
--                          CONCURRENTLY cannot run inside a transaction block.
--                          Run this step SEPARATELY after Steps 1–2 if using a
--                          transaction wrapper (e.g. Supabase migrations runner).
--
-- DEPLOYMENT ORDER (critical):
--   1. Run this migration against the database FIRST.
--   2. Deploy the new app code AFTER the migration completes.
--   Reason: new columns are nullable → old app code works fine with them present.
--           New app code fails if columns are missing, so code must never go live first.
--
-- ROLLBACK (if needed):
--   ALTER TABLE companies DROP COLUMN IF EXISTS nic_code;
--   ALTER TABLE companies DROP COLUMN IF EXISTS is_listed;
--   DROP INDEX IF EXISTS idx_companies_nic_code;
--   DROP INDEX IF EXISTS idx_companies_country_code;

-- ────────────────────────────────────────────────────────────────
-- STEP 1: Add columns (instant, non-blocking)
-- ────────────────────────────────────────────────────────────────
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS nic_code  VARCHAR(5),
  ADD COLUMN IF NOT EXISTS is_listed BOOLEAN;

-- ────────────────────────────────────────────────────────────────
-- STEP 2: Backfill existing Indian companies from their CIN
-- CIN structure: [L|U] [5-digit NIC] [2-letter state] [4-digit year] [company type] [6-digit serial]
-- Only rows that already have nic_code = NULL are touched (safe to re-run).
-- ────────────────────────────────────────────────────────────────
UPDATE companies
SET
  nic_code  = SUBSTRING(registration_id, 2, 5),
  is_listed = (SUBSTRING(registration_id, 1, 1) = 'L')
WHERE
  country_code = 'IN'
  AND registration_id IS NOT NULL
  AND nic_code IS NULL
  AND registration_id ~ '^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{2,4}[0-9]{6}$';

-- ────────────────────────────────────────────────────────────────
-- STEP 3: Indexes
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- If your migration runner wraps statements in BEGIN/COMMIT, run
-- these two statements manually in the Supabase SQL editor AFTER
-- the migration file completes.
-- ────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_nic_code
  ON companies (nic_code)
  WHERE nic_code IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_country_code
  ON companies (country_code)
  WHERE country_code IS NOT NULL;
