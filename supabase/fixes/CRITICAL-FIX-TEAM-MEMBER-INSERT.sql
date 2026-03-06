-- ============================================
-- CRITICAL FIX: Team Member Insert Not Working
-- ============================================
-- This script ensures team members can be added properly

-- Step 1: Check current policies
-- (Run this first to see what exists)
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
ORDER BY policyname;

-- Step 2: Drop problematic policies that might block INSERT
DROP POLICY IF EXISTS "Admins can manage roles for their companies" ON public.user_roles;

-- Step 3: Create explicit INSERT policy for admins
-- This allows admins to insert user_roles for companies they manage
CREATE POLICY "Admins can insert roles for their companies"
  ON public.user_roles 
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
        AND ur.company_id = user_roles.company_id
        AND ur.role = 'admin'
    )
  );

-- Step 4: Create explicit UPDATE policy for admins
CREATE POLICY "Admins can update roles for their companies"
  ON public.user_roles 
  FOR UPDATE
  TO authenticated
  USING (
    company_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
        AND ur.company_id = user_roles.company_id
        AND ur.role = 'admin'
    )
  )
  WITH CHECK (
    company_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
        AND ur.company_id = user_roles.company_id
        AND ur.role = 'admin'
    )
  );

-- Step 5: Create explicit DELETE policy for admins
CREATE POLICY "Admins can delete roles for their companies"
  ON public.user_roles 
  FOR DELETE
  TO authenticated
  USING (
    company_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
        AND ur.company_id = user_roles.company_id
        AND ur.role = 'admin'
    )
  );

-- Step 6: Ensure superadmins can do everything
-- (This should already exist, but verify)
-- The "Superadmins can manage all roles" policy should handle this

-- Step 7: Grant necessary permissions
GRANT ALL ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO anon;

-- Note: The adminSupabase client should bypass RLS, but these policies
-- ensure that even if RLS is checked, the operations will work.
