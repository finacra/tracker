-- Admin Helper Functions
-- Run this in Supabase SQL Editor to enable user email lookup in admin panel

-- Function to get user details by IDs (for superadmin use)
CREATE OR REPLACE FUNCTION public.get_users_by_ids(user_ids uuid[])
RETURNS TABLE (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if caller is superadmin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'superadmin' 
    AND ur.company_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Access denied: superadmin only';
  END IF;

  RETURN QUERY
  SELECT 
    u.id,
    u.email::text,
    u.created_at,
    u.last_sign_in_at
  FROM auth.users u
  WHERE u.id = ANY(user_ids);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_users_by_ids(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_users_by_ids IS 'Get user details by IDs - superadmin only';
