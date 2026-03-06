-- Migration: Create company_document_template_exclusions table
-- This table stores document templates that are hidden/removed for specific companies
-- Allows companies to hide predefined document types that are not applicable to them

CREATE TABLE IF NOT EXISTS public.company_document_template_exclusions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,
  folder_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(company_id, document_name, folder_name)
);

COMMENT ON TABLE public.company_document_template_exclusions IS 'Stores document templates that are hidden/removed for specific companies. Allows companies to hide predefined document types that are not applicable to them.';

COMMENT ON COLUMN public.company_document_template_exclusions.company_id IS 'The company for which this template is hidden';
COMMENT ON COLUMN public.company_document_template_exclusions.document_name IS 'Name of the document template to hide (e.g., "GSTR-1", "FSSAI License")';
COMMENT ON COLUMN public.company_document_template_exclusions.folder_name IS 'Folder name where this document template belongs (e.g., "GST Returns", "Financials and licenses")';
COMMENT ON COLUMN public.company_document_template_exclusions.created_by IS 'User who hid this template for the company';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_company_document_template_exclusions_company_id 
  ON public.company_document_template_exclusions(company_id);

CREATE INDEX IF NOT EXISTS idx_company_document_template_exclusions_document_name 
  ON public.company_document_template_exclusions(document_name);

-- Enable RLS
ALTER TABLE public.company_document_template_exclusions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view exclusions for companies they have access to
DROP POLICY IF EXISTS "Users can view exclusions for their companies" ON public.company_document_template_exclusions;
CREATE POLICY "Users can view exclusions for their companies"
  ON public.company_document_template_exclusions FOR SELECT
  USING (
    company_id IN (
      SELECT ur.company_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.company_id IS NOT NULL
    )
    OR public.is_superadmin(auth.uid())
  );

-- Users with edit/admin role can manage exclusions for their companies
DROP POLICY IF EXISTS "Admins can manage exclusions for their companies" ON public.company_document_template_exclusions;
CREATE POLICY "Admins can manage exclusions for their companies"
  ON public.company_document_template_exclusions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
      AND ur.company_id = company_document_template_exclusions.company_id
      AND ur.role IN ('admin', 'editor')
    )
    OR public.is_superadmin(auth.uid())
  );
