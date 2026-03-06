-- Shared legal research cache for report enrichment
-- Goal: drastically reduce Tavily calls by caching generic Act/Section/Penalty references per compliance template
--
-- Safe to run multiple times.

-- ============================================================
-- 1) TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.legal_research_cache (
  -- Canonical cache key (prefer template_id, fallback to normalized string key)
  cache_key text PRIMARY KEY,

  -- Optional: link back to compliance template for easier maintenance/refresh
  template_id uuid NULL,

  -- Inputs
  query text NOT NULL,
  jurisdiction text NOT NULL DEFAULT 'IN',

  -- Outputs (generic only; MUST NOT contain company-specific data)
  legal_section text NULL,
  penalty_provision text NULL,
  sources text[] NOT NULL DEFAULT '{}',
  answer_json jsonb NULL,

  -- Freshness
  expires_at timestamptz NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_legal_research_cache_template_id ON public.legal_research_cache(template_id);
CREATE INDEX IF NOT EXISTS idx_legal_research_cache_expires_at ON public.legal_research_cache(expires_at);

-- ============================================================
-- 2) RLS
-- ============================================================
ALTER TABLE public.legal_research_cache ENABLE ROW LEVEL SECURITY;

-- Intentionally no policies:
-- - App reads/writes should happen only via server-side service role (createAdminClient).
-- - This keeps the cache isolated from client access.

