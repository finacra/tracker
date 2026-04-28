-- ============================================================================
-- Historical-name pollution watchdog
--
-- WHY: PR #58/#60 fixed two classes of bad data in regulatory_requirements:
--   1. Wrong-suffix:    "ESI ... — For Dec 2026" with period_label = "For Jul 2025"
--   2. Compound-suffix: "DPT-3 ... — Jun 2025 — Jun 2024"
-- We don't want either class to ever come back silently. Schema-level constraint
-- isn't possible (the names are constructed at INSERT time and depend on a
-- separate `period_label` column), so this runs as a weekly pg_cron job.
--
-- WHAT: A SQL function that detects polluted rows by comparing each row's
-- requirement against its expected canonical form (baseName — period_label)
-- after iteratively stripping period suffixes. Findings get inserted into
-- `compliance_pollution_audit` with a sample, and the row count.
--
-- This is purely OBSERVATIONAL — it never auto-mutates production data. If
-- pollution is detected, scripts/fix-historical-names.js (also idempotent)
-- is the remediation path.
--
-- Cron schedule: Mondays at 03:37 UTC (= 09:07 IST). Off the :00/:30 mark.
-- Idempotent: every CREATE uses IF NOT EXISTS / OR REPLACE.
-- ============================================================================

-- 1. Audit table — one row per check run
CREATE TABLE IF NOT EXISTS public.compliance_pollution_audit (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rows_scanned    INTEGER NOT NULL,
  rows_polluted   INTEGER NOT NULL,
  by_company      JSONB NOT NULL DEFAULT '[]'::jsonb,
  samples         JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS compliance_pollution_audit_checked_at_idx
  ON public.compliance_pollution_audit (checked_at DESC);

-- 2. Suffix-strip helper: matches the same regex used by
--    actions-intelligence.ts and scripts/fix-historical-names.js.
--    Iterates up to 8x to fully strip compound suffixes.
CREATE OR REPLACE FUNCTION public.strip_period_suffix(name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  prev_val TEXT;
  curr_val TEXT;
  i        INT := 0;
BEGIN
  IF name IS NULL THEN RETURN NULL; END IF;
  curr_val := name;
  LOOP
    prev_val := curr_val;
    curr_val := regexp_replace(
      curr_val,
      '\s*[—–-]\s*(?:Monthly|Quarterly|Annual|Half-Yearly|Half-yearly|For\s+|Q[1-4]\s+|H[12]\s+)*(?:For\s+)?(?:Q[1-4]\s+)?(?:H[12]\s+)?[A-Za-z]{3,9}\s+\d{4}\s*$',
      '',
      'i'
    );
    curr_val := btrim(curr_val);
    EXIT WHEN curr_val = prev_val OR i >= 8;
    i := i + 1;
  END LOOP;
  RETURN curr_val;
END
$$;

-- 3. Detection function — counts polluted rows + writes one audit row.
--    Returns the count so a manual call (`SELECT public.check_compliance_pollution()`)
--    is informative.
CREATE OR REPLACE FUNCTION public.check_compliance_pollution()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  scanned INTEGER;
  polluted INTEGER;
  by_company_json JSONB;
  samples_json JSONB;
BEGIN
  WITH scope AS (
    SELECT
      id,
      company_id,
      requirement,
      period_label,
      due_date,
      -- Canonical form: fully-stripped base + " — " + period_label
      public.strip_period_suffix(requirement) || ' — ' || period_label AS canonical_name
    FROM public.regulatory_requirements
    WHERE period_label  IS NOT NULL
      AND period_key    IS NOT NULL
      AND due_date_formula IS NOT NULL
  ),
  bad AS (
    SELECT *
    FROM scope
    WHERE requirement <> canonical_name
      -- and the row actually has SOME period suffix to begin with
      AND requirement ~* '\s*[—–-]\s*(?:Monthly|Quarterly|Annual|Half-Yearly|Half-yearly|For\s+|Q[1-4]\s+|H[12]\s+)*(?:For\s+)?(?:Q[1-4]\s+)?(?:H[12]\s+)?[A-Za-z]{3,9}\s+\d{4}\s*$'
  )
  SELECT
    (SELECT count(*) FROM scope),
    (SELECT count(*) FROM bad),
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('company_id', company_id, 'n', n))
       FROM (
         SELECT company_id::text, count(*)::int AS n
         FROM bad GROUP BY company_id ORDER BY count(*) DESC LIMIT 10
       ) t),
      '[]'::jsonb
    ),
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'company_id', company_id,
        'requirement', requirement,
        'period_label', period_label,
        'expected', canonical_name,
        'due_date', due_date
       ))
       FROM (SELECT * FROM bad LIMIT 8) t),
      '[]'::jsonb
    )
  INTO scanned, polluted, by_company_json, samples_json;

  INSERT INTO public.compliance_pollution_audit
    (rows_scanned, rows_polluted, by_company, samples)
    VALUES (scanned, polluted, by_company_json, samples_json);

  -- Loud log so it's visible in Postgres logs even when nobody reads the table.
  IF polluted > 0 THEN
    RAISE WARNING '[pollution-watchdog] % polluted rows detected (scanned %): %',
      polluted, scanned, samples_json;
  ELSE
    RAISE NOTICE '[pollution-watchdog] OK — 0 polluted rows (scanned %)', scanned;
  END IF;

  RETURN polluted;
END
$$;

-- 4. Schedule it weekly via pg_cron. Mondays 03:37 UTC = 09:07 IST.
--    Off the :00/:30 marks per cron-traffic etiquette.
--    Unschedule any prior version first so re-running this migration is safe.
DO $$
BEGIN
  -- cron.unschedule throws if the name doesn't exist; swallow that.
  PERFORM cron.unschedule('compliance-pollution-watchdog');
EXCEPTION
  WHEN OTHERS THEN NULL;
END
$$;

SELECT cron.schedule(
  'compliance-pollution-watchdog',
  '37 3 * * 1',                                     -- Mon 03:37 UTC weekly
  $cron$ SELECT public.check_compliance_pollution(); $cron$
);
