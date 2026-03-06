-- ============================================
-- COMPREHENSIVE PENALTY FIX
-- ============================================
-- This handles ALL remaining text cases aggressively
-- Run this to convert all penalty strings to numbers

BEGIN;

-- ============================================
-- STEP 1: Handle "Rs. 200 per day u/s 234E" patterns
-- ============================================
UPDATE compliance_templates 
SET penalty = '200'
WHERE penalty LIKE '%Rs. 200 per day%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$'  -- Not already numeric
   AND penalty NOT LIKE '%0.50% of turnover%';  -- Exclude percentage-based

-- ============================================
-- STEP 2: Handle "Rs. 50 per day" with various suffixes
-- ============================================
-- First, handle the complex one with max cap
UPDATE compliance_templates 
SET penalty = '50|2000'
WHERE penalty LIKE '%Rs. 50 per day%'
   AND penalty LIKE '%max Rs. 2000%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- Then handle simple "Rs. 50 per day" (any suffix)
UPDATE compliance_templates 
SET penalty = '50'
WHERE penalty LIKE '%Rs. 50 per day%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$'  -- Not already numeric
   AND penalty NOT LIKE '%max Rs. 2000%'  -- Not the complex one
   AND penalty NOT LIKE '%Interest @ 18%';  -- Not interest-based

-- ============================================
-- STEP 3: Handle "Rs. 100 per day" patterns
-- ============================================
-- Complex with max cap
UPDATE compliance_templates 
SET penalty = '100|500000'
WHERE penalty LIKE '%Rs. 100 per day%'
   AND (penalty LIKE '%5 Lakh%' OR penalty LIKE '%up to Rs. 5 Lakh%')
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- Simple "Rs. 100 per day"
UPDATE compliance_templates 
SET penalty = '100'
WHERE penalty LIKE '%Rs. 100 per day%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$'  -- Not already numeric
   AND penalty NOT LIKE '%5 Lakh%'
   AND penalty NOT LIKE '%up to Rs. 5 Lakh%';

-- ============================================
-- STEP 4: Handle interest-based penalties → NULL
-- ============================================
UPDATE compliance_templates 
SET penalty = NULL
WHERE (penalty LIKE '%Interest @ 18% p.a. on tax amount%'
    OR penalty LIKE '%Interest @ 1.5% per month%'
    OR penalty LIKE '%Interest @ 1% per month%'
    OR penalty LIKE '%Interest @ 2% per month%'
    OR penalty LIKE '%Interest @ 12% p.a.%'
    OR penalty LIKE '%Interest u/s 234A%'
    OR penalty LIKE '%Interest u/s 234B%'
    OR penalty LIKE '%Interest u/s 234C%')
   AND penalty NOT LIKE '%Late fee Rs. 50%'  -- Exclude if has calculable late fee
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- ============================================
-- STEP 5: Handle "Interest @ 18% + Late fee Rs. 50" → extract late fee
-- ============================================
UPDATE compliance_templates 
SET penalty = '50'
WHERE penalty LIKE '%Interest @ 18% p.a. + Late fee Rs. 50%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- ============================================
-- STEP 6: Handle vague penalties → NULL
-- ============================================
UPDATE compliance_templates 
SET penalty = NULL
WHERE (penalty LIKE '%Penalty as per%Act%'
    OR penalty LIKE '%Penalty as per%guidelines%'
    OR penalty LIKE '%12% Interest p.a. + Penal damages%'
    OR penalty LIKE '%0.5% of Turnover%'
    OR penalty LIKE '%100% of tax due%'
    OR penalty LIKE '%whichever is%')
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- ============================================
-- STEP 7: Handle "Rs. 200 per day (0.50% of turnover max)" → "200"
-- ============================================
UPDATE compliance_templates 
SET penalty = '200'
WHERE penalty LIKE '%Rs. 200 per day%'
   AND penalty LIKE '%0.50% of turnover%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- ============================================
-- STEP 8: Handle "Rs. 1 Lakh on Company + Rs. 5000 per day on officers" → "5000"
-- ============================================
UPDATE compliance_templates 
SET penalty = '5000'
WHERE penalty LIKE '%Rs. 1 Lakh on Company + Rs. 5000 per day on officers%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 
  'Summary' as type,
  COUNT(*) as total,
  COUNT(CASE WHEN penalty IS NULL THEN 1 END) as null_count,
  COUNT(CASE WHEN penalty ~ '^[0-9]+$' THEN 1 END) as simple_numeric,
  COUNT(CASE WHEN penalty ~ '^[0-9]+\|[0-9]+$' THEN 1 END) as complex_numeric,
  COUNT(CASE WHEN penalty IS NOT NULL AND penalty !~ '^[0-9]+(\|[0-9]+)?$' THEN 1 END) as remaining_text
FROM compliance_templates;

-- Show remaining text penalties
SELECT 
  requirement,
  penalty
FROM compliance_templates
WHERE penalty IS NOT NULL 
  AND penalty !~ '^[0-9]+(\|[0-9]+)?$'
ORDER BY penalty
LIMIT 20;

COMMIT;
