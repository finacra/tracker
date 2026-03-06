-- Make user superadmin
-- User ID: 2071b5f0-d0b0-4f84-ba3a-7aaad6ce73be
-- Email: naveen@finnovateai.com

-- First, check if user already has a superadmin role
-- If they do, this will update it; if not, it will insert a new one
INSERT INTO public.user_roles (user_id, company_id, role, created_at, updated_at)
VALUES (
  '2071b5f0-d0b0-4f84-ba3a-7aaad6ce73be'::uuid,
  NULL, -- NULL company_id = platform-level superadmin
  'superadmin',
  NOW(),
  NOW()
)
ON CONFLICT (user_id, company_id) 
DO UPDATE SET
  role = 'superadmin',
  updated_at = NOW();

-- Verify the role was created/updated
SELECT 
  ur.id,
  ur.user_id,
  ur.company_id,
  ur.role,
  ur.created_at,
  ur.updated_at
FROM public.user_roles ur
WHERE ur.user_id = '2071b5f0-d0b0-4f84-ba3a-7aaad6ce73be'::uuid
  AND ur.role = 'superadmin'
  AND ur.company_id IS NULL;
