-- Idempotency log for scheduled reminder emails

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.notification_email_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_date DATE NOT NULL,
  kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_email_log_user_date_kind
  ON public.notification_email_log(user_id, run_date, kind);

CREATE INDEX IF NOT EXISTS idx_notification_email_log_run_date
  ON public.notification_email_log(run_date);

ALTER TABLE public.notification_email_log ENABLE ROW LEVEL SECURITY;

-- Server-only (service role / admin client bypasses RLS).
DROP POLICY IF EXISTS "Deny all on notification_email_log" ON public.notification_email_log;
CREATE POLICY "Deny all on notification_email_log"
  ON public.notification_email_log
  FOR ALL
  TO authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

