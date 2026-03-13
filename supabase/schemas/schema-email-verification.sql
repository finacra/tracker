-- ============================================
-- EMAIL VERIFICATION SCHEMA
-- Handles email verification for new user registrations
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add email_verified field to app_users table
ALTER TABLE public.app_users 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.app_users 
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Create email verification tokens table
CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.email_verification_tokens IS 'Stores email verification tokens for new user registrations';
COMMENT ON COLUMN public.email_verification_tokens.token IS 'Unique verification token sent to user';
COMMENT ON COLUMN public.email_verification_tokens.email IS 'Email address being verified';
COMMENT ON COLUMN public.email_verification_tokens.expires_at IS 'Token expiration timestamp (typically 24 hours)';
COMMENT ON COLUMN public.email_verification_tokens.verified_at IS 'Timestamp when token was used to verify email';

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token 
  ON public.email_verification_tokens(token);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id 
  ON public.email_verification_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_email 
  ON public.email_verification_tokens(email);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at 
  ON public.email_verification_tokens(expires_at) 
  WHERE verified_at IS NULL;

-- RLS policies (server-side only access)
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;

-- No client-facing policies - server-side only
CREATE POLICY "Service role full access to email_verification_tokens"
  ON public.email_verification_tokens
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to clean up expired tokens (run periodically)
CREATE OR REPLACE FUNCTION public.cleanup_expired_verification_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.email_verification_tokens
  WHERE expires_at < NOW() 
    AND verified_at IS NULL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.cleanup_expired_verification_tokens IS 'Cleans up expired verification tokens that were never used';
