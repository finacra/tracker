-- Team invitations (supports inviting non-auth users via email)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.team_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),
  token TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ NULL,
  accepted_by_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_team_invitations_company_id ON public.team_invitations(company_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON public.team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON public.team_invitations(token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_expires_at ON public.team_invitations(expires_at);

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

-- By default, keep access server-only (service role / admin client).
DROP POLICY IF EXISTS "Authenticated can read their invitations" ON public.team_invitations;
DROP POLICY IF EXISTS "System can manage invitations" ON public.team_invitations;

CREATE POLICY "System can manage invitations"
  ON public.team_invitations
  FOR ALL
  TO authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

