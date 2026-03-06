-- ============================================
-- COMPLIANCE VAULT SCHEMA
-- Manages document_templates_internal for global folder structure and document templates
-- Uses path format for hierarchical folders (e.g., "Parent/Child")
-- ============================================

-- ============================================
-- 1. ENSURE document_templates_internal TABLE EXISTS
-- This table should already exist, but we ensure required columns are present
-- ============================================

-- Add missing columns if they don't exist
DO $$
BEGIN
  -- Ensure folder_name column exists (should already exist)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'document_templates_internal' 
    AND column_name = 'folder_name'
  ) THEN
    ALTER TABLE public.document_templates_internal ADD COLUMN folder_name TEXT NULL;
  END IF;

  -- Ensure default_frequency column exists (should already exist)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'document_templates_internal' 
    AND column_name = 'default_frequency'
  ) THEN
    ALTER TABLE public.document_templates_internal ADD COLUMN default_frequency TEXT NULL;
  END IF;

  -- Ensure category column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'document_templates_internal' 
    AND column_name = 'category'
  ) THEN
    ALTER TABLE public.document_templates_internal ADD COLUMN category TEXT NULL;
  END IF;

  -- Ensure description column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'document_templates_internal' 
    AND column_name = 'description'
  ) THEN
    ALTER TABLE public.document_templates_internal ADD COLUMN description TEXT NULL;
  END IF;

  -- Ensure is_mandatory column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'document_templates_internal' 
    AND column_name = 'is_mandatory'
  ) THEN
    ALTER TABLE public.document_templates_internal ADD COLUMN is_mandatory BOOLEAN DEFAULT false;
  END IF;

  -- Ensure updated_at column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'document_templates_internal' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.document_templates_internal ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- ============================================
-- 2. INDEXES FOR EFFICIENT FOLDER QUERIES
-- ============================================

-- Index on folder_name for fast folder lookups
CREATE INDEX IF NOT EXISTS idx_document_templates_folder_name ON public.document_templates_internal(folder_name);

-- Index on category
CREATE INDEX IF NOT EXISTS idx_document_templates_category ON public.document_templates_internal(category) WHERE category IS NOT NULL;

-- Index on default_frequency
CREATE INDEX IF NOT EXISTS idx_document_templates_frequency ON public.document_templates_internal(default_frequency);

-- GIN index for folder_name prefix searches (for hierarchical folder queries)
-- This helps with queries like "folder_name LIKE 'GST Returns/%'"
CREATE INDEX IF NOT EXISTS idx_document_templates_folder_prefix ON public.document_templates_internal(folder_name text_pattern_ops);

-- ============================================
-- 3. HELPER FUNCTIONS FOR FOLDER OPERATIONS
-- ============================================

-- Function to split folder path into parts
CREATE OR REPLACE FUNCTION public.get_folder_path_parts(folder_path TEXT)
RETURNS TEXT[] AS $$
BEGIN
  IF folder_path IS NULL OR folder_path = '' THEN
    RETURN ARRAY[]::TEXT[];
  END IF;
  
  RETURN string_to_array(folder_path, '/');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.get_folder_path_parts IS 'Splits a folder path (e.g., "Parent/Child") into an array of parts';

-- Function to get parent folder path
CREATE OR REPLACE FUNCTION public.get_parent_folder_path(folder_path TEXT)
RETURNS TEXT AS $$
DECLARE
  parts TEXT[];
  parent_parts TEXT[];
BEGIN
  IF folder_path IS NULL OR folder_path = '' THEN
    RETURN NULL;
  END IF;
  
  parts := string_to_array(folder_path, '/');
  
  IF array_length(parts, 1) <= 1 THEN
    RETURN NULL; -- Root level folder
  END IF;
  
  -- Return all parts except the last one
  parent_parts := parts[1:array_length(parts, 1) - 1];
  RETURN array_to_string(parent_parts, '/');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.get_parent_folder_path IS 'Returns the parent folder path from a hierarchical path (e.g., "Parent" from "Parent/Child")';

-- Function to get folder name (last part of path)
CREATE OR REPLACE FUNCTION public.get_folder_name(folder_path TEXT)
RETURNS TEXT AS $$
DECLARE
  parts TEXT[];
BEGIN
  IF folder_path IS NULL OR folder_path = '' THEN
    RETURN NULL;
  END IF;
  
  parts := string_to_array(folder_path, '/');
  
  IF array_length(parts, 1) = 0 THEN
    RETURN NULL;
  END IF;
  
  RETURN parts[array_length(parts, 1)];
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.get_folder_name IS 'Returns the folder name (last part) from a hierarchical path (e.g., "Child" from "Parent/Child")';

-- Function to check if a folder path is a subfolder of another
CREATE OR REPLACE FUNCTION public.is_subfolder(child_path TEXT, parent_path TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF parent_path IS NULL OR parent_path = '' THEN
    -- Empty parent means root, so everything is a subfolder
    RETURN child_path IS NOT NULL AND child_path != '';
  END IF;
  
  IF child_path IS NULL OR child_path = '' THEN
    RETURN false;
  END IF;
  
  -- Check if child_path starts with parent_path followed by '/'
  RETURN child_path LIKE (parent_path || '/%') OR child_path = parent_path;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.is_subfolder IS 'Checks if child_path is a subfolder of parent_path';

-- Function to cascade folder rename to document_templates_internal and company_documents_internal
CREATE OR REPLACE FUNCTION public.update_folder_name_cascade(
  old_folder_path TEXT,
  new_folder_path TEXT
)
RETURNS INTEGER AS $$
DECLARE
  templates_updated INTEGER := 0;
  templates_subfolders INTEGER := 0;
  documents_updated INTEGER := 0;
  documents_subfolders INTEGER := 0;
BEGIN
  -- Validate inputs
  IF old_folder_path IS NULL OR old_folder_path = '' THEN
    RAISE EXCEPTION 'Old folder path cannot be empty';
  END IF;
  
  IF new_folder_path IS NULL OR new_folder_path = '' THEN
    RAISE EXCEPTION 'New folder path cannot be empty';
  END IF;
  
  IF old_folder_path = new_folder_path THEN
    RETURN 0; -- No change needed
  END IF;
  
  -- Update document_templates_internal
  -- Update exact matches
  UPDATE public.document_templates_internal
  SET folder_name = new_folder_path,
      updated_at = NOW()
  WHERE folder_name = old_folder_path;
  
  GET DIAGNOSTICS templates_updated = ROW_COUNT;
  
  -- Update subfolders (folders that start with old_folder_path + '/')
  UPDATE public.document_templates_internal
  SET folder_name = REPLACE(folder_name, old_folder_path, new_folder_path),
      updated_at = NOW()
  WHERE folder_name LIKE (old_folder_path || '/%');
  
  GET DIAGNOSTICS templates_subfolders = ROW_COUNT;
  
  -- Update company_documents_internal
  -- Update exact matches
  UPDATE public.company_documents_internal
  SET folder_name = new_folder_path,
      updated_at = NOW()
  WHERE folder_name = old_folder_path;
  
  GET DIAGNOSTICS documents_updated = ROW_COUNT;
  
  -- Update subfolders in company_documents_internal
  UPDATE public.company_documents_internal
  SET folder_name = REPLACE(folder_name, old_folder_path, new_folder_path),
      updated_at = NOW()
  WHERE folder_name LIKE (old_folder_path || '/%');
  
  GET DIAGNOSTICS documents_subfolders = ROW_COUNT;
  
  RETURN templates_updated + templates_subfolders + documents_updated + documents_subfolders;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.update_folder_name_cascade IS 'Renames a folder and all its subfolders in both document_templates_internal and company_documents_internal tables';

-- Function to get all unique folder paths from document_templates_internal
CREATE OR REPLACE FUNCTION public.get_all_folder_paths()
RETURNS TABLE(folder_path TEXT, document_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dt.folder_name AS folder_path,
    COUNT(*)::BIGINT AS document_count
  FROM public.document_templates_internal dt
  WHERE dt.folder_name IS NOT NULL
  GROUP BY dt.folder_name
  ORDER BY dt.folder_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.get_all_folder_paths IS 'Returns all unique folder paths and their document counts from document_templates_internal';

-- Function to check if folder has documents in company_documents_internal
CREATE OR REPLACE FUNCTION public.folder_has_documents(folder_path TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  doc_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO doc_count
  FROM public.company_documents_internal
  WHERE folder_name = folder_path 
     OR folder_name LIKE (folder_path || '/%');
  
  RETURN doc_count > 0;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.folder_has_documents IS 'Checks if a folder (or any of its subfolders) has documents in company_documents_internal';

-- ============================================
-- 4. TRIGGER FOR updated_at
-- ============================================

-- Update trigger for updated_at (if not already exists)
CREATE OR REPLACE FUNCTION update_document_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_document_templates_updated_at ON public.document_templates_internal;
CREATE TRIGGER trigger_update_document_templates_updated_at
  BEFORE UPDATE ON public.document_templates_internal
  FOR EACH ROW
  EXECUTE FUNCTION update_document_templates_updated_at();

-- ============================================
-- 5. RLS POLICIES (if not already set)
-- ============================================

-- Ensure RLS is enabled
ALTER TABLE public.document_templates_internal ENABLE ROW LEVEL SECURITY;

-- Drop and recreate read policy (allow all authenticated users to read)
DROP POLICY IF EXISTS "Anyone can read document templates" ON public.document_templates_internal;
CREATE POLICY "Anyone can read document templates"
  ON public.document_templates_internal
  FOR SELECT
  USING (true);

-- Drop and recreate modify policy (only superadmins can modify)
DROP POLICY IF EXISTS "Only superadmins can modify document templates" ON public.document_templates_internal;
CREATE POLICY "Only superadmins can modify document templates"
  ON public.document_templates_internal
  FOR ALL
  USING (
    public.is_superadmin(auth.uid())
  );

-- ============================================
-- 6. DROP OLD VAULT TABLES (if they exist)
-- These were from the previous implementation
-- ============================================

-- Drop old vault_folders table if it exists (will be handled by migration script)
-- DROP TABLE IF EXISTS public.vault_folders CASCADE;
-- DROP TABLE IF EXISTS public.vault_files CASCADE;
