-- ============================================
-- CONTACT SUBMISSIONS TABLE
-- Stores contact form submissions from the public contact page
-- ============================================

CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NULL,
  phone TEXT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  replied_at TIMESTAMPTZ NULL,
  replied_by UUID NULL REFERENCES auth.users(id),
  notes TEXT NULL -- Internal notes for admin use
);

COMMENT ON TABLE public.contact_submissions IS 'Contact form submissions from the public contact page';
COMMENT ON COLUMN public.contact_submissions.status IS 'Status: new, read, replied, archived';
COMMENT ON COLUMN public.contact_submissions.notes IS 'Internal admin notes about this submission';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contact_submissions_email ON public.contact_submissions(email);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_status ON public.contact_submissions(status);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at ON public.contact_submissions(created_at DESC);

-- Enable RLS
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow anonymous inserts (public can submit contact forms)
DROP POLICY IF EXISTS "Anyone can submit contact forms" ON public.contact_submissions;
CREATE POLICY "Anyone can submit contact forms"
  ON public.contact_submissions FOR INSERT
  WITH CHECK (true);

-- Only admins and superadmins can view contact submissions
-- But allow users to see their own submissions (for confirmation after insert)
DROP POLICY IF EXISTS "Admins can view contact submissions" ON public.contact_submissions;
CREATE POLICY "Admins can view contact submissions"
  ON public.contact_submissions FOR SELECT
  USING (
    public.is_superadmin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'superadmin')
      LIMIT 1
    )
  );


-- Only admins and superadmins can update contact submissions
DROP POLICY IF EXISTS "Admins can update contact submissions" ON public.contact_submissions;
CREATE POLICY "Admins can update contact submissions"
  ON public.contact_submissions FOR UPDATE
  USING (
    public.is_superadmin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'superadmin')
      LIMIT 1
    )
  );

-- Trigger for updated_at (only if function exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS update_contact_submissions_updated_at ON public.contact_submissions;
    CREATE TRIGGER update_contact_submissions_updated_at
      BEFORE UPDATE ON public.contact_submissions
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
