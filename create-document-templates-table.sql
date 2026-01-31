-- ============================================
-- CREATE document_templates_internal TABLE
-- This table stores document templates that map document names to folders
-- Used for automatic folder organization when uploading documents
-- ============================================

CREATE TABLE IF NOT EXISTS public.document_templates_internal (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_name TEXT NOT NULL UNIQUE,
  folder_name TEXT NOT NULL,
  default_frequency TEXT DEFAULT 'annually' CHECK (default_frequency IN ('one-time', 'monthly', 'quarterly', 'annually')),
  description TEXT NULL,
  category TEXT NULL, -- e.g., 'GST', 'Income Tax', 'RoC', 'Labour Law'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.document_templates_internal IS 'Templates for document organization - maps document names to folders and frequencies';
COMMENT ON COLUMN public.document_templates_internal.document_name IS 'Name of the document (e.g., "GSTR-3B Filed Copy", "Form 24Q")';
COMMENT ON COLUMN public.document_templates_internal.folder_name IS 'Folder where this document should be stored (e.g., "GST Returns", "Income Tax Returns")';
COMMENT ON COLUMN public.document_templates_internal.default_frequency IS 'Default frequency for this document type';
COMMENT ON COLUMN public.document_templates_internal.category IS 'Compliance category this document belongs to';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_document_templates_folder ON public.document_templates_internal(folder_name);
CREATE INDEX IF NOT EXISTS idx_document_templates_category ON public.document_templates_internal(category);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_document_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_document_templates_updated_at ON public.document_templates_internal;
CREATE TRIGGER trigger_update_document_templates_updated_at
  BEFORE UPDATE ON public.document_templates_internal
  FOR EACH ROW
  EXECUTE FUNCTION update_document_templates_updated_at();

-- Insert common document templates
INSERT INTO public.document_templates_internal (document_name, folder_name, default_frequency, category) VALUES
  -- GST Documents
  ('GSTR-3B Filed Copy', 'GST Returns', 'monthly', 'GST'),
  ('GSTR-1 Filed Copy', 'GST Returns', 'monthly', 'GST'),
  ('GSTR-9 Filed Copy', 'GST Returns', 'annually', 'GST'),
  ('GSTR-9C Filed Copy', 'GST Returns', 'annually', 'GST'),
  ('Payment Challan', 'GST Returns', 'monthly', 'GST'),
  ('CMP-08 Filed Copy', 'GST Returns', 'quarterly', 'GST'),
  
  -- Income Tax Documents
  ('Form 24Q', 'Income Tax Returns', 'quarterly', 'Income Tax'),
  ('Form 26Q', 'Income Tax Returns', 'quarterly', 'Income Tax'),
  ('Form 27EQ', 'Income Tax Returns', 'quarterly', 'Income Tax'),
  ('TDS Certificate', 'Income Tax Returns', 'quarterly', 'Income Tax'),
  ('ITR Filed Copy', 'Income Tax Returns', 'annually', 'Income Tax'),
  ('Tax Audit Report', 'Income Tax Returns', 'annually', 'Income Tax'),
  ('Challan 281', 'Income Tax Returns', 'monthly', 'Income Tax'),
  
  -- ROC Documents
  ('MGT-7 Filed Copy', 'ROC Filings', 'annually', 'RoC'),
  ('AOC-4 Filed Copy', 'ROC Filings', 'annually', 'RoC'),
  ('Form 11', 'ROC Filings', 'annually', 'LLP Act'),
  ('Form 8', 'ROC Filings', 'annually', 'LLP Act'),
  ('DPT-3 Filed Copy', 'ROC Filings', 'annually', 'RoC'),
  ('MSME Form I', 'ROC Filings', 'annually', 'RoC'),
  
  -- Labour Law Documents
  ('PF ECR Filed Copy', 'Labour Law Compliance', 'monthly', 'Labour Law'),
  ('PF Challan', 'Labour Law Compliance', 'monthly', 'Labour Law'),
  ('ESI Challan', 'Labour Law Compliance', 'monthly', 'Labour Law'),
  ('Payment Receipt', 'Labour Law Compliance', 'monthly', 'Labour Law'),
  ('Employee List', 'Labour Law Compliance', 'monthly', 'Labour Law'),
  
  -- Professional Tax
  ('PT Return Filed Copy', 'Professional Tax', 'monthly', 'Prof. Tax'),
  ('PT Challan', 'Professional Tax', 'monthly', 'Prof. Tax')
ON CONFLICT (document_name) DO NOTHING;

-- RLS Policies (if needed - adjust based on your access requirements)
-- For now, allow authenticated users to read
ALTER TABLE public.document_templates_internal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read document templates"
  ON public.document_templates_internal
  FOR SELECT
  USING (true);

-- Only superadmins can modify (adjust based on your needs)
CREATE POLICY "Only superadmins can modify document templates"
  ON public.document_templates_internal
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'superadmin'
      AND company_id IS NULL
    )
  );
