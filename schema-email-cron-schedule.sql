-- Schedule pg_cron job for flush-email-queue Edge Function
-- Run this in Supabase SQL Editor AFTER deploying the Edge Function
--
-- This job runs every 5 minutes to batch and send queued status change emails.
-- Prerequisites:
-- 1. Deploy the flush-email-queue Edge Function
-- 2. Set Edge Function secrets: RESEND_API_KEY, RESEND_FROM, NEXT_PUBLIC_SITE_URL
-- 3. Store the Edge Function URL and auth key in Vault (below)

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Store secrets in Vault
-- Replace the placeholder values with your actual Edge Function URL and anon key
-- ─────────────────────────────────────────────────────────────────────────────

-- Edge Function URL (get this from Supabase Dashboard > Edge Functions > flush-email-queue)
-- Example: https://YOUR-PROJECT-REF.supabase.co/functions/v1/flush-email-queue
SELECT vault.create_secret(
  'https://YOUR-PROJECT-REF.supabase.co/functions/v1/flush-email-queue',
  'flush_email_queue_url'
);

-- Supabase anon key (needed for Bearer token auth)
-- Get this from Supabase Dashboard > Settings > API > anon public key
SELECT vault.create_secret(
  'YOUR_SUPABASE_ANON_KEY',
  'supabase_anon_key'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Schedule the cron job (every 5 minutes)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.schedule(
  'flush-email-queue-5min',
  '*/5 * * * *',  -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'flush_email_queue_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_anon_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Verify the job was created
-- ─────────────────────────────────────────────────────────────────────────────

SELECT * FROM cron.job ORDER BY jobid DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- Optional: Weekly cleanup of old processed queue entries
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.schedule(
  'cleanup-email-batch-queue-weekly',
  '0 4 * * 0',  -- Every Sunday at 4 AM UTC
  $$
  SELECT cleanup_old_email_batch_queue();
  $$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Troubleshooting: View cron job execution history
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- ─────────────────────────────────────────────────────────────────────────────
-- To unschedule a job (if needed)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT cron.unschedule('flush-email-queue-5min');
