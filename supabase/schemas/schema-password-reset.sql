-- ============================================
-- PASSWORD RESET TOKENS SCHEMA
-- Handles password reset functionality
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create password reset tokens table
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ NULL,
  UNIQUE(user_id) -- One active token per user
);

COMMENT ON TABLE public.password_reset_tokens IS 'Stores password reset tokens for users who forgot their password';
COMMENT ON COLUMN public.password_reset_tokens.token IS 'Unique reset token sent to user';
COMMENT ON COLUMN public.password_reset_tokens.email IS 'Email address for password reset';
COMMENT ON COLUMN public.password_reset_tokens.expires_at IS 'Token expiration timestamp (typically 1 hour)';
COMMENT ON COLUMN public.password_reset_tokens.used_at IS 'Timestamp when token was used to reset password';

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token 
  ON public.password_reset_tokens(token);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id 
  ON public.password_reset_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at 
  ON public.password_reset_tokens(expires_at) 
  WHERE used_at IS NULL;

-- RLS policies (server-side only access)
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- No client-facing policies - server-side only
CREATE POLICY "Service role full access to password_reset_tokens"
  ON public.password_reset_tokens
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to clean up expired tokens (run periodically)
CREATE OR REPLACE FUNCTION public.cleanup_expired_password_reset_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.password_reset_tokens
  WHERE expires_at < NOW() 
    AND used_at IS NULL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.cleanup_expired_password_reset_tokens IS 'Cleans up expired password reset tokens that were never used';
