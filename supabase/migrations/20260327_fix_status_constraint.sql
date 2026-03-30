-- Expand status check constraint to include 'pending_review' for AI-generated items
ALTER TABLE regulatory_requirements
DROP CONSTRAINT IF EXISTS regulatory_requirements_status_check;

ALTER TABLE regulatory_requirements
ADD CONSTRAINT regulatory_requirements_status_check
CHECK (status IN ('not_started', 'in_progress', 'completed', 'pending_review', 'overdue'));
