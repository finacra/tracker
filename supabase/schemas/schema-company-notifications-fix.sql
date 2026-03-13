-- Fix company_notifications foreign key to support Passport.js authentication
-- The table should use app_user_id for Passport users, and user_id can be nullable for backward compatibility

-- Step 1: Drop the old foreign key constraint on user_id
ALTER TABLE public.company_notifications
  DROP CONSTRAINT IF EXISTS company_notifications_user_id_fkey;

-- Step 2: Make user_id nullable (since Passport users won't have auth.users IDs)
ALTER TABLE public.company_notifications
  ALTER COLUMN user_id DROP NOT NULL;

-- Step 3: Ensure app_user_id column exists (should already exist from Prisma schema)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'company_notifications' 
    AND column_name = 'app_user_id'
  ) THEN
    ALTER TABLE public.company_notifications
    ADD COLUMN app_user_id UUID;
  END IF;
END $$;

-- Step 4: Migrate existing user_id values to app_user_id where possible
-- Find corresponding app_users.id via auth_identities
UPDATE public.company_notifications cn
SET app_user_id = ai.app_user_id
FROM public.auth_identities ai
WHERE ai.legacy_auth_id::text = cn.user_id::text
  AND ai.provider = 'supabase'
  AND cn.user_id IS NOT NULL
  AND cn.app_user_id IS NULL;

-- Step 5: For any remaining rows where we can't find a match but user_id exists in auth.users, keep it
-- For rows where user_id doesn't exist in auth.users, set user_id to NULL
UPDATE public.company_notifications
SET user_id = NULL
WHERE user_id IS NOT NULL
  AND app_user_id IS NOT NULL
  AND user_id NOT IN (
    SELECT id FROM auth.users
  );

-- Step 6: Add foreign key constraint for app_user_id
ALTER TABLE public.company_notifications
  DROP CONSTRAINT IF EXISTS company_notifications_app_user_id_fkey;

ALTER TABLE public.company_notifications
  ADD CONSTRAINT company_notifications_app_user_id_fkey
  FOREIGN KEY (app_user_id)
  REFERENCES public.app_users(id)
  ON DELETE CASCADE;

-- Step 7: Update RLS policies to check both user_id and app_user_id
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.company_notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.company_notifications FOR SELECT
  USING (
    user_id = auth.uid() 
    OR app_user_id IN (
      SELECT id FROM public.app_users 
      WHERE id IN (
        SELECT app_user_id FROM public.auth_identities 
        WHERE legacy_auth_id::text = auth.uid()::text 
        AND provider = 'supabase'
      )
    )
    OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.company_notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.company_notifications FOR UPDATE
  USING (
    user_id = auth.uid()
    OR app_user_id IN (
      SELECT id FROM public.app_users 
      WHERE id IN (
        SELECT app_user_id FROM public.auth_identities 
        WHERE legacy_auth_id::text = auth.uid()::text 
        AND provider = 'supabase'
      )
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR app_user_id IN (
      SELECT id FROM public.app_users 
      WHERE id IN (
        SELECT app_user_id FROM public.auth_identities 
        WHERE legacy_auth_id::text = auth.uid()::text 
        AND provider = 'supabase'
      )
    )
  );

-- Step 8: Update indexes to include app_user_id
DROP INDEX IF EXISTS idx_company_notifications_user_id;
CREATE INDEX IF NOT EXISTS idx_company_notifications_user_id ON public.company_notifications(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_notifications_app_user_id ON public.company_notifications(app_user_id) WHERE app_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_notifications_user_unread ON public.company_notifications(user_id, is_read) WHERE is_read = FALSE AND user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_notifications_app_user_unread ON public.company_notifications(app_user_id, is_read) WHERE is_read = FALSE AND app_user_id IS NOT NULL;
