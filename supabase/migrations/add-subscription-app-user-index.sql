-- Add index for app_user_id subscriptions to optimize getUserSubscriptionState
-- This makes the UNION query fast without fragile conditional logic
-- Run this with CONCURRENTLY in production for zero-downtime

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_app_user_active
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
