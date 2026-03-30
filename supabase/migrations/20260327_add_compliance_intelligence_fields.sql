-- Migration: Add compliance intelligence (AI-generated) fields to regulatory_requirements
-- Date: 2026-03-27
-- Purpose: Support AI-generated compliance items from Perplexity with CA review workflow

-- New columns for AI-generated compliance tracking
ALTER TABLE regulatory_requirements
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS confidence_score DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS needs_ca_review BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS act TEXT,
  ADD COLUMN IF NOT EXISTS section TEXT,
  ADD COLUMN IF NOT EXISTS authority TEXT,
  ADD COLUMN IF NOT EXISTS due_date_formula TEXT,
  ADD COLUMN IF NOT EXISTS applicability_reason TEXT,
  ADD COLUMN IF NOT EXISTS ai_batch_id TEXT;

-- Index for filtering AI-generated items pending review
CREATE INDEX IF NOT EXISTS idx_requirements_source ON regulatory_requirements (source);
CREATE INDEX IF NOT EXISTS idx_requirements_needs_review ON regulatory_requirements (needs_ca_review) WHERE needs_ca_review = true;
CREATE INDEX IF NOT EXISTS idx_requirements_ai_batch ON regulatory_requirements (ai_batch_id) WHERE ai_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_requirements_confidence ON regulatory_requirements (confidence_score) WHERE confidence_score IS NOT NULL;

-- Add 'pending_review' as a valid status for AI-generated items
-- (No enum constraint exists, status is a free text field, but document it here)
COMMENT ON COLUMN regulatory_requirements.source IS 'Origin of requirement: manual, ai_generated, or template';
COMMENT ON COLUMN regulatory_requirements.confidence_score IS 'AI confidence score 0.0-1.0 for ai_generated items';
COMMENT ON COLUMN regulatory_requirements.needs_ca_review IS 'Whether a CA needs to review before activation';
COMMENT ON COLUMN regulatory_requirements.source_url IS 'Citation URL from government/authority website';
COMMENT ON COLUMN regulatory_requirements.act IS 'Applicable act (e.g., Companies Act 2013)';
COMMENT ON COLUMN regulatory_requirements.section IS 'Relevant section of the act';
COMMENT ON COLUMN regulatory_requirements.authority IS 'Regulatory authority (e.g., MCA, GSTN, CBDT)';
COMMENT ON COLUMN regulatory_requirements.due_date_formula IS 'Formula for computing recurring deadlines';
COMMENT ON COLUMN regulatory_requirements.applicability_reason IS 'Why this compliance applies to this company';
COMMENT ON COLUMN regulatory_requirements.ai_batch_id IS 'Groups items from the same AI generation run';
