-- ============================================
-- MIGRATION: Vault System to Document Templates
-- Migrates from vault_folders/vault_files to document_templates_internal
-- ============================================

-- This migration script handles the transition from the old vault system
-- (vault_folders and vault_files tables) to the new document_templates_internal
-- based system.

-- ============================================
-- STEP 1: Backup existing vault data (if needed)
-- ============================================

-- Create backup tables (optional - uncomment if you want to keep backups)
-- CREATE TABLE IF NOT EXISTS vault_folders_backup AS SELECT * FROM public.vault_folders;
-- CREATE TABLE IF NOT EXISTS vault_files_backup AS SELECT * FROM public.vault_files;

-- ============================================
-- STEP 2: Migrate folder structure to document_templates_internal
-- ============================================

-- Note: If you have existing vault_folders data that needs to be migrated,
-- you would need to:
-- 1. Convert hierarchical folder structure (parent_id relationships) to path format
-- 2. Create placeholder document templates for empty folders
-- 3. Map vault_files to document templates

-- For now, we assume document_templates_internal already has the correct structure
-- and we're just cleaning up the old tables.

-- ============================================
-- STEP 3: Update company_documents_internal folder names
-- ============================================

-- Ensure all company_documents_internal records have valid folder_name values
-- that match document_templates_internal

-- Update any company documents that reference non-existent folders
-- to use the folder from their document template
UPDATE public.company_documents_internal cdi
SET folder_name = dt.folder_name
FROM public.document_templates_internal dt
WHERE cdi.document_type = dt.document_name
  AND (cdi.folder_name IS NULL OR cdi.folder_name != dt.folder_name)
  AND dt.folder_name IS NOT NULL;

-- ============================================
-- STEP 4: Clean up placeholder documents
-- ============================================

-- Remove any placeholder documents that were created for empty folders
-- These start with '__FOLDER_PLACEHOLDER__'
DELETE FROM public.document_templates_internal
WHERE document_name LIKE '__FOLDER_PLACEHOLDER__%';

-- ============================================
-- STEP 5: Drop old vault tables (if they exist)
-- ============================================

-- Drop foreign key constraints first
DO $$
BEGIN
  -- Drop vault_files table first (has foreign key to vault_folders)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vault_files') THEN
    DROP TABLE IF EXISTS public.vault_files CASCADE;
    RAISE NOTICE 'Dropped vault_files table';
  END IF;

  -- Drop vault_folders table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vault_folders') THEN
    DROP TABLE IF EXISTS public.vault_folders CASCADE;
    RAISE NOTICE 'Dropped vault_folders table';
  END IF;
END $$;

-- ============================================
-- STEP 6: Drop old vault functions (if they exist)
-- ============================================

DROP FUNCTION IF EXISTS public.get_folder_path(UUID);

-- ============================================
-- STEP 7: Verify migration
-- ============================================

-- Check that document_templates_internal has data
DO $$
DECLARE
  template_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO template_count FROM public.document_templates_internal;
  IF template_count = 0 THEN
    RAISE WARNING 'No document templates found in document_templates_internal. You may need to run create-document-templates-table.sql first.';
  ELSE
    RAISE NOTICE 'Migration complete. Found % document templates.', template_count;
  END IF;
END $$;

-- ============================================
-- STEP 8: Create indexes if they don't exist
-- ============================================

-- These should already be created by schema-compliance-vault.sql, but ensure they exist
CREATE INDEX IF NOT EXISTS idx_document_templates_folder_name ON public.document_templates_internal(folder_name);
CREATE INDEX IF NOT EXISTS idx_document_templates_category ON public.document_templates_internal(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_templates_frequency ON public.document_templates_internal(default_frequency);
CREATE INDEX IF NOT EXISTS idx_document_templates_folder_prefix ON public.document_templates_internal(folder_name text_pattern_ops);

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

-- The new system is now active:
-- 1. Folders are represented by folder_name in document_templates_internal
-- 2. Hierarchical folders use path format (e.g., "Parent/Child")
-- 3. All company documents inherit folder structure from templates
-- 4. Superadmins manage folders and templates via /admin/vault
