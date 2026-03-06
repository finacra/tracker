-- ============================================
-- AUTO-UPDATE OVERDUE STATUS
-- Automatically changes status from 'not_started' to 'overdue'
-- when due_date has passed
-- ============================================

-- Function to update all overdue compliance requirements
CREATE OR REPLACE FUNCTION public.update_overdue_statuses()
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER;
  v_system_user UUID;
BEGIN
  -- Get a system user (first superadmin or created_by from the requirement)
  -- This is needed for the status history audit log
  SELECT user_id INTO v_system_user 
  FROM public.user_roles 
  WHERE role = 'superadmin' AND company_id IS NULL 
  LIMIT 1;

  -- Update status to 'overdue' where:
  -- 1. Current status is 'not_started', 'upcoming', or 'pending'
  -- 2. Due date has passed (is before current date)
  -- 3. Status is not already 'completed' or 'overdue'
  UPDATE public.regulatory_requirements
  SET 
    status = 'overdue',
    updated_at = NOW(),
    updated_by = COALESCE(updated_by, created_by, v_system_user)
  WHERE 
    status IN ('not_started', 'upcoming', 'pending')
    AND due_date < CURRENT_DATE
    AND status != 'completed';
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RAISE NOTICE 'Updated % requirements to overdue status', v_updated_count;
  
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update overdue status for a specific company
CREATE OR REPLACE FUNCTION public.update_company_overdue_statuses(p_company_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER;
  v_system_user UUID;
BEGIN
  -- Get a system user (first superadmin or fallback)
  SELECT user_id INTO v_system_user 
  FROM public.user_roles 
  WHERE role = 'superadmin' AND company_id IS NULL 
  LIMIT 1;

  UPDATE public.regulatory_requirements
  SET 
    status = 'overdue',
    updated_at = NOW(),
    updated_by = COALESCE(updated_by, created_by, v_system_user)
  WHERE 
    company_id = p_company_id
    AND status IN ('not_started', 'upcoming', 'pending')
    AND due_date < CURRENT_DATE
    AND status != 'completed';
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- OPTION 1: Trigger on SELECT (via a view)
-- Create a view that always shows current status
-- ============================================

CREATE OR REPLACE VIEW public.regulatory_requirements_live AS
SELECT 
  id,
  company_id,
  template_id,
  category,
  requirement,
  description,
  CASE 
    WHEN status = 'completed' THEN 'completed'
    WHEN status = 'overdue' THEN 'overdue'
    WHEN due_date < CURRENT_DATE AND status IN ('not_started', 'upcoming', 'pending') THEN 'overdue'
    ELSE status
  END AS status,
  due_date,
  penalty,
  is_critical,
  financial_year,
  compliance_type,
  created_at,
  updated_at,
  created_by,
  updated_by,
  entity_type,
  industry,
  industry_category
FROM public.regulatory_requirements;

-- ============================================
-- RUN THE UPDATE NOW
-- This will update all existing overdue requirements
-- ============================================

SELECT public.update_overdue_statuses() AS requirements_marked_overdue;

-- Show how many are now overdue
SELECT 
  status,
  COUNT(*) as count
FROM public.regulatory_requirements
GROUP BY status
ORDER BY count DESC;
