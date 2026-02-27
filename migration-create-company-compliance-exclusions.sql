-- Migration: Create company compliance exclusions table
-- This table stores compliances that are explicitly hidden for a specific company.
-- Hidden compliances are excluded from tracker display, penalty calculations, and reports.

CREATE TABLE IF NOT EXISTS public.company_compliance_exclusions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES public.regulatory_requirements(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(company_id, requirement_id)
);

COMMENT ON TABLE public.company_compliance_exclusions IS 'Stores compliances that are explicitly hidden for a specific company. Hidden compliances are excluded from tracker display, penalty calculations, and reports.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_company_compliance_exclusions_company_id ON public.company_compliance_exclusions(company_id);
CREATE INDEX IF NOT EXISTS idx_company_compliance_exclusions_requirement_id ON public.company_compliance_exclusions(requirement_id);

-- Enable RLS
ALTER TABLE public.company_compliance_exclusions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Company users can view their hidden compliances" ON public.company_compliance_exclusions;
CREATE POLICY "Company users can view their hidden compliances"
  ON public.company_compliance_exclusions FOR SELECT
  USING (
    company_id IN (
      SELECT ur.company_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.company_id IS NOT NULL
    )
    OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Company admins and editors can manage their hidden compliances" ON public.company_compliance_exclusions;
CREATE POLICY "Company admins and editors can manage their hidden compliances"
  ON public.company_compliance_exclusions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.company_id = company_compliance_exclusions.company_id
      AND ur.role IN ('admin', 'editor', 'superadmin')
    )
    OR public.is_superadmin(auth.uid())
  );
