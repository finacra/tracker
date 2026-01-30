-- ============================================
-- UPDATE PENALTIES BASED ON CSV DATA
-- ============================================
-- This converts all penalty strings to match the actual formats from the CSV
-- Run this to ensure all penalties are calculated correctly

BEGIN;

-- ============================================
-- STEP 1: Simple daily rates
-- ============================================

-- "100/day" → "100"
UPDATE compliance_templates 
SET penalty = '100'
WHERE penalty LIKE '%100/day%'
   OR penalty LIKE '%Rs. 100 per day%'
   OR penalty LIKE '%100 per day%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- "200/day" → "200"
UPDATE compliance_templates 
SET penalty = '200'
WHERE penalty LIKE '%200/day%'
   OR penalty LIKE '%Rs. 200 per day%'
   OR penalty LIKE '%200 per day%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- "50/day" → "50" (simple, no max)
UPDATE compliance_templates 
SET penalty = '50'
WHERE (penalty LIKE '%50/day%'
    OR penalty LIKE '%Rs. 50 per day%'
    OR penalty LIKE '%50 per day%')
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$'
   AND penalty NOT LIKE '%Max 2000%'
   AND penalty NOT LIKE '%max Rs. 2000%'
   AND penalty NOT LIKE '%Max 500000%'
   AND penalty NOT LIKE '%max Rs. 5 Lakh%';

-- "500/day" → "500"
UPDATE compliance_templates 
SET penalty = '500'
WHERE penalty LIKE '%500/day%'
   OR penalty LIKE '%Rs. 500 per day%'
   OR penalty LIKE '%500 per day%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- "5/day" → "5"
UPDATE compliance_templates 
SET penalty = '5'
WHERE penalty LIKE '%5/day%'
   OR penalty LIKE '%Rs. 5 per day%'
   OR penalty LIKE '%5 per day%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- ============================================
-- STEP 2: Daily rates with max caps
-- ============================================

-- "50/day (Max 2000)" → "50|2000"
UPDATE compliance_templates 
SET penalty = '50|2000'
WHERE (penalty LIKE '%50/day%' OR penalty LIKE '%Rs. 50 per day%')
   AND (penalty LIKE '%Max 2000%' OR penalty LIKE '%max Rs. 2000%' OR penalty LIKE '%max 2000%')
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- "100/day (Max 500000)" → "100|500000"
UPDATE compliance_templates 
SET penalty = '100|500000'
WHERE (penalty LIKE '%100/day%' OR penalty LIKE '%Rs. 100 per day%')
   AND (penalty LIKE '%Max 500000%' OR penalty LIKE '%max Rs. 5 Lakh%' OR penalty LIKE '%5 Lakh%')
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- "200/day (Max 0.5% TO)" → "200" (ignore percentage max, use daily rate)
UPDATE compliance_templates 
SET penalty = '200'
WHERE (penalty LIKE '%200/day%' OR penalty LIKE '%Rs. 200 per day%')
   AND penalty LIKE '%0.5% TO%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- ============================================
-- STEP 3: Base amount + daily rate
-- ============================================

-- "5000 + 500/day" → "500|5000" (daily|base)
UPDATE compliance_templates 
SET penalty = '500|5000'
WHERE (penalty LIKE '%5000 + 500/day%'
    OR penalty LIKE '%Rs. 5000 + Rs. 500 per day%'
    OR penalty LIKE '%5000 + 500 per day%')
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- ============================================
-- STEP 4: Fixed amounts
-- ============================================

-- "5000" (fixed) → "5000"
UPDATE compliance_templates 
SET penalty = '5000'
WHERE (penalty LIKE '%5000%'
    OR penalty LIKE '%Rs. 5000%')
   AND (penalty LIKE '%after due date%'
     OR penalty LIKE '%Income < 5L: 1000%'
     OR penalty LIKE '%Director KYC%'
     OR penalty = 'Rs. 5000 (after due date).')
   AND penalty NOT LIKE '%5000 +%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- "1000" (for income < 5L) → "1000"
UPDATE compliance_templates 
SET penalty = '1000'
WHERE penalty LIKE '%Income < 5L: 1000%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- ============================================
-- STEP 5: Range penalties (store minimum)
-- ============================================

-- "25000-300000" → "25000"
UPDATE compliance_templates 
SET penalty = '25000'
WHERE penalty LIKE '%25000-300000%'
   OR penalty LIKE '%Rs. 25k to Rs. 3L%'
   OR penalty LIKE '%25000 to 300000%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- "10000-100000" → "10000" (for TDS/TCS penalties)
UPDATE compliance_templates 
SET penalty = '10000'
WHERE penalty LIKE '%10000-100000%'
   OR penalty LIKE '%Rs. 10k to 1L%'
   OR penalty LIKE '%10k to 1L%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- ============================================
-- STEP 6: Interest + Late fee combinations
-- ============================================

-- "18% p.a. + 50/day (NIL: 20)" → "50" (extract late fee)
UPDATE compliance_templates 
SET penalty = '50'
WHERE (penalty LIKE '%18% p.a. + 50/day%'
    OR penalty LIKE '%Interest @ 18% p.a. + Late fee Rs. 50%'
    OR penalty LIKE '%18% p.a. + Late fee Rs. 50%')
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- "2%/month + 5/day" → "5" (extract daily rate)
UPDATE compliance_templates 
SET penalty = '5'
WHERE (penalty LIKE '%2%/month + 5/day%'
    OR penalty LIKE '%Interest @ 2% per month + Penalty up to Rs. 5 per day%'
    OR penalty LIKE '%2% per month + Rs. 5 per day%')
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- "200/day + 10000-100000" → "200" (extract daily rate, ignore range)
UPDATE compliance_templates 
SET penalty = '200'
WHERE (penalty LIKE '%200/day + 10000%'
    OR penalty LIKE '%Rs. 200 per day%'
    OR penalty LIKE '%200 per day%')
   AND penalty LIKE '%10000-100000%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- ============================================
-- STEP 7: Interest-based (cannot calculate) → NULL
-- ============================================

-- "1.5%/month" → NULL
UPDATE compliance_templates 
SET penalty = NULL
WHERE (penalty LIKE '%1.5%/month%'
    OR penalty LIKE '%Interest @ 1.5% per month%'
    OR penalty LIKE '%1.5% per month%')
   AND penalty NOT LIKE '%+%'  -- Exclude if has additional calculable component
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- "12% p.a." → NULL
UPDATE compliance_templates 
SET penalty = NULL
WHERE (penalty LIKE '%12% p.a.%'
    OR penalty LIKE '%Interest @ 12% p.a.%'
    OR penalty LIKE '%12% Interest p.a.%')
   AND penalty NOT LIKE '%+%'  -- Exclude if has additional calculable component
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- "12% p.a. + 5%-25% damages" → NULL (percentage-based damages)
UPDATE compliance_templates 
SET penalty = NULL
WHERE penalty LIKE '%12% p.a. + 5%-25% damages%'
   OR penalty LIKE '%12% Interest p.a. + Penal damages%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- "18% p.a. + Late Fee" (no specific amount) → NULL
UPDATE compliance_templates 
SET penalty = NULL
WHERE (penalty LIKE '%18% p.a. + Late Fee%'
    OR penalty LIKE '%Interest @ 18% p.a. on tax amount + Late fee for GSTR-4%'
    OR penalty LIKE '%18% p.a. on tax amount + Late fee%')
   AND penalty NOT LIKE '%50/day%'
   AND penalty NOT LIKE '%Rs. 50%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- "5000 + Interest" → NULL
UPDATE compliance_templates 
SET penalty = NULL
WHERE penalty LIKE '%5000 + Interest%'
   OR penalty LIKE '%Rs. 5000 + Interest%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- ============================================
-- STEP 8: Percentage-based (cannot calculate) → NULL
-- ============================================

-- "100% Tax or 10000/invoice" → NULL (complex, depends on tax amount)
UPDATE compliance_templates 
SET penalty = NULL
WHERE penalty LIKE '%100% Tax%'
   OR penalty LIKE '%100% of tax due%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- "0.5% TO (Max 150000)" → NULL (percentage of turnover)
UPDATE compliance_templates 
SET penalty = NULL
WHERE penalty LIKE '%0.5% TO%'
   OR penalty LIKE '%0.5% of Turnover%'
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- ============================================
-- STEP 9: Handle "50/day (NIL: 20/day)" → "50" (use main rate)
-- ============================================
UPDATE compliance_templates 
SET penalty = '50'
WHERE (penalty LIKE '%50/day%' OR penalty LIKE '%Rs. 50 per day%')
   AND (penalty LIKE '%NIL: 20%' OR penalty LIKE '%NIL return%')
   AND penalty !~ '^[0-9]+(\|[0-9]+)?$';

-- ============================================
-- VERIFICATION
-- ============================================

-- Summary
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
LIMIT 30;

COMMIT;
