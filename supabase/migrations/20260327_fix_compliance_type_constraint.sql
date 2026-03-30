-- Expand compliance_type check constraint to include half-yearly and event-based
ALTER TABLE regulatory_requirements
DROP CONSTRAINT IF EXISTS regulatory_requirements_compliance_type_check;

ALTER TABLE regulatory_requirements
ADD CONSTRAINT regulatory_requirements_compliance_type_check
CHECK (compliance_type IN ('one-time', 'monthly', 'quarterly', 'half-yearly', 'annual', 'event-based'));
