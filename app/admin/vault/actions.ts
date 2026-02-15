'use server'

console.log('[VAULT ACTIONS] MODULE LOADED - actions.ts file loaded at:', new Date().toISOString())

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import {
  parseFolderPath,
  buildFolderPath,
  getParentPath,
  getFolderName,
  isSubfolder,
  normalizeFolderPath,
} from '@/lib/vault/folder-utils'

export interface DocumentTemplate {
  id?: string
  document_name: string
  folder_name: string | null
  default_frequency: 'one-time' | 'monthly' | 'quarterly' | 'yearly' | 'annually'
  category: string | null
  description: string | null
  is_mandatory: boolean
  created_at?: string
  updated_at?: string
}

export interface FolderInfo {
  path: string
  name: string
  parentPath: string | null
  depth: number
  documentCount: number
  children?: FolderInfo[]
}

// ============================================
// FOLDER OPERATIONS
// ============================================

// Test function to verify server actions work
export async function testServerAction(): Promise<{ success: boolean; message: string }> {
  console.log('[VAULT ACTIONS] TEST: testServerAction called - SERVER SIDE')
  return { success: true, message: 'Server actions are working!' }
}

export async function getFolders(): Promise<{ success: boolean; folders?: FolderInfo[]; error?: string }> {
  // Server-side logs will appear in terminal/console, not browser
  console.log('[VAULT ACTIONS] ===== getFolders START =====')
  console.log('[VAULT ACTIONS] Timestamp:', new Date().toISOString())
  console.log('[VAULT ACTIONS] getFolders called - SERVER SIDE')
  console.log('[VAULT ACTIONS] About to create clients...')
  
  try {
    console.log('[VAULT ACTIONS] Creating supabase client...')
    const supabase = await createClient()
    console.log('[VAULT ACTIONS] Supabase client created, creating admin client...')
    const adminSupabase = createAdminClient() // Use admin client to bypass RLS
    console.log('[VAULT ACTIONS] Admin client created, getting user...')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    console.log('[VAULT ACTIONS] Auth check - SERVER SIDE:', {
      hasUser: !!user,
      userId: user?.id,
      authError: authError?.message,
    })
    
    if (!user) {
      console.log('[VAULT ACTIONS] No user, returning unauthorized - SERVER SIDE')
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin with timeout
    console.log('[VAULT ACTIONS] Checking superadmin status for user:', user.id, '- SERVER SIDE')
    
    let isSuperadmin = false
    let rpcError = null
    
    try {
      const rpcPromise = adminSupabase.rpc('is_superadmin', { p_user_id: user.id })
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('RPC timeout after 10 seconds')), 10000)
      })
      
      const rpcResult = await Promise.race([rpcPromise, timeoutPromise]) as { data: boolean | null; error: any }
      isSuperadmin = rpcResult.data || false
      rpcError = rpcResult.error
    } catch (error: any) {
      console.error('[VAULT ACTIONS] RPC call failed or timed out - SERVER SIDE:', error)
      rpcError = error
    }
    
    console.log('[VAULT ACTIONS] Superadmin check result - SERVER SIDE:', {
      isSuperadmin,
      rpcError: rpcError?.message || rpcError,
    })
    
    if (!isSuperadmin) {
      console.log('[VAULT ACTIONS] User is not superadmin, returning error - SERVER SIDE')
      return { success: false, error: 'Only superadmins can access vault' }
    }

    // Test query to verify admin client works
    console.log('[VAULT ACTIONS] Testing admin client with simple query...')
    try {
      // Access internal schema table
      // Note: The internal schema must be exposed in Supabase API settings
      // Go to Settings > API > Exposed Schemas and add 'internal'
      const testQuery = adminSupabase
        .from('document_templates_internal')
        .select('id')
        .limit(1)

      const testResult = await Promise.race([
        testQuery,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Test query timeout')), 5000)
        )
      ]) as { data: any; error: any }

      console.log('[VAULT ACTIONS] Test query result:', {
        hasData: !!testResult.data,
        hasError: !!testResult.error,
        error: testResult.error?.message,
        errorCode: testResult.error?.code,
      })
    } catch (testErr: any) {
      console.error('[VAULT ACTIONS] Test query failed - SERVER SIDE:', testErr)
      // Continue anyway, but log the error
    }

    // Get all unique folder paths with document counts using admin client (bypasses RLS)
    console.log('[VAULT ACTIONS] Fetching folder data from document_templates_internal - SERVER SIDE')
    console.log('[VAULT ACTIONS] Checking service role key - SERVER SIDE:', {
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      serviceKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
    })
    
    let folderData = null
    let error = null
    
    try {
      const queryPromise = adminSupabase
        .from('document_templates_internal')
        .select('folder_name')
        .not('folder_name', 'is', null)
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database query timeout after 15 seconds')), 15000)
      })
      
      const queryResult = await Promise.race([queryPromise, timeoutPromise]) as { data: any; error: any }
      folderData = queryResult.data
      error = queryResult.error
    } catch (err: any) {
      console.error('[VAULT ACTIONS] Database query failed or timed out - SERVER SIDE:', err)
      error = err
    }
    
    console.log('[VAULT ACTIONS] Folder data query result - SERVER SIDE:', {
      hasData: !!folderData,
      dataCount: folderData?.length || 0,
      error: error?.message || error,
      errorCode: error?.code,
      errorDetails: error,
    })

    if (error) {
      console.error('[VAULT ACTIONS] Database error details - SERVER SIDE:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        serviceKeyPresent: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        serviceKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
        fullError: error,
      })
      
      // If it's a permission error, suggest checking service role key
      if (error?.message?.includes('permission denied') || error?.code === '42501') {
        return { 
          success: false, 
          error: `Permission denied. Please ensure SUPABASE_SERVICE_ROLE_KEY is set in your .env.local file and restart the dev server. Error: ${error.message}` 
        }
      }
      
      return { success: false, error: `Database error: ${error.message || error}` }
    }
    
    if (!folderData) {
      console.log('[VAULT ACTIONS] No folder data returned - SERVER SIDE, returning empty folders')
      return { success: true, folders: [] }
    }

    // Count documents per folder
    const folderMap = new Map<string, number>()
    const allPaths = new Set<string>()

    folderData?.forEach((row: { folder_name: string | null }) => {
      if (row.folder_name) {
        allPaths.add(row.folder_name)
        folderMap.set(row.folder_name, (folderMap.get(row.folder_name) || 0) + 1)
      }
    })

    // Build folder tree
    const folders: FolderInfo[] = []
    const processedPaths = new Set<string>()

    // Sort paths by depth (shallow first) to build tree correctly
    const sortedPaths = Array.from(allPaths).sort((a, b) => {
      const depthA = parseFolderPath(a).length
      const depthB = parseFolderPath(b).length
      return depthA - depthB
    })

    sortedPaths.forEach(path => {
      if (processedPaths.has(path)) return

      const normalizedPath = normalizeFolderPath(path)
      if (!normalizedPath) return

      const parentPath = getParentPath(normalizedPath)
      const name = getFolderName(normalizedPath) || normalizedPath
      const depth = parseFolderPath(normalizedPath).length

      const folder: FolderInfo = {
        path: normalizedPath,
        name,
        parentPath,
        depth,
        documentCount: folderMap.get(path) || 0,
        children: [],
      }

      // If it has a parent, add to parent's children
      if (parentPath && processedPaths.has(parentPath)) {
        const parent = findFolderInTree(folders, parentPath)
        if (parent) {
          parent.children = parent.children || []
          parent.children.push(folder)
        }
      } else {
        // Root level folder
        folders.push(folder)
      }

      processedPaths.add(normalizedPath)
    })

    // Sort folders and their children
    const sortFolders = (folders: FolderInfo[]) => {
      folders.sort((a, b) => a.name.localeCompare(b.name))
      folders.forEach(f => {
        if (f.children) {
          sortFolders(f.children)
        }
      })
    }
    sortFolders(folders)

    console.log('[VAULT ACTIONS] Successfully built folder tree - SERVER SIDE:', {
      rootFoldersCount: folders.length,
    })
    console.log('[VAULT ACTIONS] ===== getFolders SUCCESS =====')
    return { success: true, folders }
  } catch (error: any) {
    console.error('[VAULT ACTIONS] ===== getFolders ERROR =====')
    console.error('[VAULT ACTIONS] Error fetching folders - SERVER SIDE:', error)
    console.error('[VAULT ACTIONS] Error stack - SERVER SIDE:', error?.stack)
    return { success: false, error: error.message || 'Failed to fetch folders' }
  }
}

function findFolderInTree(folders: FolderInfo[], path: string): FolderInfo | null {
  for (const folder of folders) {
    if (folder.path === path) {
      return folder
    }
    if (folder.children) {
      const found = findFolderInTree(folder.children, path)
      if (found) return found
    }
  }
  return null
}

export async function createFolder(
  name: string,
  parentPath: string | null = null,
  description: string | null = null
): Promise<{ success: boolean; folder?: FolderInfo; error?: string }> {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const { data: isSuperadmin } = await adminSupabase
      .rpc('is_superadmin', { p_user_id: user.id })
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can manage vault' }
    }

    // Normalize and validate
    const normalizedName = name.trim()
    if (!normalizedName) {
      return { success: false, error: 'Folder name cannot be empty' }
    }

    // Build full path
    const fullPath = parentPath 
      ? normalizeFolderPath(`${parentPath}/${normalizedName}`)
      : normalizedName

    if (!fullPath) {
      return { success: false, error: 'Invalid folder path' }
    }

    // Check if folder already exists
    const { data: existing } = await adminSupabase
      .from('document_templates_internal')
      .select('folder_name')
      .eq('folder_name', fullPath)
      .limit(1)

    if (existing && existing.length > 0) {
      return { success: false, error: 'A folder with this name already exists' }
    }

    // Create a placeholder document template to represent the folder
    // This ensures the folder appears in the system even if empty
    const { error: insertError } = await adminSupabase
      .from('document_templates_internal')
      .insert({
        document_name: `__FOLDER_PLACEHOLDER_${Date.now()}__`,
        folder_name: fullPath,
        default_frequency: 'one-time',
        is_mandatory: false,
        description: description || null,
      })

    if (insertError) {
      // If unique constraint violation on document_name, folder might already exist via different template
      if (insertError.code === '23505') {
        return { success: false, error: 'Folder already exists' }
      }
      throw insertError
    }

    revalidatePath('/admin')
    return { 
      success: true, 
      folder: {
        path: fullPath,
        name: normalizedName,
        parentPath: parentPath ? normalizeFolderPath(parentPath) : null,
        depth: parseFolderPath(fullPath).length,
        documentCount: 0,
      }
    }
  } catch (error: any) {
    console.error('Error creating folder:', error)
    return { success: false, error: error.message || 'Failed to create folder' }
  }
}

export async function updateFolder(
  oldPath: string,
  newPath: string,
  description: string | null = null
): Promise<{ success: boolean; updatedCount?: number; error?: string }> {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const { data: isSuperadmin } = await adminSupabase
      .rpc('is_superadmin', { p_user_id: user.id })
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can manage vault' }
    }

    // Normalize paths
    const normalizedOldPath = normalizeFolderPath(oldPath)
    const normalizedNewPath = normalizeFolderPath(newPath)

    if (!normalizedOldPath || !normalizedNewPath) {
      return { success: false, error: 'Invalid folder path' }
    }

    if (normalizedOldPath === normalizedNewPath) {
      // Only update description if path hasn't changed
      if (description !== null) {
        const { error } = await adminSupabase
          .from('document_templates_internal')
          .update({ description })
          .eq('folder_name', normalizedOldPath)

        if (error) throw error
      }
      return { success: true, updatedCount: 0 }
    }

    // Check if new path already exists
    const { data: existing } = await adminSupabase
      .from('document_templates_internal')
      .select('folder_name')
      .eq('folder_name', normalizedNewPath)
      .limit(1)

    if (existing && existing.length > 0) {
      return { success: false, error: 'A folder with the new name already exists' }
    }

    // Use cascade function to rename folder
    const { data: updatedCount, error } = await adminSupabase
      .rpc('update_folder_name_cascade', {
        old_folder_path: normalizedOldPath,
        new_folder_path: normalizedNewPath,
      })

    if (error) throw error

    // Update description if provided
    if (description !== null) {
      const { error: descError } = await adminSupabase
        .from('document_templates_internal')
        .update({ description })
        .eq('folder_name', normalizedNewPath)

      if (descError) {
        console.error('Error updating description:', descError)
        // Don't fail the whole operation if description update fails
      }
    }

    revalidatePath('/admin')
    return { success: true, updatedCount: updatedCount || 0 }
  } catch (error: any) {
    console.error('Error updating folder:', error)
    return { success: false, error: error.message || 'Failed to update folder' }
  }
}

export async function deleteFolder(path: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const { data: isSuperadmin } = await adminSupabase
      .rpc('is_superadmin', { p_user_id: user.id })
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can manage vault' }
    }

    const normalizedPath = normalizeFolderPath(path)
    if (!normalizedPath) {
      return { success: false, error: 'Invalid folder path' }
    }

    // Check if folder has documents in company_documents_internal
    const { data: hasDocs } = await adminSupabase
      .rpc('folder_has_documents', { folder_path: normalizedPath })

    if (hasDocs) {
      return { success: false, error: 'Cannot delete folder: it contains documents in company vaults' }
    }

    // Check if folder has subfolders with documents
    const { data: subfolders } = await adminSupabase
      .from('document_templates_internal')
      .select('folder_name')
      .like('folder_name', `${normalizedPath}/%`)

    if (subfolders && subfolders.length > 0) {
      // Check each subfolder for documents
      for (const subfolder of subfolders) {
        const { data: subHasDocs } = await adminSupabase
          .rpc('folder_has_documents', { folder_path: subfolder.folder_name })
        
        if (subHasDocs) {
          return { success: false, error: 'Cannot delete folder: it contains subfolders with documents' }
        }
      }
    }

    // Delete all document templates in this folder and subfolders
    const { error } = await adminSupabase
      .from('document_templates_internal')
      .delete()
      .or(`folder_name.eq.${normalizedPath},folder_name.like.${normalizedPath}/%`)

    if (error) throw error

    revalidatePath('/admin')
    return { success: true }
  } catch (error: any) {
    console.error('Error deleting folder:', error)
    return { success: false, error: error.message || 'Failed to delete folder' }
  }
}

// ============================================
// DOCUMENT TEMPLATE OPERATIONS
// ============================================

export async function getDocumentTemplates(
  folderPath: string | null = null
): Promise<{ success: boolean; templates?: DocumentTemplate[]; error?: string }> {
  console.log('[VAULT ACTIONS] ===== getDocumentTemplates START =====')
  console.log('[VAULT ACTIONS] Timestamp:', new Date().toISOString())
  console.log('[VAULT ACTIONS] getDocumentTemplates called - SERVER SIDE', { folderPath })
  console.log('[VAULT ACTIONS] About to create clients...')
  
  try {
    console.log('[VAULT ACTIONS] Creating supabase client...')
    const supabase = await createClient()
    console.log('[VAULT ACTIONS] Supabase client created, creating admin client...')
    const adminSupabase = createAdminClient()
    console.log('[VAULT ACTIONS] Admin client created, getting user...')
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const { data: isSuperadmin } = await adminSupabase
      .rpc('is_superadmin', { p_user_id: user.id })
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can access vault' }
    }

    // Build query based on folder path
    // Root level (null) = templates with no folder_name
    // Specific folder = templates matching that folder path
    let query = adminSupabase
      .from('document_templates_internal')
      .select('*')
      .order('document_name', { ascending: true })

    if (folderPath === null) {
      // Root level: get templates with null folder_name
      // If no templates have null folder_name, this will return empty array (which is correct)
      query = query.is('folder_name', null)
      console.log('[VAULT ACTIONS] Querying root level templates (folder_name IS NULL) - SERVER SIDE')
    } else {
      // Specific folder: get templates matching the folder path
      const normalizedPath = normalizeFolderPath(folderPath)
      if (!normalizedPath) {
        console.error('[VAULT ACTIONS] Invalid folder path provided:', folderPath, '- SERVER SIDE')
        return { success: false, error: 'Invalid folder path' }
      }
      query = query.eq('folder_name', normalizedPath)
      console.log('[VAULT ACTIONS] Querying templates for folder:', normalizedPath, '- SERVER SIDE')
    }

    console.log('[VAULT ACTIONS] Executing query for folderPath:', folderPath, '- SERVER SIDE')
    const { data: templates, error } = await query

    console.log('[VAULT ACTIONS] Query result - SERVER SIDE:', {
      hasData: !!templates,
      templateCount: templates?.length || 0,
      hasError: !!error,
      error: error?.message,
      errorCode: error?.code,
    })

    if (error) {
      console.error('[VAULT ACTIONS] Query error - SERVER SIDE:', error)
      throw error
    }

    // Filter out placeholder documents
    const realTemplates = (templates || []).filter(
      t => !t.document_name?.startsWith('__FOLDER_PLACEHOLDER__')
    )

    console.log('[VAULT ACTIONS] After filtering placeholders - SERVER SIDE:', {
      originalCount: templates?.length || 0,
      realTemplatesCount: realTemplates.length,
    })

    // Normalize frequency values (annually -> yearly)
    const normalizedTemplates = realTemplates.map(t => ({
      ...t,
      default_frequency: (t.default_frequency === 'annually' ? 'yearly' : t.default_frequency) as 'one-time' | 'monthly' | 'quarterly' | 'yearly',
    }))

    console.log('[VAULT ACTIONS] Returning templates - SERVER SIDE:', {
      count: normalizedTemplates.length,
      sample: normalizedTemplates.slice(0, 3).map(t => ({
        name: t.document_name,
        folder: t.folder_name,
        frequency: t.default_frequency,
      })),
    })

    console.log('[VAULT ACTIONS] ===== getDocumentTemplates SUCCESS =====')
    return { success: true, templates: normalizedTemplates as DocumentTemplate[] }
  } catch (error: any) {
    console.error('Error fetching document templates:', error)
    return { success: false, error: error.message || 'Failed to fetch document templates' }
  }
}

export async function createDocumentTemplate(
  name: string,
  folderPath: string | null,
  frequency: 'one-time' | 'monthly' | 'quarterly' | 'yearly',
  category: string | null = null,
  description: string | null = null,
  isMandatory: boolean = false
): Promise<{ success: boolean; template?: DocumentTemplate; error?: string }> {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const { data: isSuperadmin } = await adminSupabase
      .rpc('is_superadmin', { p_user_id: user.id })
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can manage vault' }
    }

    const normalizedName = name.trim()
    if (!normalizedName) {
      return { success: false, error: 'Document name cannot be empty' }
    }

    // Normalize folder path
    const normalizedFolderPath = folderPath ? normalizeFolderPath(folderPath) : null

    // Normalize frequency (yearly -> annually for database)
    const dbFrequency = frequency === 'yearly' ? 'annually' : frequency

    // Check if template already exists
    const { data: existing } = await adminSupabase
      .from('document_templates_internal')
      .select('id')
      .eq('document_name', normalizedName)
      .single()

    if (existing) {
      return { success: false, error: 'A document template with this name already exists' }
    }

    const { data: template, error } = await adminSupabase
      .from('document_templates_internal')
      .insert({
        document_name: normalizedName,
        folder_name: normalizedFolderPath,
        default_frequency: dbFrequency,
        category,
        description,
        is_mandatory: isMandatory,
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath('/admin')
    return { 
      success: true, 
      template: {
        ...template,
        default_frequency: (template.default_frequency === 'annually' ? 'yearly' : template.default_frequency) as 'one-time' | 'monthly' | 'quarterly' | 'yearly',
      } as DocumentTemplate
    }
  } catch (error: any) {
    console.error('Error creating document template:', error)
    return { success: false, error: error.message || 'Failed to create document template' }
  }
}

export async function updateDocumentTemplate(
  id: string,
  name: string,
  folderPath: string | null,
  frequency: 'one-time' | 'monthly' | 'quarterly' | 'yearly',
  category: string | null = null,
  description: string | null = null,
  isMandatory: boolean = false
): Promise<{ success: boolean; template?: DocumentTemplate; error?: string }> {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const { data: isSuperadmin } = await adminSupabase
      .rpc('is_superadmin', { p_user_id: user.id })
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can manage vault' }
    }

    const normalizedName = name.trim()
    if (!normalizedName) {
      return { success: false, error: 'Document name cannot be empty' }
    }

    // Normalize folder path
    const normalizedFolderPath = folderPath ? normalizeFolderPath(folderPath) : null

    // Normalize frequency
    const dbFrequency = frequency === 'yearly' ? 'annually' : frequency

    // Check if another template with same name exists
    const { data: existing } = await adminSupabase
      .from('document_templates_internal')
      .select('id')
      .eq('document_name', normalizedName)
      .neq('id', id)
      .single()

    if (existing) {
      return { success: false, error: 'A document template with this name already exists' }
    }

    // Get old template to check if folder changed
    const { data: oldTemplate } = await adminSupabase
      .from('document_templates_internal')
      .select('folder_name, document_name')
      .eq('id', id)
      .single()

    if (!oldTemplate) {
      return { success: false, error: 'Document template not found' }
    }

    // Update template
    const { data: template, error } = await adminSupabase
      .from('document_templates_internal')
      .update({
        document_name: normalizedName,
        folder_name: normalizedFolderPath,
        default_frequency: dbFrequency,
        category,
        description,
        is_mandatory: isMandatory,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Cascade changes to company_documents for all users
    // When superadmin changes a template, it affects all companies using that template
    const oldFolder = normalizeFolderPath(oldTemplate.folder_name)
    const oldName = oldTemplate.document_name
    
    // If folder changed, update all company documents that use this template
    if (oldFolder !== normalizedFolderPath) {
      console.log('[VAULT ACTIONS] Folder changed, cascading to company_documents - SERVER SIDE:', {
        oldFolder,
        newFolder: normalizedFolderPath,
        documentName: normalizedName,
      })
      
      // Update company documents with matching document_name (template name)
      const { error: updateError } = await adminSupabase
        .from('company_documents_internal')
        .update({ folder_name: normalizedFolderPath })
        .eq('document_type', normalizedName)

      if (updateError) {
        console.error('[VAULT ACTIONS] Error updating company documents folder - SERVER SIDE:', updateError)
        // Don't fail the whole operation, but log it
      } else {
        console.log('[VAULT ACTIONS] Successfully updated company documents folder - SERVER SIDE')
      }
    }

    // If document name changed, update all company documents that reference the old name
    if (oldName !== normalizedName) {
      console.log('[VAULT ACTIONS] Document name changed, updating company_documents - SERVER SIDE:', {
        oldName,
        newName: normalizedName,
      })
      
      const { error: nameUpdateError } = await adminSupabase
        .from('company_documents_internal')
        .update({ document_type: normalizedName })
        .eq('document_type', oldName)

      if (nameUpdateError) {
        console.error('[VAULT ACTIONS] Error updating company documents name - SERVER SIDE:', nameUpdateError)
        // Don't fail the whole operation
      } else {
        console.log('[VAULT ACTIONS] Successfully updated company documents name - SERVER SIDE')
      }
    }

    revalidatePath('/admin')
    return { 
      success: true, 
      template: {
        ...template,
        default_frequency: (template.default_frequency === 'annually' ? 'yearly' : template.default_frequency) as 'one-time' | 'monthly' | 'quarterly' | 'yearly',
      } as DocumentTemplate
    }
  } catch (error: any) {
    console.error('Error updating document template:', error)
    return { success: false, error: error.message || 'Failed to update document template' }
  }
}

export async function deleteDocumentTemplate(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const { data: isSuperadmin } = await adminSupabase
      .rpc('is_superadmin', { p_user_id: user.id })
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can manage vault' }
    }

    // Get template to check if it's used
    const { data: template } = await adminSupabase
      .from('document_templates_internal')
      .select('document_name')
      .eq('id', id)
      .single()

    if (!template) {
      return { success: false, error: 'Document template not found' }
    }

    // Check if template is used by any company documents
    const { data: usedDocs } = await adminSupabase
      .from('company_documents_internal')
      .select('id')
      .eq('document_type', template.document_name)
      .limit(1)

    if (usedDocs && usedDocs.length > 0) {
      return { success: false, error: 'Cannot delete template: it is used by company documents' }
    }

    // Delete template
    const { error } = await adminSupabase
      .from('document_templates_internal')
      .delete()
      .eq('id', id)

    if (error) throw error

    revalidatePath('/admin')
    return { success: true }
  } catch (error: any) {
    console.error('Error deleting document template:', error)
    return { success: false, error: error.message || 'Failed to delete document template' }
  }
}
