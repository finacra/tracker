-- Email batch queue table for smart batching of status change notifications
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS email_batch_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who should receive this email
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  
  -- Which company this relates to
  company_id UUID NOT NULL,
  company_name TEXT NOT NULL,
  
  -- Email type for grouping
  email_type TEXT NOT NULL DEFAULT 'status_change' CHECK (email_type IN ('status_change', 'missing_docs')),
  
  -- Payload containing the notification details (will be batched)
  payload JSONB NOT NULL,
  -- payload example: {
  --   "requirement_id": "uuid",
  --   "requirement_name": "GST Return",
  --   "due_date": "2024-03-15",
  --   "old_status": "pending",
  --   "new_status": "completed"
  -- }
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Processed flag (set when email is sent)
  processed_at TIMESTAMPTZ DEFAULT NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_email_batch_queue_pending 
  ON email_batch_queue(processed_at) 
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_batch_queue_user_type 
  ON email_batch_queue(user_id, email_type, processed_at) 
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_batch_queue_created 
  ON email_batch_queue(created_at);

-- RLS policies
ALTER TABLE email_batch_queue ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (internal use only)
CREATE POLICY "Service role full access to email_batch_queue"
  ON email_batch_queue FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Grant access
GRANT ALL ON email_batch_queue TO service_role;

-- Cleanup function to delete old processed entries (run weekly)
CREATE OR REPLACE FUNCTION cleanup_old_email_batch_queue()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM email_batch_queue
  WHERE processed_at IS NOT NULL
    AND processed_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
