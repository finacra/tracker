-- Fix infinite recursion in user_roles RLS policy
-- Run this script to fix the "infinite recursion detected in policy" error

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view roles for their companies" ON public.user_roles;

-- Create the helper function if it doesn't exist
CREATE OR REPLACE FUNCTION public.user_has_company_access(p_user_id UUID, p_company_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id 
    AND company_id = p_company_id
    AND company_id IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the policy using the helper function (which bypasses RLS)
CREATE POLICY "Users can view roles for their companies"
  ON public.user_roles FOR SELECT
  USING (
    company_id IS NOT NULL AND
    public.user_has_company_access(auth.uid(), company_id)
  );
