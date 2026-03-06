-- ============================================
-- DEBUG: Check if team member actually exists
-- ============================================
-- Run this to check the actual state of user_roles
-- Just change the email address below to the invited user's email

-- 1. Find the user_id for the invited user
WITH user_info AS (
  SELECT 
      id as user_id,
      email,
      created_at
  FROM auth.users
  WHERE email = 'teamartyaffairs@gmail.com'  -- CHANGE THIS EMAIL
)
-- 2. Check if user_roles entry exists for this user
SELECT 
    ui.email,
    ui.user_id,
    ur.id as role_id,
    ur.company_id,
    ur.role,
    ur.created_at as role_created_at,
    c.name as company_name,
    c.id as company_id
FROM user_info ui
LEFT JOIN public.user_roles ur ON ur.user_id = ui.user_id
LEFT JOIN public.companies c ON c.id = ur.company_id
ORDER BY ur.created_at DESC;

-- 3. Check all user_roles for the specific user (more detailed)
WITH user_info AS (
  SELECT id as user_id, email
  FROM auth.users
  WHERE email = 'teamartyaffairs@gmail.com'  -- CHANGE THIS EMAIL
)
SELECT 
    ui.email,
    ur.id as role_id,
    ur.user_id,
    ur.company_id,
    ur.role,
    ur.created_at,
    c.name as company_name,
    c.user_id as company_owner_id,
    CASE 
      WHEN ur.id IS NULL THEN 'NO ROLE FOUND - User has no company access'
      WHEN c.id IS NULL THEN 'ROLE EXISTS BUT COMPANY NOT FOUND - Data integrity issue!'
      ELSE 'ROLE AND COMPANY FOUND - Should be visible'
    END as status
FROM user_info ui
LEFT JOIN public.user_roles ur ON ur.user_id = ui.user_id AND ur.company_id IS NOT NULL
LEFT JOIN public.companies c ON c.id = ur.company_id
ORDER BY ur.created_at DESC;

-- 4. Check if there are duplicate entries (shouldn't happen due to unique constraint)
SELECT 
    ur.user_id,
    au.email,
    ur.company_id,
    c.name as company_name,
    COUNT(*) as count,
    STRING_AGG(ur.id::text, ', ') as role_ids
FROM public.user_roles ur
LEFT JOIN auth.users au ON au.id = ur.user_id
LEFT JOIN public.companies c ON c.id = ur.company_id
WHERE ur.company_id IS NOT NULL
GROUP BY ur.user_id, au.email, ur.company_id, c.name
HAVING COUNT(*) > 1;

-- 5. Test the RPC function (replace email above first, then use the user_id from results)
-- SELECT * FROM public.get_user_company_ids('PASTE_USER_ID_FROM_ABOVE');
