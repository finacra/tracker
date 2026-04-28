-- ============================================================================
-- Document ingest worker — pg_cron schedule
--
-- WHY: Vault (and onboarding) uploads complete instantly as dumb
-- storage so the user doesn't wait. The heavy AI extraction work runs
-- out-of-band via the `document_ingest_jobs` queue. This cron tick
-- POSTs to the Vercel /api/jobs/run-ingest endpoint every 30 seconds;
-- the endpoint claims and processes a batch of pending jobs.
--
-- Auth: a shared secret is set in Postgres GUC (`app.ingest_worker_secret`)
-- and forwarded as the `x-ingest-secret` header. The endpoint
-- authenticates against `INGEST_WORKER_SECRET` env var on Vercel.
--
-- WORKER SECRET SETUP (one-time, set via Supabase SQL editor):
--   ALTER DATABASE postgres SET app.ingest_worker_url = 'https://www.finacra.com/api/jobs/run-ingest';
--   ALTER DATABASE postgres SET app.ingest_worker_secret = '<generate-32-byte-hex>';
-- The same secret must be set in Vercel as INGEST_WORKER_SECRET.
--
-- Schedule: every 30 seconds. Uses '30 seconds' interval syntax which
-- pg_cron supports as a sub-minute job. If the host pg_cron version
-- does not support sub-minute (older Supabase pools), fall back to a
-- '* * * * *' once-per-minute schedule.
--
-- Idempotent: every CREATE uses IF NOT EXISTS / OR REPLACE; cron job
-- is unscheduled and rescheduled atomically so re-running this
-- migration is safe.
-- ============================================================================

-- 1. Helper function — POSTs to the worker endpoint with the shared
--    secret. Returns the http request id (pg_net is async; the response
--    is captured in net._http_response by Supabase, no need to handle
--    here).
CREATE OR REPLACE FUNCTION public.fire_ingest_worker()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  url    TEXT;
  secret TEXT;
  rid    BIGINT;
BEGIN
  url    := current_setting('app.ingest_worker_url', true);
  secret := current_setting('app.ingest_worker_secret', true);
  IF url IS NULL OR url = '' THEN
    RAISE NOTICE '[fire_ingest_worker] app.ingest_worker_url not set; skipping';
    RETURN NULL;
  END IF;
  IF secret IS NULL OR secret = '' THEN
    RAISE NOTICE '[fire_ingest_worker] app.ingest_worker_secret not set; skipping';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := url,
    headers := jsonb_build_object('x-ingest-secret', secret, 'content-type', 'application/json'),
    body    := jsonb_build_object('source', 'pg_cron', 'fired_at', NOW())
  ) INTO rid;

  RETURN rid;
END
$$;

-- 2. Schedule it. Try sub-minute first, fall back to once-per-minute.
DO $$
BEGIN
  PERFORM cron.unschedule('document-ingest-worker');
EXCEPTION
  WHEN OTHERS THEN NULL;
END
$$;

-- pg_cron 1.5+ supports '30 seconds'. Older versions need '* * * * *'.
DO $$
BEGIN
  BEGIN
    PERFORM cron.schedule(
      'document-ingest-worker',
      '30 seconds',
      'SELECT public.fire_ingest_worker();'
    );
    RAISE NOTICE '[ingest-cron] scheduled at 30s interval';
  EXCEPTION WHEN OTHERS THEN
    -- Fallback to per-minute schedule.
    PERFORM cron.schedule(
      'document-ingest-worker',
      '* * * * *',
      'SELECT public.fire_ingest_worker();'
    );
    RAISE NOTICE '[ingest-cron] scheduled at 1-min interval (sub-minute not supported)';
  END;
END
$$;
