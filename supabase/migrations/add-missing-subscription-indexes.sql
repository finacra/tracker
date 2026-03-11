-- CRITICAL: Missing indexes for subscription queries
-- These are causing slow queries in getCompanySubscriptionState and getUserSubscriptionState

-- Index for company subscriptions (MISSING - this is likely the bottleneck!)
CREATE INDEX IF NOT EXISTS idx_subscriptions_company_id 
ON subscriptions(company_id) 
WHERE company_id IS NOT NULL AND subscription_type = 'company';

-- Composite index for company subscriptions with status/trial (for getCompanySubscriptionState)
CREATE INDEX IF NOT EXISTS idx_subscriptions_company_status_trial 
ON subscriptions(company_id, status, is_trial) 
WHERE company_id IS NOT NULL AND subscription_type = 'company';

-- Composite index for user subscriptions with status/trial (for getUserSubscriptionState)
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status_trial 
ON subscriptions(app_user_id, status, is_trial) 
WHERE app_user_id IS NOT NULL AND subscription_type = 'user' AND (status = 'active' OR is_trial = true);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id_status_trial 
ON subscriptions(user_id, status, is_trial) 
WHERE user_id IS NOT NULL AND subscription_type = 'user' AND (status = 'active' OR is_trial = true);

-- Index for auth_identities legacy_auth_id (for JOIN in getUserSubscriptionState)
CREATE INDEX IF NOT EXISTS idx_auth_identities_legacy_auth_id 
ON auth_identities(legacy_auth_id) 
WHERE legacy_auth_id IS NOT NULL AND provider = 'supabase';

-- Analyze tables to update query planner
ANALYZE subscriptions;
ANALYZE auth_identities;
