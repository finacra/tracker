-- ============================================
-- CRITICAL FIX: Complete Team Member Addition Fix
-- ============================================
-- Run this ENTIRE script to fix team member addition issues

-- Step 1: Verify current state
SELECT 'Current user_roles policies:' as info;
SELECT 
    policyname,
    cmd as operation,
    CASE WHEN qual IS NOT NULL THEN 'Has USING clause' ELSE 'No USING' END as using_clause,
    CASE WHEN with_check IS NOT NULL THEN 'Has WITH CHECK clause' ELSE 'No WITH CHECK' END as with_check_clause
FROM pg_policies 
WHERE tablename = 'user_roles'
ORDER BY policyname;

-- Step 2: Drop ALL existing policies on user_roles to start fresh
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Superadmins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view roles for their companies" ON public.user_roles;
DROP POLICY IF EXISTS "Superadmins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles for their companies" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles for their companies" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles for their companies" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles for their companies" ON public.user_roles;

-- Step 3: Recreate SELECT policies (for viewing)
-- Users can view their own roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Superadmins can view all roles
CREATE POLICY "Superadmins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- Step 4: Create INSERT policies (for adding team members)
-- Superadmins can insert any role
CREATE POLICY "Superadmins can insert any role"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_superadmin(auth.uid()));

-- Admins can insert roles for companies they manage
-- Note: This policy checks if the current user is an admin of the company
-- The adminSupabase client should bypass RLS, but this ensures it works even if RLS is checked
CREATE POLICY "Admins can insert roles for their companies"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
        AND ur.company_id = user_roles.company_id
        AND ur.role IN ('admin', 'superadmin')
    )
  );

-- Step 5: Create UPDATE policies
CREATE POLICY "Superadmins can update any role"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE POLICY "Admins can update roles for their companies"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (
    company_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
        AND ur.company_id = user_roles.company_id
        AND ur.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    company_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
        AND ur.company_id = user_roles.company_id
        AND ur.role IN ('admin', 'superadmin')
    )
  );

-- Step 6: Create DELETE policies
CREATE POLICY "Superadmins can delete any role"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (public.is_superadmin(auth.uid()));

CREATE POLICY "Admins can delete roles for their companies"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (
    company_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
        AND ur.company_id = user_roles.company_id
        AND ur.role IN ('admin', 'superadmin')
    )
  );

-- Step 7: Ensure helper functions exist
CREATE OR REPLACE FUNCTION public.is_superadmin(p_user_id UUID)
RETURNS BOOLEAN 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id 
      AND role = 'superadmin' 
      AND company_id IS NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_superadmin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin(UUID) TO anon;

-- Step 8: Verify the setup
SELECT 'Setup complete. Current policies:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'user_roles' ORDER BY policyname;
