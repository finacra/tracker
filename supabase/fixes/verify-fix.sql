-- Verify the fix is applied correctly
-- Run this to check if the function and policy exist

-- Check if the helper function exists
SELECT 
    proname as function_name,
    pg_get_functiondef(oid) as function_definition
FROM pg_proc 
WHERE proname = 'user_has_company_access';

-- Check the current policy definition
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'user_roles' 
AND policyname = 'Users can view roles for their companies';
