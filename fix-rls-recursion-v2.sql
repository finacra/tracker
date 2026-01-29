-- Fix infinite recursion in user_roles RLS policy (Enhanced version)
-- Run this script to fix the "infinite recursion detected in policy" error

-- First, drop ALL policies on user_roles that might cause recursion
DROP POLICY IF EXISTS "Users can view roles for their companies" ON public.user_roles;

-- Create or replace the helper function (must use SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.user_has_company_access(p_user_id UUID, p_company_id UUID)
RETURNS BOOLEAN 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- This function bypasses RLS because of SECURITY DEFINER
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_roles
    WHERE user_id = p_user_id 
      AND company_id = p_company_id
      AND company_id IS NOT NULL
  );
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.user_has_company_access(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_company_access(UUID, UUID) TO anon;

-- Recreate the policy using the helper function
CREATE POLICY "Users can view roles for their companies"
  ON public.user_roles 
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL 
    AND public.user_has_company_access(auth.uid(), company_id)
  );
