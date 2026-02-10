-- ============================================
-- COMPLIANCE VAULT SCHEMA
-- Stores folders and files for compliance document management
-- ============================================

-- ============================================
-- 1. VAULT FOLDERS TABLE
-- Hierarchical folder structure for organizing compliance documents
-- ============================================
CREATE TABLE IF NOT EXISTS public.vault_folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.vault_folders(id) ON DELETE CASCADE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  -- Ensure folder names are unique within the same parent
  UNIQUE(name, parent_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vault_folders_parent_id ON public.vault_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_vault_folders_created_by ON public.vault_folders(created_by);

-- ============================================
-- 2. VAULT FILES TABLE
-- Stores file metadata and references to storage
-- ============================================
CREATE TABLE IF NOT EXISTS public.vault_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  folder_id UUID REFERENCES public.vault_folders(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL, -- Path in storage (Supabase Storage or S3)
  file_size BIGINT, -- Size in bytes
  mime_type TEXT, -- e.g., 'application/pdf', 'image/png'
  description TEXT,
  tags TEXT[], -- Array of tags for categorization
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  -- Ensure file names are unique within the same folder
  UNIQUE(name, folder_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vault_files_folder_id ON public.vault_files(folder_id);
CREATE INDEX IF NOT EXISTS idx_vault_files_created_by ON public.vault_files(created_by);
CREATE INDEX IF NOT EXISTS idx_vault_files_tags ON public.vault_files USING GIN(tags);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE public.vault_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_files ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Superadmins can manage all folders" ON public.vault_folders;
DROP POLICY IF EXISTS "Superadmins can view all folders" ON public.vault_folders;
DROP POLICY IF EXISTS "Superadmins can manage all files" ON public.vault_files;
DROP POLICY IF EXISTS "Superadmins can view all files" ON public.vault_files;

-- VAULT FOLDERS POLICIES
-- Superadmins can view all folders
CREATE POLICY "Superadmins can view all folders"
  ON public.vault_folders FOR SELECT
  USING (
    public.is_superadmin(auth.uid())
  );

-- Superadmins can manage all folders
CREATE POLICY "Superadmins can manage all folders"
  ON public.vault_folders FOR ALL
  USING (
    public.is_superadmin(auth.uid())
  );

-- VAULT FILES POLICIES
-- Superadmins can view all files
CREATE POLICY "Superadmins can view all files"
  ON public.vault_files FOR SELECT
  USING (
    public.is_superadmin(auth.uid())
  );

-- Superadmins can manage all files
CREATE POLICY "Superadmins can manage all files"
  ON public.vault_files FOR ALL
  USING (
    public.is_superadmin(auth.uid())
  );

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to get folder path (breadcrumb)
CREATE OR REPLACE FUNCTION public.get_folder_path(folder_uuid UUID)
RETURNS TEXT[] AS $$
DECLARE
  path TEXT[] := ARRAY[]::TEXT[];
  current_folder RECORD;
BEGIN
  -- Start with the given folder
  SELECT name, parent_id INTO current_folder
  FROM public.vault_folders
  WHERE id = folder_uuid;
  
  -- If folder doesn't exist, return empty array
  IF NOT FOUND THEN
    RETURN path;
  END IF;
  
  -- Build path by traversing up the tree
  WHILE current_folder IS NOT NULL LOOP
    path := ARRAY[current_folder.name] || path;
    
    IF current_folder.parent_id IS NOT NULL THEN
      SELECT name, parent_id INTO current_folder
      FROM public.vault_folders
      WHERE id = current_folder.parent_id;
    ELSE
      current_folder := NULL;
    END IF;
  END LOOP;
  
  RETURN path;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.get_folder_path IS 'Returns the full path of a folder as an array of folder names';
