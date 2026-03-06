-- ============================================
-- MIGRATION: Fix Compliance Categories
-- ============================================
-- This migration:
-- 1. Standardizes "Others" to "Other" in compliance_templates
-- 2. Adds all missing categories to country_compliance_categories
-- 3. Ensures consistency between templates and reference table
-- ============================================

-- Step 1: Standardize "Others" to "Other" in compliance_templates
UPDATE compliance_templates
SET category = 'Other'
WHERE country_code = 'IN' AND category = 'Others';

-- Step 2: Remove "Others" from country_compliance_categories if it exists
DELETE FROM country_compliance_categories
WHERE country_code = 'IN' AND category_name = 'Others';

-- Step 3: Add all categories to country_compliance_categories for India
-- This ensures all categories used in templates are in the reference table
INSERT INTO country_compliance_categories (country_code, category_name, display_order) VALUES
('IN', 'Income Tax', 1),
('IN', 'GST', 2),
('IN', 'Payroll', 3),        -- Keep for backward compatibility
('IN', 'RoC', 4),
('IN', 'Renewals', 5),
('IN', 'Other', 6),           -- Standardized from "Others"
('IN', 'Prof. Tax', 7),
('IN', 'Labour Law', 8),     -- Add for future use (templates may be added later)
('IN', 'LLP Act', 9)         -- Add for future use (templates may be added later)
ON CONFLICT (country_code, category_name) DO UPDATE
SET display_order = EXCLUDED.display_order;

-- Step 4: Verify the migration
DO $$
DECLARE
  templates_others_count INT;
  templates_other_count INT;
  categories_count INT;
  rec RECORD;
BEGIN
  -- Check standardization
  SELECT COUNT(*) INTO templates_others_count 
  FROM compliance_templates 
  WHERE country_code = 'IN' AND category = 'Others';
  
  SELECT COUNT(*) INTO templates_other_count 
  FROM compliance_templates 
  WHERE country_code = 'IN' AND category = 'Other';
  
  SELECT COUNT(*) INTO categories_count 
  FROM country_compliance_categories 
  WHERE country_code = 'IN';
  
  IF templates_others_count = 0 THEN
    RAISE NOTICE '✓ Standardization successful: All "Others" converted to "Other"';
  ELSE
    RAISE WARNING '✗ Standardization incomplete: % templates still have "Others"', templates_others_count;
  END IF;
  
  RAISE NOTICE '✓ Total "Other" templates: %', templates_other_count;
  RAISE NOTICE '✓ Total categories in reference table: %', categories_count;
  
  -- List all categories
  RAISE NOTICE 'Categories in reference table:';
  FOR rec IN 
    SELECT category_name, display_order 
    FROM country_compliance_categories 
    WHERE country_code = 'IN' 
    ORDER BY display_order
  LOOP
    RAISE NOTICE '  - % (order: %)', rec.category_name, rec.display_order;
  END LOOP;
END $$;

-- ============================================
-- VERIFICATION QUERIES (Run separately to verify)
-- ============================================

-- Check all categories in compliance_templates
-- SELECT category, COUNT(*) as count
-- FROM compliance_templates
-- WHERE country_code = 'IN'
-- GROUP BY category
-- ORDER BY count DESC;

-- Check all categories in country_compliance_categories
-- SELECT category_name, display_order
-- FROM country_compliance_categories
-- WHERE country_code = 'IN'
-- ORDER BY display_order;
