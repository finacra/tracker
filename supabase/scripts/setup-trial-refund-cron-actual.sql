-- ============================================
-- SETUP: Trial Refund Processing Cron Job
-- Sets up a cron job to process trial verification refunds every hour
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;

-- Schedule the cron job to run every hour
SELECT cron.schedule(
  'process-trial-refunds',                    -- Job name
  '0 * * * *',                                -- Schedule: Every hour at minute 0 (cron format)
  $$
  SELECT
    net.http_post(
      url := 'https://aqziojkjtmyecfglifbc.supabase.co/functions/v1/process-trial-refunds',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxemlvamtqdG15ZWNmZ2xpZmJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyMzI0MTAsImV4cCI6MjA4NDgwODQxMH0.2azPkdmITHjsEw4ObamT8m9Ac2nr4k1lx96qTkqVK10'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Verify the cron job was created
SELECT * FROM cron.job WHERE jobname = 'process-trial-refunds';

-- ============================================
-- To check cron job execution history:
-- SELECT * FROM cron.job_run_details 
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-trial-refunds')
-- ORDER BY start_time DESC
-- LIMIT 10;
--
-- To unschedule the cron job (if needed):
-- SELECT cron.unschedule('process-trial-refunds');
-- ============================================
