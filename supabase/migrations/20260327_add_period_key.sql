-- Add period_key to regulatory_requirements for per-period compliance tracking
-- e.g., "2026-04" for monthly, "Q1-2026" for quarterly, "FY2025-26" for annual
ALTER TABLE regulatory_requirements
  ADD COLUMN IF NOT EXISTS period_key TEXT,
  ADD COLUMN IF NOT EXISTS period_label TEXT;

-- Unique constraint: same requirement + same period = one entry per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_requirements_company_req_period
  ON regulatory_requirements (company_id, requirement, period_key)
  WHERE period_key IS NOT NULL;

-- Index for period-based filtering
CREATE INDEX IF NOT EXISTS idx_requirements_period_key
  ON regulatory_requirements (period_key)
  WHERE period_key IS NOT NULL;
