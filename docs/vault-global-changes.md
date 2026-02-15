# Compliance Vault - Global Changes Cascade

## Overview
The Compliance Vault manages **global** document templates and folder structures that affect **all users** across the platform. When a superadmin makes changes in `/admin` → Vault tab, these changes automatically cascade to all companies' compliance vaults.

## How It Works

### 1. **Global Template Storage**
- **Table**: `public.document_templates_internal`
- **Purpose**: Stores the master list of document templates and folder structure
- **Managed by**: Superadmins only via `/admin` → Vault tab

### 2. **User Document Storage**
- **Table**: `public.company_documents_internal`
- **Purpose**: Stores actual documents uploaded by users for their companies
- **References**: Links to templates via `document_type` (template name) and `folder_name`

### 3. **Cascade Mechanism**

#### **Folder Rename**
When superadmin renames a folder:
1. `update_folder_name_cascade()` SQL function is called
2. Updates all `document_templates` with matching `folder_name`
3. Updates all `company_documents` with matching `folder_name` (affects all users)
4. Updates all subfolders recursively

**Example:**
- Superadmin renames "GST Returns" → "GST & Tax Returns"
- All companies' documents in that folder automatically move to the new folder name
- All users see the new folder structure immediately

#### **Document Template Name Change**
When superadmin changes a document template name:
1. Template is updated in `document_templates`
2. All `company_documents` with matching `document_type` are updated
3. All users' documents automatically reflect the new name

**Example:**
- Superadmin renames "GSTR-3B" → "GSTR-3B Filed Copy"
- All companies' uploaded GSTR-3B documents automatically show the new name

#### **Document Template Folder Change**
When superadmin moves a template to a different folder:
1. Template's `folder_name` is updated
2. All `company_documents` with matching `document_type` get their `folder_name` updated
3. All users' documents automatically move to the new folder

**Example:**
- Superadmin moves "Income Tax Returns" from "Taxation" → "Taxation/Income Tax"
- All companies' Income Tax Return documents automatically move to the new folder

#### **Document Template Deletion**
When superadmin deletes a template:
1. System checks if any `company_documents` reference it
2. If documents exist, deletion is blocked (prevents orphaned documents)
3. Superadmin must first ensure no companies are using the template

### 4. **Real-Time Updates**
- Changes are immediate - no refresh needed
- All users see updated folder structure and template names instantly
- Existing uploaded documents are automatically reorganized

## Key Points

✅ **Global Changes**: Superadmin changes affect ALL companies
✅ **Automatic Cascade**: No manual intervention needed
✅ **Backward Compatible**: Existing documents are preserved and updated
✅ **Safe Deletion**: Templates can't be deleted if in use
✅ **Hierarchical Folders**: Supports nested folders (e.g., "Taxation/GST/Returns")

## Technical Implementation

### Database Functions
- `update_folder_name_cascade()`: Cascades folder renames to both templates and user documents
- `folder_has_documents()`: Checks if a folder contains user documents before deletion
- `get_all_folder_paths()`: Retrieves all unique folder paths for tree building

### Server Actions
- All vault operations use `adminSupabase` to bypass RLS
- Changes are logged for audit purposes
- Error handling ensures partial failures don't corrupt data

## User Experience

**For Regular Users:**
- See folders and templates as defined by superadmin
- Upload documents to folders/templates
- Changes to folder structure appear automatically
- No action needed when superadmin makes changes

**For Superadmins:**
- Manage global folder structure
- Create/edit/delete document templates
- Changes immediately affect all users
- Can see which templates are in use before deleting
