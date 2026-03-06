-- ============================================
-- UPDATE PENALTY VALUES TO NUMBERS
-- ============================================
-- This converts complex penalty strings to simple numbers
-- 
-- FORMAT:
--   "50"           = Rs. 50 per day
--   "100|500000"   = Rs. 100 per day, max Rs. 5 Lakh (daily|max_cap)
--   "500|100000"   = Rs. 1 Lakh base + Rs. 500 per day (base|daily)
--   NULL           = Cannot calculate (interest-based, vague, etc.)
--
-- USAGE IN FRONTEND:
--   If penalty is "50": calculate = 50 * days_delayed
--   If penalty is "100|500000": calculate = min(100 * days_delayed, 500000)
--   If penalty is "500|100000": calculate = 100000 + (500 * days_delayed)
--   If penalty is NULL: show "Refer to Act" or "Cannot calculate"
--
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: COMPLEX PENALTIES (handle first, most specific)
-- ============================================

-- Rs. 100 per day + Rs. 5 Lakh max → "100|500000"
UPDATE compliance_templates 
SET penalty = '100|500000'
WHERE penalty LIKE '%Rs. 100 per day%' 
   AND (penalty LIKE '%5 Lakh%' OR penalty LIKE '%up to Rs. 5 Lakh%');

-- Rs. 50 per day with max Rs. 2000 → "50|2000"
UPDATE compliance_templates 
SET penalty = '50|2000'
WHERE penalty LIKE '%Rs. 50 per day%' 
   AND penalty LIKE '%max Rs. 2000%';

-- Rs. 1 Lakh + Rs. 500 per day → "500|100000" (base + daily)
UPDATE compliance_templates 
SET penalty = '500|100000'
WHERE penalty LIKE '%Rs. 1 Lakh + Rs. 500 per day%';

-- Rs. 5000 + Rs. 500 per day → "500|5000" (base + daily)
UPDATE compliance_templates 
SET penalty = '500|5000'
WHERE penalty LIKE '%Rs. 5000 + Rs. 500 per day%';

-- Interest @ 18% + Late fee Rs. 50/day → extract just "50"
UPDATE compliance_templates 
SET penalty = '50'
WHERE penalty LIKE '%Interest @ 18% p.a. + Late fee Rs. 50%';

-- ============================================
-- STEP 2: SIMPLE DAILY RATES
-- ============================================

-- Rs. 200 per day (simple - only if doesn't have max/percentage)
UPDATE compliance_templates 
SET penalty = '200'
WHERE penalty LIKE '%Rs. 200 per day%'
   AND penalty NOT LIKE '%|%'  -- Not already updated to complex
   AND penalty NOT LIKE '%0.50% of turnover%';

-- Rs. 100 per day (simple, no max - exclude already processed)
UPDATE compliance_templates 
SET penalty = '100'
WHERE penalty LIKE '%Rs. 100 per day%'
   AND penalty NOT LIKE '%|%'  -- Not already updated to complex
   AND penalty NOT LIKE '%5 Lakh%';

-- Rs. 50 per day (simple, no max - exclude already processed)
UPDATE compliance_templates 
SET penalty = '50'
WHERE (penalty LIKE '%Rs. 50 per day%' 
    OR penalty LIKE '%Rs. 50/day%'
    OR penalty LIKE '%Late fee Rs. 50%')
   AND penalty NOT LIKE '%|%'  -- Not already updated to complex
   AND penalty NOT LIKE '%max Rs. 2000%'
   AND penalty NOT LIKE '%Interest @ 18%';  -- Already handled above

-- Rs. 500 per day (simple - exclude already processed)
UPDATE compliance_templates 
SET penalty = '500'
WHERE penalty LIKE '%Rs. 500 per day%'
   AND penalty NOT LIKE '%|%';  -- Not already updated to complex

-- Rs. 5 per day
UPDATE compliance_templates 
SET penalty = '5'
WHERE penalty LIKE '%Rs. 5 per day%' 
   OR penalty LIKE '%up to Rs. 5 per day%';

-- ============================================
-- STEP 3: FIXED AMOUNTS (one-time penalties)
-- ============================================

-- Rs. 5000 fixed (only if it's a fixed amount, not "Rs. 5000 + ...")
UPDATE compliance_templates 
SET penalty = '5000'
WHERE penalty LIKE '%Rs. 5000%' 
   AND (penalty LIKE '%after due date%' 
     OR penalty = 'Rs. 5000 (after due date).')
   AND penalty NOT LIKE '%Rs. 5000 +%';  -- Exclude "Rs. 5000 + Rs. 500 per day"

-- ============================================
-- STEP 4: RANGE PENALTIES (store minimum)
-- ============================================

-- Rs. 25k to Rs. 3L → "25000" (minimum)
UPDATE compliance_templates 
SET penalty = '25000'
WHERE penalty LIKE '%Rs. 25k to Rs. 3L%';

-- Rs. 25000 to Rs. 1 Lakh → "25000" (minimum)
UPDATE compliance_templates 
SET penalty = '25000'
WHERE penalty LIKE '%Rs. 25000 to Rs. 1 Lakh%';

-- ============================================
-- STEP 5: INTEREST-BASED (cannot calculate) → NULL
-- ============================================

-- Pure interest penalties (no late fee component)
UPDATE compliance_templates 
SET penalty = NULL
WHERE (penalty LIKE '%Interest @ 1.5% per month%'
    OR penalty LIKE '%Interest @ 1% per month%'
    OR penalty LIKE '%Interest @ 2% per month%'
    OR penalty LIKE '%Interest @ 12% p.a.%'
    OR penalty LIKE '%Interest u/s 234A%'
    OR penalty LIKE '%Interest u/s 234B%'
    OR penalty LIKE '%Interest u/s 234C%')
   AND penalty NOT LIKE '%Late fee%';

-- Interest on tax amount (needs principal) - but check if already updated
UPDATE compliance_templates 
SET penalty = NULL
WHERE penalty LIKE '%Interest @ 18% p.a. on tax amount%'
   AND penalty NOT LIKE '%Late fee%';

-- ============================================
-- STEP 6: VAGUE / CANNOT CALCULATE → NULL
-- ============================================

-- "Penalty as per X Act" (only if not already a number)
UPDATE compliance_templates 
SET penalty = NULL
WHERE penalty LIKE '%Penalty as per%Act%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';  -- Not already converted to number

-- Percentage of turnover/tax
UPDATE compliance_templates 
SET penalty = NULL
WHERE (penalty LIKE '%0.5% of Turnover%'
    OR penalty LIKE '%100% of tax due%'
    OR penalty LIKE '%whichever is%')
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';  -- Not already converted

-- Complex section-based penalties
UPDATE compliance_templates 
SET penalty = NULL
WHERE (penalty LIKE '%Late fee u/s 234F%'
    OR penalty LIKE '%Penalty u/s 271H%')
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';  -- Not already converted

-- ============================================
-- STEP 7: HANDLE REMAINING TEXT CASES
-- ============================================

-- "Penalty as per RBI guidelines" → NULL
UPDATE compliance_templates 
SET penalty = NULL
WHERE penalty LIKE '%Penalty as per%guidelines%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- "12% Interest p.a. + Penal damages" → NULL (percentage-based)
UPDATE compliance_templates 
SET penalty = NULL
WHERE penalty LIKE '%12% Interest p.a.%'
   OR penalty LIKE '%Penal damages%';

-- "Interest @ 18% p.a. on tax amount + Late fee for GSTR-4" → NULL (no specific late fee amount)
UPDATE compliance_templates 
SET penalty = NULL
WHERE penalty LIKE '%Interest @ 18% p.a. on tax amount + Late fee for GSTR-4%';

-- "Rs. 200 per day (0.50% of turnover max)" → "200" (extract daily rate, ignore percentage max)
UPDATE compliance_templates 
SET penalty = '200'
WHERE penalty LIKE '%Rs. 200 per day%'
   AND penalty LIKE '%0.50% of turnover max%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- "Rs. 1 Lakh on Company + Rs. 5000 per day on officers" → "5000" (extract officers penalty)
UPDATE compliance_templates 
SET penalty = '5000'
WHERE penalty LIKE '%Rs. 1 Lakh on Company + Rs. 5000 per day on officers%';

-- ============================================
-- VERIFICATION QUERY
-- ============================================

-- Check results summary
SELECT 
  COUNT(*) as total_with_penalty,
  COUNT(CASE WHEN penalty IS NULL THEN 1 END) as null_penalties,
  COUNT(CASE WHEN penalty LIKE '%|%' THEN 1 END) as complex_penalties,
  COUNT(CASE WHEN penalty ~ '^[0-9]+$' THEN 1 END) as simple_penalties,
  COUNT(CASE WHEN penalty IS NOT NULL AND penalty !~ '^[0-9]+(\|[0-9]+)?$' THEN 1 END) as remaining_text_penalties
FROM compliance_templates;

-- Show sample of each type
(SELECT 
  'Simple daily rate' as type,
  requirement,
  penalty
FROM compliance_templates
WHERE penalty ~ '^[0-9]+$'
LIMIT 5)

UNION ALL

(SELECT 
  'Complex (with max/base)' as type,
  requirement,
  penalty
FROM compliance_templates
WHERE penalty LIKE '%|%'
LIMIT 5)

UNION ALL

(SELECT 
  'NULL (cannot calculate)' as type,
  requirement,
  COALESCE(penalty, 'NULL') as penalty
FROM compliance_templates
WHERE penalty IS NULL
LIMIT 5)

UNION ALL

(SELECT 
  'REMAINING TEXT (needs review)' as type,
  requirement,
  penalty
FROM compliance_templates
WHERE penalty IS NOT NULL 
  AND penalty !~ '^[0-9]+(\|[0-9]+)?$'
LIMIT 10);

COMMIT;
