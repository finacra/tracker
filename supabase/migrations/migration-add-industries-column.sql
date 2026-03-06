-- Add industries column to companies table for multi-industry support
-- This allows companies to match templates with multiple industries

ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS industries TEXT[] DEFAULT NULL;

-- Create index for GIN (Generalized Inverted Index) for array operations
CREATE INDEX IF NOT EXISTS idx_companies_industries ON public.companies USING GIN(industries);

-- Comment on the column
COMMENT ON COLUMN public.companies.industries IS 'Array of industries the company operates in (e.g., ["IT & Technology Services", "Healthcare"])';

-- Note: The existing 'industry' column (single TEXT) is kept for backward compatibility
-- Companies can have both 'industry' (legacy) and 'industries' (new) populated
