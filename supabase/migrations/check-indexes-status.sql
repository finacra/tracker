-- Quick diagnostic to check if performance indexes exist
-- Run this to see which indexes are missing

SELECT 
    'Missing Critical Indexes' as status,
    COUNT(*) as missing_count
FROM (
    SELECT 'idx_subscriptions_company_id' as index_name
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_subscriptions_company_id' 
        AND schemaname = 'public'
    )
    UNION ALL
    SELECT 'idx_subscriptions_company_status_trial'
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_subscriptions_company_status_trial' 
        AND schemaname = 'public'
    )
    UNION ALL
    SELECT 'idx_subscriptions_user_status_trial'
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_subscriptions_user_status_trial' 
        AND schemaname = 'public'
    )
    UNION ALL
    SELECT 'idx_subscriptions_user_id_status_trial'
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_subscriptions_user_id_status_trial' 
        AND schemaname = 'public'
    )
    UNION ALL
    SELECT 'idx_auth_identities_legacy_auth_id'
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_auth_identities_legacy_auth_id' 
        AND schemaname = 'public'
    )
) AS missing;

-- Show all subscription-related indexes
SELECT 
    indexname,
    tablename,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
AND tablename = 'subscriptions'
AND indexname LIKE 'idx_%'
ORDER BY indexname;

-- Show all auth_identities indexes
SELECT 
    indexname,
    tablename,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
AND tablename = 'auth_identities'
AND indexname LIKE 'idx_%'
ORDER BY indexname;
