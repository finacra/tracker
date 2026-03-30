-- ============================================================
-- CLEAN SWEEP: Remove old compliance template system
-- The new rules engine + AI replaces all template-based compliance generation
-- ============================================================

-- 1. Delete ALL existing regulatory requirements (old template-based ones are flawed)
DELETE FROM regulatory_requirements;

-- 2. Delete ALL compliance templates
DELETE FROM compliance_templates;

-- 3. Delete compliance exclusions (no longer relevant without templates)
DELETE FROM company_compliance_exclusions;

-- 4. Drop the auto-apply trigger (prevents old templates from being applied to new companies)
DROP TRIGGER IF EXISTS trigger_apply_templates_on_company_created ON companies;
DROP FUNCTION IF EXISTS on_company_created() CASCADE;
DROP FUNCTION IF EXISTS apply_all_templates_to_company(uuid) CASCADE;
DROP FUNCTION IF EXISTS apply_template_to_companies(uuid) CASCADE;
DROP FUNCTION IF EXISTS generate_recurring_compliances_for_company(uuid, integer) CASCADE;
