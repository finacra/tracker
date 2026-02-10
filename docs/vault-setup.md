# Compliance Vault Setup Guide

## Database Setup

1. Run the database migration to create the vault tables:
   ```sql
   -- Execute schema-compliance-vault.sql in your Supabase SQL editor
   ```

2. The migration creates:
   - `vault_folders` table for folder management
   - `vault_files` table for file metadata
   - RLS policies for superadmin-only access
   - Helper function `get_folder_path()` for breadcrumb navigation

## Supabase Storage Setup

1. **Create Storage Bucket:**
   - Go to Supabase Dashboard → Storage
   - Click "New bucket"
   - Name: `compliance-vault`
   - Make it **Private** (not public)
   - Click "Create bucket"

2. **Set Storage Policies:**
   - Go to Storage → Policies for `compliance-vault` bucket
   - Create policy: "Superadmins can upload files"
     ```sql
     CREATE POLICY "Superadmins can upload files"
     ON storage.objects FOR INSERT
     WITH CHECK (
       bucket_id = 'compliance-vault' AND
       public.is_superadmin(auth.uid())
     );
     ```

   - Create policy: "Superadmins can read files"
     ```sql
     CREATE POLICY "Superadmins can read files"
     ON storage.objects FOR SELECT
     USING (
       bucket_id = 'compliance-vault' AND
       public.is_superadmin(auth.uid())
     );
     ```

   - Create policy: "Superadmins can delete files"
     ```sql
     CREATE POLICY "Superadmins can delete files"
     ON storage.objects FOR DELETE
     USING (
       bucket_id = 'compliance-vault' AND
       public.is_superadmin(auth.uid())
     );
     ```

## Features

- **Folder Management:**
  - Create nested folders
  - Edit folder names and descriptions
  - Delete empty folders
  - Hierarchical folder tree view

- **File Management:**
  - Upload files to folders
  - Edit file metadata (name, description, tags)
  - Download files
  - Delete files
  - File size and type display

- **Access Control:**
  - Only superadmins can access the vault
  - All operations are protected by RLS policies

## Usage

1. Navigate to Admin Dashboard → Vault tab
2. Create folders using the "New Folder" button
3. Upload files using the "Upload File" button
4. Organize files by selecting folders from the tree
5. Edit or delete items using the action buttons
