-- Verify that our specific performance indexes exist
-- This checks for the exact indexes we created in Phase 1

SELECT 
    tablename,
    indexname,
    CASE 
        WHEN indexname IN (
            'idx_user_roles_app_user_id',
            'idx_user_roles_user_id',
            'idx_user_roles_company_app_user',
            'idx_user_roles_company_user',
            'idx_auth_identities_app_user_legacy',
            'idx_companies_app_user_id',
            'idx_subscriptions_app_user_id',
            'idx_subscriptions_user_id',
            'idx_regulatory_requirements_company_id',
            'idx_regulatory_requirements_due_date',
            'idx_regulatory_requirements_company_due_date',
            'idx_regulatory_requirements_status'
        ) THEN '✅ Our Index'
        ELSE '📋 Existing Index'
    END as index_type
FROM pg_indexes
WHERE tablename IN ('user_roles', 'auth_identities', 'companies', 'subscriptions', 'regulatory_requirements')
    AND (
        indexname LIKE 'idx_user_roles%' OR
        indexname LIKE 'idx_auth_identities%' OR
        indexname LIKE 'idx_companies%' OR
        indexname LIKE 'idx_subscriptions%' OR
        indexname LIKE 'idx_regulatory_requirements%'
    )
ORDER BY tablename, indexname;

-- Count our specific indexes
SELECT 
    COUNT(*) as our_indexes_count,
    COUNT(*) FILTER (WHERE indexname IN (
        'idx_user_roles_app_user_id',
        'idx_user_roles_user_id',
        'idx_user_roles_company_app_user',
        'idx_user_roles_company_user',
        'idx_auth_identities_app_user_legacy',
        'idx_companies_app_user_id',
        'idx_subscriptions_app_user_id',
        'idx_subscriptions_user_id',
        'idx_regulatory_requirements_company_id',
        'idx_regulatory_requirements_due_date',
        'idx_regulatory_requirements_company_due_date',
        'idx_regulatory_requirements_status'
    )) as phase1_indexes_found
FROM pg_indexes
WHERE tablename IN ('user_roles', 'auth_identities', 'companies', 'subscriptions', 'regulatory_requirements')
    AND indexname LIKE 'idx_%';
