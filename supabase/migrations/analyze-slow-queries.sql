-- Analyze slow queries to see if indexes are being used
-- Run EXPLAIN ANALYZE on the actual queries being used

-- 1. Check if getCompanySubscriptionState query uses index
EXPLAIN ANALYZE
SELECT * FROM subscriptions
WHERE company_id = '00000000-0000-0000-0000-000000000000'::uuid
AND subscription_type = 'company'
AND (status = 'active' OR is_trial = true)
ORDER BY created_at DESC
LIMIT 1;

-- 2. Check if getUserSubscriptionState query uses index (Passport user)
EXPLAIN ANALYZE
SELECT * FROM (
    SELECT s.*
    FROM subscriptions s
    WHERE s.subscription_type = 'user'
    AND (s.status = 'active' OR s.is_trial = true)
    AND s.app_user_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
    UNION
    SELECT s.*
    FROM subscriptions s
    INNER JOIN auth_identities ai ON ai.legacy_auth_id::uuid = s.user_id::uuid
    WHERE s.subscription_type = 'user'
    AND (s.status = 'active' OR s.is_trial = true)
    AND ai.app_user_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid 
    AND ai.provider = 'supabase'
    UNION
    SELECT s.*
    FROM subscriptions s
    WHERE s.subscription_type = 'user'
    AND (s.status = 'active' OR s.is_trial = true)
    AND s.user_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
    AND NOT EXISTS (SELECT 1 FROM app_users WHERE id::uuid = '00000000-0000-0000-0000-000000000000'::uuid)
) AS combined
ORDER BY created_at DESC
LIMIT 1;

-- 3. Check if hasAnyAccessibleCompany query uses indexes
EXPLAIN ANALYZE
SELECT COUNT(*) as count FROM (
    SELECT 1 FROM companies WHERE app_user_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
    UNION
    SELECT 1 FROM companies c
    WHERE c.user_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
    AND NOT EXISTS (SELECT 1 FROM app_users WHERE id::uuid = '00000000-0000-0000-0000-000000000000'::uuid)
    UNION
    SELECT 1 FROM user_roles WHERE app_user_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid AND company_id IS NOT NULL
    UNION
    SELECT 1 FROM user_roles ur
    INNER JOIN auth_identities ai ON ai.legacy_auth_id::uuid = ur.user_id::uuid
    WHERE ai.app_user_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid 
    AND ai.provider = 'supabase'
    AND ur.company_id IS NOT NULL
    UNION
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
    AND ur.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM app_users WHERE id::uuid = '00000000-0000-0000-0000-000000000000'::uuid)
) AS accessible
LIMIT 1;

-- 4. Check table statistics (if stats are outdated, queries might not use indexes)
SELECT 
    schemaname,
    tablename,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze,
    n_live_tup,
    n_dead_tup
FROM pg_stat_user_tables
WHERE tablename IN ('subscriptions', 'companies', 'user_roles', 'auth_identities')
ORDER BY tablename;
