-- ============================================================================
-- Create the two exclusion tables that getDataRoomInitState expects.
--
-- Why: both tables were only ever defined in supabase/migrations/*.sql and
-- were never applied to staging/prod. Prisma's db push doesn't know about
-- them because they aren't in schema.prisma. Symptom: getDataRoomInitState
-- throws `relation "company_document_template_exclusions" does not exist`
-- (Postgres 42P01) after any company is created.
--
-- Differences from the original supabase/migrations copies:
--   * No FK on created_by to auth.users — Passport users live in
--     public.app_users (CLAUDE.md §9). We keep the column but stop
--     constraining it.
--   * Skip RLS policies. This project queries via Prisma using the
--     postgres pooler role, which bypasses RLS; the policies are dead
--     weight and they reference auth.uid() which Passport doesn't set.
--
-- Idempotent: every CREATE uses IF NOT EXISTS. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_document_template_exclusions (
  id            UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,
  folder_name   TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  created_by    UUID,
  UNIQUE(company_id, document_name, folder_name)
);

CREATE INDEX IF NOT EXISTS idx_cdte_company_id
  ON public.company_document_template_exclusions(company_id);
CREATE INDEX IF NOT EXISTS idx_cdte_document_name
  ON public.company_document_template_exclusions(document_name);


CREATE TABLE IF NOT EXISTS public.company_compliance_exclusions (
  id             UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES public.regulatory_requirements(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  created_by     UUID,
  UNIQUE(company_id, requirement_id)
);

CREATE INDEX IF NOT EXISTS idx_cce_company_id
  ON public.company_compliance_exclusions(company_id);
CREATE INDEX IF NOT EXISTS idx_cce_requirement_id
  ON public.company_compliance_exclusions(requirement_id);
