-- Add index for app_user_id subscriptions (transaction-safe version)
-- Use this in Supabase SQL Editor (runs in transaction)
-- For production zero-downtime, use add-subscription-app-user-index.sql with CONCURRENTLY

CREATE INDEX IF NOT EXISTS idx_subscriptions_app_user_active
ON subscriptions(app_user_id, status, is_trial)
WHERE app_user_id IS NOT NULL 
  AND subscription_type = 'user' 
  AND (status = 'active' OR is_trial = true);

-- Verify the index was created
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'subscriptions'
  AND indexname = 'idx_subscriptions_app_user_active';
