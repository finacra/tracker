-- ============================================
-- FIX: Ensure get_user_company_ids RPC function exists and works
-- ============================================

-- Drop and recreate the function to ensure it's correct
DROP FUNCTION IF EXISTS public.get_user_company_ids(UUID);

-- Create the RPC function that bypasses RLS
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
GRANT EXECUTE ON FUNCTION public.get_user_company_ids(UUID) TO service_role;

-- Test the function (replace with actual user_id)
-- SELECT * FROM public.get_user_company_ids('USER_ID_HERE');
