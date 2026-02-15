-- Migration: Add ex_directors column to companies table
-- This column stores former/ex-directors as a TEXT array

-- Add ex_directors column if it doesn't exist
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS ex_directors TEXT[] DEFAULT NULL;

-- Create index for ex_directors array searches (optional, for future queries)
CREATE INDEX IF NOT EXISTS idx_companies_ex_directors ON public.companies USING GIN(ex_directors);

-- Add comment
COMMENT ON COLUMN public.companies.ex_directors IS 'Array of ex-director/former director names (e.g., ["John Doe", "Jane Smith"])';
