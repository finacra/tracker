-- Migration: Allow NULL due dates in regulatory_requirements
-- This allows compliances to be created without due dates (e.g., informational compliances)

-- Step 1: Allow NULL due_date in regulatory_requirements table
ALTER TABLE public.regulatory_requirements 
  ALTER COLUMN due_date DROP NOT NULL;

-- Step 2: Drop existing calculate_due_date function(s) if they exist
-- Drop with exact signature to avoid ambiguity
-- Note: If this fails, you may need to drop other overloaded versions first
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop all versions of calculate_due_date function
  FOR r IN 
    SELECT proname, oidvectortypes(proargtypes) as argtypes
    FROM pg_proc 
    WHERE proname = 'calculate_due_date' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.%s(%s) CASCADE', r.proname, r.argtypes);
  END LOOP;
END $$;

-- Step 3: Update calculate_due_date function to return NULL when no due date information is provided
CREATE OR REPLACE FUNCTION public.calculate_due_date(
  p_compliance_type TEXT,
  p_due_date DATE DEFAULT NULL,
  p_due_date_offset INTEGER DEFAULT NULL,
  p_due_month INTEGER DEFAULT NULL,
  p_due_day INTEGER DEFAULT NULL,
  p_financial_year TEXT DEFAULT NULL,
  p_base_date DATE DEFAULT CURRENT_DATE,
  p_year_type TEXT DEFAULT 'FY'
)
RETURNS DATE AS $$
DECLARE
  v_due_date DATE;
  v_fy_start DATE;
  v_fy_end DATE;
  v_year INTEGER;
  v_month INTEGER;
  v_day INTEGER;
  v_quarter_start_month INTEGER;
  v_year_type TEXT;
BEGIN
  -- Normalize year_type: default to 'FY' if NULL or invalid
  v_year_type := COALESCE(NULLIF(p_year_type, ''), 'FY');
  IF v_year_type NOT IN ('FY', 'CY') THEN
    v_year_type := 'FY';
  END IF;
  
  CASE p_compliance_type
    WHEN 'one-time' THEN
      -- Return provided due_date, or NULL if not provided
      RETURN p_due_date;
    
    WHEN 'monthly' THEN
      -- Calculate based on offset (e.g., 15th of current month)
      IF p_due_date_offset IS NULL THEN
        RETURN NULL;  -- Changed: Return NULL instead of p_base_date
      END IF;
      -- Get first day of current month, add offset
      v_due_date := DATE_TRUNC('month', p_base_date)::DATE + (p_due_date_offset - 1);
      -- If date has passed this month, move to next month
      IF v_due_date < p_base_date THEN
        v_due_date := v_due_date + INTERVAL '1 month';
      END IF;
      RETURN v_due_date;
    
    WHEN 'quarterly' THEN
      -- Calculate based on quarter, month in quarter, and day
      IF p_due_month IS NOT NULL AND p_due_day IS NOT NULL THEN
        v_month := EXTRACT(MONTH FROM p_base_date)::INTEGER;
        v_year := EXTRACT(YEAR FROM p_base_date)::INTEGER;
        
        -- Determine quarter start month based on year_type
        IF v_year_type = 'FY' THEN
          IF v_month >= 4 AND v_month <= 6 THEN
            v_quarter_start_month := 4;
          ELSIF v_month >= 7 AND v_month <= 9 THEN
            v_quarter_start_month := 7;
          ELSIF v_month >= 10 AND v_month <= 12 THEN
            v_quarter_start_month := 10;
          ELSE
            v_quarter_start_month := 1;
          END IF;
        ELSE
          IF v_month <= 3 THEN
            v_quarter_start_month := 1;
          ELSIF v_month <= 6 THEN
            v_quarter_start_month := 4;
          ELSIF v_month <= 9 THEN
            v_quarter_start_month := 7;
          ELSE
            v_quarter_start_month := 10;
          END IF;
        END IF;
        
        v_fy_start := MAKE_DATE(v_year, v_quarter_start_month, 1);
        v_due_date := v_fy_start + (p_due_month - 1) * INTERVAL '1 month' + (p_due_day - 1) * INTERVAL '1 day';
        
        IF v_due_date < p_base_date THEN
          v_due_date := v_due_date + INTERVAL '3 months';
        END IF;
        RETURN v_due_date;
      ELSIF p_due_date_offset IS NOT NULL THEN
        -- Fallback to offset-based calculation (legacy support)
        v_month := EXTRACT(MONTH FROM p_base_date)::INTEGER;
        v_year := EXTRACT(YEAR FROM p_base_date)::INTEGER;
        
        IF v_year_type = 'FY' THEN
          IF v_month >= 4 AND v_month <= 6 THEN
            v_quarter_start_month := 4;
          ELSIF v_month >= 7 AND v_month <= 9 THEN
            v_quarter_start_month := 7;
          ELSIF v_month >= 10 AND v_month <= 12 THEN
            v_quarter_start_month := 10;
          ELSE
            v_quarter_start_month := 1;
          END IF;
        ELSE
          IF v_month <= 3 THEN
            v_quarter_start_month := 1;
          ELSIF v_month <= 6 THEN
            v_quarter_start_month := 4;
          ELSIF v_month <= 9 THEN
            v_quarter_start_month := 7;
          ELSE
            v_quarter_start_month := 10;
          END IF;
        END IF;
        
        v_fy_start := MAKE_DATE(v_year, v_quarter_start_month, 1);
        v_due_date := v_fy_start + (p_due_date_offset - 1) * INTERVAL '1 day';
        
        IF v_due_date < p_base_date THEN
          v_due_date := v_due_date + INTERVAL '3 months';
        END IF;
        RETURN v_due_date;
      ELSE
        RETURN NULL;  -- Changed: Return NULL if no due date information provided
      END IF;
    
    WHEN 'annual' THEN
      -- Calculate based on month and day
      IF p_due_month IS NOT NULL AND p_due_day IS NOT NULL THEN
        v_month := EXTRACT(MONTH FROM p_base_date)::INTEGER;
        v_year := EXTRACT(YEAR FROM p_base_date)::INTEGER;
        
        v_due_date := MAKE_DATE(v_year, p_due_month, p_due_day);
        
        IF v_due_date < p_base_date THEN
          v_due_date := MAKE_DATE(v_year + 1, p_due_month, p_due_day);
        END IF;
        RETURN v_due_date;
      ELSE
        RETURN NULL;  -- Changed: Return NULL if no due date information provided
      END IF;
    
    ELSE
      -- Unknown compliance type
      RETURN NULL;  -- Changed: Return NULL instead of p_base_date
  END CASE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.calculate_due_date IS 'Calculates due date based on compliance type and parameters. Returns NULL if no due date information is provided.';
