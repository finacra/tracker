-- ============================================
-- UPDATE document_templates_internal TABLE
-- This script adds missing columns and inserts common document templates
-- Works with existing table structure
-- ============================================

-- Add missing columns if they don't exist
DO $$
BEGIN
  -- Add category column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'document_templates_internal' 
    AND column_name = 'category'
  ) THEN
    ALTER TABLE public.document_templates_internal ADD COLUMN category TEXT NULL;
    COMMENT ON COLUMN public.document_templates_internal.category IS 'Compliance category this document belongs to';
  END IF;

  -- Add description column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'document_templates_internal' 
    AND column_name = 'description'
  ) THEN
    ALTER TABLE public.document_templates_internal ADD COLUMN description TEXT NULL;
  END IF;

  -- Add updated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'document_templates_internal' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.document_templates_internal ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Add UNIQUE index on document_name if it doesn't exist (simpler than constraint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_templates_document_name_unique 
  ON public.document_templates_internal(document_name);

-- Add comments
COMMENT ON TABLE public.document_templates_internal IS 'Templates for document organization - maps document names to folders and frequencies';
COMMENT ON COLUMN public.document_templates_internal.document_name IS 'Name of the document (e.g., "GSTR-3B Filed Copy", "Form 24Q")';
COMMENT ON COLUMN public.document_templates_internal.folder_name IS 'Folder where this document should be stored (e.g., "GST Returns", "Income Tax Returns")';
COMMENT ON COLUMN public.document_templates_internal.default_frequency IS 'Default frequency for this document type';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_document_templates_folder ON public.document_templates_internal(folder_name);
CREATE INDEX IF NOT EXISTS idx_document_templates_category ON public.document_templates_internal(category) WHERE category IS NOT NULL;

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

-- Insert common document templates (only if they don't exist)
-- Check if category column exists before including it in INSERT
DO $$
BEGIN
  -- Check if category column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'document_templates_internal' 
    AND column_name = 'category'
  ) THEN
    -- Insert with category
    INSERT INTO public.document_templates_internal (document_name, folder_name, default_frequency, category, is_mandatory) VALUES
      -- GST Documents
      ('GSTR-3B Filed Copy', 'GST Returns', 'monthly', 'GST', true),
      ('GSTR-1 Filed Copy', 'GST Returns', 'monthly', 'GST', true),
      ('GSTR-9 Filed Copy', 'GST Returns', 'annually', 'GST', true),
      ('GSTR-9C Filed Copy', 'GST Returns', 'annually', 'GST', true),
      ('Payment Challan', 'GST Returns', 'monthly', 'GST', true),
      ('CMP-08 Filed Copy', 'GST Returns', 'quarterly', 'GST', true),
      
      -- Income Tax Documents
      ('Form 24Q', 'Income Tax Returns', 'quarterly', 'Income Tax', true),
      ('Form 26Q', 'Income Tax Returns', 'quarterly', 'Income Tax', true),
      ('Form 27EQ', 'Income Tax Returns', 'quarterly', 'Income Tax', true),
      ('TDS Certificate', 'Income Tax Returns', 'quarterly', 'Income Tax', true),
      ('ITR Filed Copy', 'Income Tax Returns', 'annually', 'Income Tax', true),
      ('Tax Audit Report', 'Income Tax Returns', 'annually', 'Income Tax', true),
      ('Challan 281', 'Income Tax Returns', 'monthly', 'Income Tax', true),
      
      -- ROC Documents
      ('MGT-7 Filed Copy', 'ROC Filings', 'annually', 'RoC', true),
      ('AOC-4 Filed Copy', 'ROC Filings', 'annually', 'RoC', true),
      ('Form 11', 'ROC Filings', 'annually', 'LLP Act', true),
      ('Form 8', 'ROC Filings', 'annually', 'LLP Act', true),
      ('DPT-3 Filed Copy', 'ROC Filings', 'annually', 'RoC', true),
      ('MSME Form I', 'ROC Filings', 'annually', 'RoC', true),
      
      -- Labour Law Documents
      ('PF ECR Filed Copy', 'Labour Law Compliance', 'monthly', 'Labour Law', true),
      ('PF Challan', 'Labour Law Compliance', 'monthly', 'Labour Law', true),
      ('ESI Challan', 'Labour Law Compliance', 'monthly', 'Labour Law', true),
      ('Payment Receipt', 'Labour Law Compliance', 'monthly', 'Labour Law', true),
      ('Employee List', 'Labour Law Compliance', 'monthly', 'Labour Law', true),
      
      -- Professional Tax
      ('PT Return Filed Copy', 'Professional Tax', 'monthly', 'Prof. Tax', true),
      ('PT Challan', 'Professional Tax', 'monthly', 'Prof. Tax', true)
    ON CONFLICT (document_name) DO NOTHING;
  ELSE
    -- Insert without category (fallback)
    INSERT INTO public.document_templates_internal (document_name, folder_name, default_frequency, is_mandatory) VALUES
      -- GST Documents
      ('GSTR-3B Filed Copy', 'GST Returns', 'monthly', true),
      ('GSTR-1 Filed Copy', 'GST Returns', 'monthly', true),
      ('GSTR-9 Filed Copy', 'GST Returns', 'annually', true),
      ('GSTR-9C Filed Copy', 'GST Returns', 'annually', true),
      ('Payment Challan', 'GST Returns', 'monthly', true),
      ('CMP-08 Filed Copy', 'GST Returns', 'quarterly', true),
      
      -- Income Tax Documents
      ('Form 24Q', 'Income Tax Returns', 'quarterly', true),
      ('Form 26Q', 'Income Tax Returns', 'quarterly', true),
      ('Form 27EQ', 'Income Tax Returns', 'quarterly', true),
      ('TDS Certificate', 'Income Tax Returns', 'quarterly', true),
      ('ITR Filed Copy', 'Income Tax Returns', 'annually', true),
      ('Tax Audit Report', 'Income Tax Returns', 'annually', true),
      ('Challan 281', 'Income Tax Returns', 'monthly', true),
      
      -- ROC Documents
      ('MGT-7 Filed Copy', 'ROC Filings', 'annually', true),
      ('AOC-4 Filed Copy', 'ROC Filings', 'annually', true),
      ('Form 11', 'ROC Filings', 'annually', true),
      ('Form 8', 'ROC Filings', 'annually', true),
      ('DPT-3 Filed Copy', 'ROC Filings', 'annually', true),
      ('MSME Form I', 'ROC Filings', 'annually', true),
      
      -- Labour Law Documents
      ('PF ECR Filed Copy', 'Labour Law Compliance', 'monthly', true),
      ('PF Challan', 'Labour Law Compliance', 'monthly', true),
      ('ESI Challan', 'Labour Law Compliance', 'monthly', true),
      ('Payment Receipt', 'Labour Law Compliance', 'monthly', true),
      ('Employee List', 'Labour Law Compliance', 'monthly', true),
      
      -- Professional Tax
      ('PT Return Filed Copy', 'Professional Tax', 'monthly', true),
      ('PT Challan', 'Professional Tax', 'monthly', true)
    ON CONFLICT (document_name) DO NOTHING;
  END IF;
END $$;

-- RLS Policies (if needed - adjust based on your access requirements)
-- For now, allow authenticated users to read
ALTER TABLE public.document_templates_internal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read document templates" ON public.document_templates_internal;
CREATE POLICY "Anyone can read document templates"
  ON public.document_templates_internal
  FOR SELECT
  USING (true);

-- Only superadmins can modify (adjust based on your needs)
DROP POLICY IF EXISTS "Only superadmins can modify document templates" ON public.document_templates_internal;
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
