-- ============================================
-- SET UP CRON JOB FOR AUTO-GENERATION
-- This sets up a daily scheduled job using pg_cron
-- ============================================
-- NOTE: pg_cron must be enabled in your Supabase project
-- Check with: SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================
-- OPTION 1: Direct RPC Call (Simpler, but requires pg_cron)
-- ============================================
-- This directly calls the PostgreSQL function on a schedule
-- NOTE: Remove any existing job with the same name first

-- Remove existing job if it exists
SELECT cron.unschedule('auto-generate-recurring-compliances-daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-generate-recurring-compliances-daily'
);

-- Schedule the job (runs daily at 2 AM UTC)
SELECT cron.schedule(
  'auto-generate-recurring-compliances-daily',
  '0 2 * * *',  -- Daily at 2 AM UTC (adjust timezone as needed)
  $$
  SELECT public.auto_generate_recurring_compliances(6, 12);
  $$
);

-- ============================================
-- OPTION 2: HTTP Call to Edge Function (More flexible)
-- ============================================
-- This calls the Edge Function via HTTP
-- Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY with actual values

-- First, enable http extension if needed
CREATE EXTENSION IF NOT EXISTS http;

-- Then schedule the HTTP call
-- Uncomment and update the URL and key:
/*
SELECT cron.schedule(
  'auto-generate-compliances-via-edge-function',
  '0 2 * * *',  -- Daily at 2 AM UTC
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/auto-generate-compliances',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
*/

-- ============================================
-- VERIFY CRON JOB IS SET UP
-- ============================================

-- List all scheduled cron jobs
SELECT 
  jobid,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job
WHERE jobname LIKE '%auto-generate%' OR jobname LIKE '%compliance%';

-- ============================================
-- USEFUL CRON COMMANDS
-- ============================================

-- View all cron jobs
-- SELECT * FROM cron.job;

-- View cron job execution history
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Update schedule (change to run at 3 AM instead of 2 AM)
-- SELECT cron.alter_job(
--   (SELECT jobid FROM cron.job WHERE jobname = 'auto-generate-recurring-compliances-daily'),
--   schedule := '0 3 * * *'
-- );

-- Pause a cron job
-- SELECT cron.alter_job(
--   (SELECT jobid FROM cron.job WHERE jobname = 'auto-generate-recurring-compliances-daily'),
--   active := false
-- );

-- Resume a cron job
-- SELECT cron.alter_job(
--   (SELECT jobid FROM cron.job WHERE jobname = 'auto-generate-recurring-compliances-daily'),
--   active := true
-- );

-- Delete a cron job
-- SELECT cron.unschedule('auto-generate-recurring-compliances-daily');

-- ============================================
-- ALTERNATIVE: MANUAL TRIGGER (For Testing)
-- ============================================

-- You can also manually trigger the generation:
-- SELECT * FROM public.auto_generate_recurring_compliances(6, 12);
