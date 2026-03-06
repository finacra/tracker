-- ============================================
-- CRITICAL FIX: Infinite Recursion in user_roles RLS
-- ============================================
-- This script completely fixes the recursion issue by:
-- 1. Removing ALL problematic policies
-- 2. Creating an RPC function that bypasses RLS
-- 3. Ensuring the client can fetch company access

-- Step 1: Drop ALL policies on user_roles that might cause recursion
DROP POLICY IF EXISTS "Users can view roles for their companies" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Superadmins can view all roles" ON public.user_roles;

-- Step 2: Create a secure RPC function that bypasses RLS
-- This function will be used by the client instead of direct queries
CREATE OR REPLACE FUNCTION public.get_user_company_ids(p_user_id UUID)
RETURNS TABLE(company_id UUID) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- This function runs with SECURITY DEFINER, so it bypasses RLS
  RETURN QUERY
  SELECT ur.company_id
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id
    AND ur.company_id IS NOT NULL;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_company_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_company_ids(UUID) TO anon;

-- Step 3: Recreate ONLY the essential policies (simplified)
-- Users can view their own roles (simple check, no recursion)
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Superadmins can view all roles (uses helper function)
CREATE POLICY "Superadmins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- Step 4: Ensure is_superadmin function exists and works
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
