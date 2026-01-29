-- ============================================
-- TEST: Verify RPC function and SELECT policies work
-- ============================================
-- This will test if the invited user can actually see their role

-- Test 1: Check if RPC function exists and works
SELECT 'Testing RPC function...' as test;
SELECT * FROM public.get_user_company_ids('350e975f-33b1-4024-8160-63b4ae654757');

-- Test 2: Check if direct query works (simulating what the frontend does)
SELECT 'Testing direct query (what frontend does)...' as test;
SELECT 
    company_id
FROM public.user_roles
WHERE user_id = '350e975f-33b1-4024-8160-63b4ae654757'
  AND company_id IS NOT NULL;

-- Test 3: Check current SELECT policies on user_roles
SELECT 'Current SELECT policies:' as test;
SELECT 
    policyname,
    cmd,
    qual as using_clause,
    with_check
FROM pg_policies 
WHERE tablename = 'user_roles' 
  AND cmd = 'SELECT'
ORDER BY policyname;

-- Test 4: Verify the "Users can view their own roles" policy works
-- This simulates what happens when the user queries their own roles
SELECT 'Simulating policy check...' as test;
SELECT 
    ur.id,
    ur.user_id,
    ur.company_id,
    ur.role,
    -- This simulates the policy: auth.uid() = user_id
    CASE 
      WHEN ur.user_id = '350e975f-33b1-4024-8160-63b4ae654757' THEN 'PASS: User matches (policy should allow)'
      ELSE 'FAIL: User does not match'
    END as policy_check
FROM public.user_roles ur
WHERE ur.user_id = '350e975f-33b1-4024-8160-63b4ae654757'
  AND ur.company_id IS NOT NULL;

-- Test 5: Check if company is accessible
SELECT 'Checking company access...' as test;
SELECT 
    c.id,
    c.name,
    c.user_id as owner_id,
    ur.role as user_role,
    CASE 
      WHEN ur.id IS NOT NULL THEN 'User has role - should see company'
      ELSE 'User has no role - cannot see company'
    END as access_status
FROM public.companies c
LEFT JOIN public.user_roles ur ON ur.company_id = c.id 
  AND ur.user_id = '350e975f-33b1-4024-8160-63b4ae654757'
WHERE c.id = '1db1acdf-8a5e-43c3-8eee-4156f314da34';
