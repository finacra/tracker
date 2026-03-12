-- Check if critical subscription indexes exist
-- These are the indexes that are causing the 24-second delay if missing

-- Check for idx_subscriptions_company_id (CRITICAL - used in getCompanySubscriptionState)
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'idx_subscriptions_company_id' 
            AND schemaname = 'public'
        ) THEN '✅ EXISTS'
        ELSE '❌ MISSING - THIS IS THE BOTTLENECK!'
    END as idx_subscriptions_company_id_status;

-- Check for idx_subscriptions_company_status_trial
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'idx_subscriptions_company_status_trial' 
            AND schemaname = 'public'
        ) THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as idx_subscriptions_company_status_trial_status;

-- Check for idx_subscriptions_user_status_trial
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'idx_subscriptions_user_status_trial' 
            AND schemaname = 'public'
        ) THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as idx_subscriptions_user_status_trial_status;

-- Check for idx_subscriptions_user_id_status_trial
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'idx_subscriptions_user_id_status_trial' 
            AND schemaname = 'public'
        ) THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as idx_subscriptions_user_id_status_trial_status;

-- Show ALL subscription indexes that exist
SELECT 
    indexname,
    tablename,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
AND tablename = 'subscriptions'
ORDER BY indexname;
