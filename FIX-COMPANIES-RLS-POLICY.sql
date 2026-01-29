-- ============================================
-- CRITICAL FIX: Allow users to see companies they have access to via user_roles
-- ============================================
-- The issue: Users can see their user_roles entry, but can't see the company details
-- because there's no RLS policy allowing them to view companies via user_roles

-- Step 1: Check current policies on companies table
SELECT 'Current companies table policies:' as info;
SELECT 
    policyname,
    cmd as operation,
    qual as using_clause,
    with_check
FROM pg_policies 
WHERE tablename = 'companies'
ORDER BY policyname;

-- Step 2: Check if RLS is enabled on companies
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename = 'companies';

-- Step 3: Enable RLS if not already enabled
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop existing policies if they exist (to recreate them properly)
DROP POLICY IF EXISTS "Users can view their own companies" ON public.companies;
DROP POLICY IF EXISTS "Users can view companies they have access to" ON public.companies;
DROP POLICY IF EXISTS "Superadmins can view all companies" ON public.companies;

-- Step 5: Create policy for users to view their own companies (owned)
CREATE POLICY "Users can view their own companies"
  ON public.companies FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Step 6: Create policy for users to view companies they have access to via user_roles
-- This is the critical missing policy!
CREATE POLICY "Users can view companies they have access to"
  ON public.companies FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT company_id 
      FROM public.user_roles
      WHERE user_id = auth.uid() 
        AND company_id IS NOT NULL
    )
  );

-- Step 7: Create policy for superadmins to view all companies
CREATE POLICY "Superadmins can view all companies"
  ON public.companies FOR SELECT
  TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- Step 8: Verify the policies
SELECT 'Updated companies table policies:' as info;
SELECT 
    policyname,
    cmd as operation
FROM pg_policies 
WHERE tablename = 'companies'
ORDER BY policyname;

-- Step 9: Test the policy (replace with actual user_id)
-- This should return the company if the user has a role
SELECT 
    c.id,
    c.name,
    ur.role
FROM public.companies c
JOIN public.user_roles ur ON ur.company_id = c.id
WHERE ur.user_id = '350e975f-33b1-4024-8160-63b4ae654757'
  AND ur.company_id = '1db1acdf-8a5e-43c3-8eee-4156f314da34';
