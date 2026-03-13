-- Fix team_invitations foreign key to reference app_users instead of auth.users
-- This is needed because we're using Passport.js authentication now

-- Step 1: Drop the old foreign key constraints first (so we can modify the data)
ALTER TABLE public.team_invitations
  DROP CONSTRAINT IF EXISTS team_invitations_invited_by_fkey;

ALTER TABLE public.team_invitations
  DROP CONSTRAINT IF EXISTS team_invitations_accepted_by_user_id_fkey;

-- Step 2: Make invited_by nullable (so we can set unmatched values to NULL)
ALTER TABLE public.team_invitations
  ALTER COLUMN invited_by DROP NOT NULL;

-- Step 3: Migrate existing invited_by values from auth.users to app_users
-- Find the corresponding app_users.id for each invited_by value via auth_identities
UPDATE public.team_invitations ti
SET invited_by = ai.app_user_id
FROM public.auth_identities ai
WHERE ai.legacy_auth_id::uuid = ti.invited_by
  AND ai.provider = 'supabase'
  AND ti.invited_by IS NOT NULL;

-- For any remaining invitations where we can't find a match, set to NULL
-- (These are likely old invitations from deleted users or users not yet migrated)
UPDATE public.team_invitations
SET invited_by = NULL
WHERE invited_by IS NOT NULL
  AND invited_by NOT IN (
    SELECT id FROM public.app_users
  );

-- Step 4: Do the same for accepted_by_user_id
UPDATE public.team_invitations ti
SET accepted_by_user_id = ai.app_user_id
FROM public.auth_identities ai
WHERE ai.legacy_auth_id::uuid = ti.accepted_by_user_id
  AND ai.provider = 'supabase'
  AND ti.accepted_by_user_id IS NOT NULL;

-- For any remaining accepted_by_user_id values without matches, set to NULL
UPDATE public.team_invitations
SET accepted_by_user_id = NULL
WHERE accepted_by_user_id IS NOT NULL
  AND accepted_by_user_id NOT IN (
    SELECT id FROM public.app_users
  );

-- Step 5: Add new foreign key constraints referencing app_users
ALTER TABLE public.team_invitations
  ADD CONSTRAINT team_invitations_invited_by_fkey
  FOREIGN KEY (invited_by)
  REFERENCES public.app_users(id)
  ON DELETE SET NULL;

ALTER TABLE public.team_invitations
  ADD CONSTRAINT team_invitations_accepted_by_user_id_fkey
  FOREIGN KEY (accepted_by_user_id)
  REFERENCES public.app_users(id)
  ON DELETE SET NULL;
