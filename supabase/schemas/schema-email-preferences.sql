-- Email preferences table for managing user notification opt-outs
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS email_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Opt-out flags per notification type (true = opted out / unsubscribed)
  unsubscribe_status_changes BOOLEAN NOT NULL DEFAULT FALSE,
  unsubscribe_reminders BOOLEAN NOT NULL DEFAULT FALSE,
  unsubscribe_team_updates BOOLEAN NOT NULL DEFAULT FALSE,
  unsubscribe_all BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Digest preferences
  digest_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (digest_frequency IN ('instant', 'daily', 'weekly', 'none')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_email_preferences_user_id ON email_preferences(user_id);

-- RLS policies
ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read their own preferences
CREATE POLICY "Users can read own email preferences"
  ON email_preferences FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own preferences
CREATE POLICY "Users can insert own email preferences"
  ON email_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own preferences
CREATE POLICY "Users can update own email preferences"
  ON email_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can do everything (for API routes)
CREATE POLICY "Service role full access to email preferences"
  ON email_preferences FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_email_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_email_preferences_updated_at
  BEFORE UPDATE ON email_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_email_preferences_updated_at();

-- Grant access
GRANT SELECT, INSERT, UPDATE ON email_preferences TO authenticated;
GRANT ALL ON email_preferences TO service_role;
