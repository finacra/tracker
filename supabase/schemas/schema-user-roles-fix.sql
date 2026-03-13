-- Fix user_roles foreign key to support Passport.js authentication
-- The table should use app_user_id for Passport users, and user_id can be nullable for backward compatibility

-- Step 1: Ensure app_user_id column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_roles' 
    AND column_name = 'app_user_id'
  ) THEN
    ALTER TABLE public.user_roles
    ADD COLUMN app_user_id UUID;
  END IF;
END $$;

-- Step 2: Drop the old foreign key constraint on user_id
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

-- Step 3: Make user_id nullable (since Passport users won't have auth.users IDs)
ALTER TABLE public.user_roles
  ALTER COLUMN user_id DROP NOT NULL;

-- Step 4: Migrate existing user_id values to app_user_id where possible
-- Find corresponding app_users.id via auth_identities
UPDATE public.user_roles ur
SET app_user_id = ai.app_user_id
FROM public.auth_identities ai
WHERE ai.legacy_auth_id::uuid = ur.user_id
  AND ai.provider = 'supabase'
  AND ur.user_id IS NOT NULL
  AND ur.app_user_id IS NULL;

-- Step 5: For any remaining rows where we can't find a match but user_id exists in auth.users, keep it
-- For rows where user_id doesn't exist in auth.users, set user_id to NULL
UPDATE public.user_roles
SET user_id = NULL
WHERE user_id IS NOT NULL
  AND app_user_id IS NOT NULL
  AND user_id NOT IN (
    SELECT id FROM auth.users
  );

-- Step 6: Add foreign key constraint for app_user_id
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_app_user_id_fkey;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_app_user_id_fkey
  FOREIGN KEY (app_user_id)
  REFERENCES public.app_users(id)
  ON DELETE CASCADE;

-- Step 7: Update the unique constraint to support both app_user_id and user_id
-- Drop the old unique constraint
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_company_id_key;

-- Drop existing unique indexes if they exist
DROP INDEX IF EXISTS user_roles_app_user_id_company_id_key;
DROP INDEX IF EXISTS user_roles_user_id_company_id_key;

-- Create partial unique indexes (PostgreSQL doesn't support WHERE in UNIQUE constraints)
-- For Passport users (app_user_id)
CREATE UNIQUE INDEX user_roles_app_user_id_company_id_key
  ON public.user_roles (app_user_id, company_id)
  WHERE app_user_id IS NOT NULL;

-- For legacy Supabase users (user_id)
CREATE UNIQUE INDEX user_roles_user_id_company_id_key
  ON public.user_roles (user_id, company_id)
  WHERE user_id IS NOT NULL;
