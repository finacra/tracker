-- Verification script to check if performance indexes were created successfully
-- Run this to confirm all indexes exist

SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('user_roles', 'auth_identities', 'companies', 'subscriptions', 'regulatory_requirements')
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Count indexes per table
SELECT 
    tablename,
    COUNT(*) as index_count
FROM pg_indexes
WHERE tablename IN ('user_roles', 'auth_identities', 'companies', 'subscriptions', 'regulatory_requirements')
    AND indexname LIKE 'idx_%'
GROUP BY tablename
ORDER BY tablename;

-- Check for duplicate indexes (same columns, different names)
SELECT 
    tablename,
    indexdef,
    COUNT(*) as duplicate_count
FROM pg_indexes
WHERE tablename IN ('user_roles', 'auth_identities', 'companies', 'subscriptions', 'regulatory_requirements')
    AND indexname LIKE 'idx_%'
GROUP BY tablename, indexdef
HAVING COUNT(*) > 1
ORDER BY tablename;
