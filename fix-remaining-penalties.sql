-- ============================================
-- FIX REMAINING PENALTY TEXT CASES
-- ============================================
-- This handles the specific cases that weren't converted
-- Run this AFTER the main update-penalty-to-numbers.sql

BEGIN;

-- ============================================
-- STEP 1: Fix "Rs. 200 per day u/s 234E" → "200"
-- ============================================
UPDATE compliance_templates 
SET penalty = '200'
WHERE penalty LIKE '%Rs. 200 per day%'
   AND penalty LIKE '%u/s 234E%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';  -- Not already numeric

-- ============================================
-- STEP 2: Fix "Rs. 50 per day (Rs. 20 for NIL return)" → "50"
-- ============================================
UPDATE compliance_templates 
SET penalty = '50'
WHERE penalty LIKE '%Rs. 50 per day%'
   AND (penalty LIKE '%NIL return%' OR penalty LIKE '%NIL).%')
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';  -- Not already numeric

-- ============================================
-- STEP 3: Fix "Rs. 50 per day (Rs. 25 CGST + Rs. 25 SGST) up to max Rs. 2000" → "50|2000"
-- ============================================
UPDATE compliance_templates 
SET penalty = '50|2000'
WHERE penalty LIKE '%Rs. 50 per day%'
   AND penalty LIKE '%CGST%'
   AND penalty LIKE '%max Rs. 2000%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';  -- Not already numeric

-- ============================================
-- STEP 4: Fix "Interest @ 18% p.a. on tax amount + Late fee for GSTR-4" → NULL
-- ============================================
UPDATE compliance_templates 
SET penalty = NULL
WHERE penalty LIKE '%Interest @ 18% p.a. on tax amount%'
   AND penalty LIKE '%Late fee for GSTR-4%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';  -- Not already numeric

-- ============================================
-- STEP 5: More aggressive pattern matching for remaining "Rs. X per day" cases
-- ============================================

-- Any "Rs. 50 per day" that hasn't been converted yet
UPDATE compliance_templates 
SET penalty = '50'
WHERE penalty LIKE '%Rs. 50 per day%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$'  -- Not already numeric
   AND penalty NOT LIKE '%max Rs. 2000%'  -- Not the complex one
   AND penalty NOT LIKE '%Interest @ 18%';  -- Not interest-based

-- Any "Rs. 100 per day" that hasn't been converted yet
UPDATE compliance_templates 
SET penalty = '100'
WHERE penalty LIKE '%Rs. 100 per day%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$'  -- Not already numeric
   AND penalty NOT LIKE '%5 Lakh%'  -- Not the complex one
   AND penalty NOT LIKE '%up to Rs. 5 Lakh%';

-- Any "Rs. 200 per day" that hasn't been converted yet
UPDATE compliance_templates 
SET penalty = '200'
WHERE penalty LIKE '%Rs. 200 per day%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$'  -- Not already numeric
   AND penalty NOT LIKE '%0.50% of turnover%';

-- ============================================
-- VERIFICATION: Check what's still remaining
-- ============================================

-- Show remaining text penalties that need attention
SELECT 
  requirement,
  penalty,
  CASE 
    WHEN penalty LIKE '%Rs. 50 per day%' THEN 'Should be 50 or 50|2000'
    WHEN penalty LIKE '%Rs. 100 per day%' THEN 'Should be 100 or 100|500000'
    WHEN penalty LIKE '%Rs. 200 per day%' THEN 'Should be 200'
    WHEN penalty LIKE '%Interest%' THEN 'Should be NULL'
    ELSE 'Needs review'
  END as expected_format
FROM compliance_templates
WHERE penalty IS NOT NULL 
  AND penalty !~ '^[0-9]+(\|[0-9]+)?$'  -- Not numeric format
ORDER BY penalty;

-- Summary
SELECT 
  COUNT(*) as total_penalties,
  COUNT(CASE WHEN penalty IS NULL THEN 1 END) as null_penalties,
  COUNT(CASE WHEN penalty ~ '^[0-9]+$' THEN 1 END) as simple_numeric,
  COUNT(CASE WHEN penalty ~ '^[0-9]+\|[0-9]+$' THEN 1 END) as complex_numeric,
  COUNT(CASE WHEN penalty IS NOT NULL AND penalty !~ '^[0-9]+(\|[0-9]+)?$' THEN 1 END) as remaining_text
FROM compliance_templates;

COMMIT;
