-- ============================================
-- AUTO-GENERATE RECURRING COMPLIANCES
-- Automatically generates future periods when they're running low
-- This should be run periodically (e.g., daily via cron or Supabase Edge Functions)
-- ============================================

-- Function to check if a company needs more future compliance periods generated
-- Returns true if the company has less than 'p_min_months_ahead' months of future compliances
CREATE OR REPLACE FUNCTION public.needs_recurring_compliance_generation(
  p_company_id UUID,
  p_min_months_ahead INTEGER DEFAULT 6
)
RETURNS BOOLEAN AS $$
DECLARE
  v_max_future_date DATE;
  v_target_date DATE;
BEGIN
  -- Find the maximum future due date for recurring compliances
  SELECT MAX(due_date) INTO v_max_future_date
  FROM public.regulatory_requirements
  WHERE company_id = p_company_id
    AND compliance_type IN ('monthly', 'quarterly', 'annual')
    AND due_date > CURRENT_DATE;
  
  -- If no future compliances exist, we need to generate
  IF v_max_future_date IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Calculate target date (min_months_ahead from today)
  v_target_date := CURRENT_DATE + (p_min_months_ahead || ' months')::INTERVAL;
  
  -- If max future date is before target, we need to generate more
  RETURN v_max_future_date < v_target_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to automatically generate recurring compliances for companies that need them
-- This is the main function to call periodically (daily/weekly)
CREATE OR REPLACE FUNCTION public.auto_generate_recurring_compliances(
  p_min_months_ahead INTEGER DEFAULT 6,
  p_generate_months_ahead INTEGER DEFAULT 12
)
RETURNS TABLE(
  company_id UUID,
  company_name TEXT,
  periods_generated INTEGER,
  reason TEXT
) AS $$
DECLARE
  v_company RECORD;
  v_generated INTEGER;
  v_needs_generation BOOLEAN;
BEGIN
  -- Loop through all companies
  FOR v_company IN
    SELECT id, name FROM public.companies
  LOOP
    -- Check if this company needs more future periods
    SELECT public.needs_recurring_compliance_generation(v_company.id, p_min_months_ahead) INTO v_needs_generation;
    
    IF v_needs_generation THEN
      -- Generate future periods
      SELECT public.generate_recurring_compliances_for_company(
        v_company.id, 
        p_generate_months_ahead
      ) INTO v_generated;
      
      IF v_generated > 0 THEN
        company_id := v_company.id;
        company_name := v_company.name;
        periods_generated := v_generated;
        reason := 'Auto-generated: Future periods running low';
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.needs_recurring_compliance_generation(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_generate_recurring_compliances(INTEGER, INTEGER) TO authenticated;

-- ============================================
-- OPTION 1: Manual trigger on requirement completion
-- Automatically generate next period when a recurring compliance is marked as completed
-- ============================================

CREATE OR REPLACE FUNCTION public.on_recurring_compliance_completed()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
  v_compliance_type TEXT;
  v_generated INTEGER;
BEGIN
  -- Only trigger on status change to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    v_company_id := NEW.company_id;
    v_compliance_type := NEW.compliance_type;
    
    -- Only for recurring compliances
    IF v_compliance_type IN ('monthly', 'quarterly', 'annual') THEN
      -- Check if company needs more future periods
      IF public.needs_recurring_compliance_generation(v_company_id, 6) THEN
        -- Generate next 12 months of compliances
        SELECT public.generate_recurring_compliances_for_company(v_company_id, 12) INTO v_generated;
        
        RAISE NOTICE 'Auto-generated % future periods for company % after compliance completion', 
          v_generated, v_company_id;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS trigger_auto_generate_on_completion ON public.regulatory_requirements;

CREATE TRIGGER trigger_auto_generate_on_completion
  AFTER UPDATE OF status ON public.regulatory_requirements
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
  EXECUTE FUNCTION public.on_recurring_compliance_completed();

-- ============================================
-- OPTION 2: Scheduled function (call this daily via cron or Supabase Edge Function)
-- ============================================

-- Example: Call this function daily to ensure all companies have enough future periods
-- SELECT * FROM public.auto_generate_recurring_compliances(6, 12);
-- This will:
-- 1. Check all companies
-- 2. For companies with less than 6 months of future compliances, generate 12 months ahead
-- 3. Return a report of what was generated

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check which companies need more future periods
SELECT 
  c.id,
  c.name,
  MAX(rr.due_date) as max_future_date,
  CASE 
    WHEN MAX(rr.due_date) IS NULL THEN 'No future compliances'
    WHEN MAX(rr.due_date) < CURRENT_DATE + INTERVAL '6 months' THEN 'Less than 6 months ahead'
    ELSE 'OK'
  END as status
FROM public.companies c
LEFT JOIN public.regulatory_requirements rr 
  ON c.id = rr.company_id 
  AND rr.compliance_type IN ('monthly', 'quarterly', 'annual')
  AND rr.due_date > CURRENT_DATE
GROUP BY c.id, c.name
ORDER BY c.name;
