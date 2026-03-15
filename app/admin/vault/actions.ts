'use server'

console.log('[VAULT ACTIONS] MODULE LOADED - actions.ts file loaded at:', new Date().toISOString())

import { createAdminClient } from '@/utils/supabase/admin'
import { createServerContainer } from '@/lib/composition/server-container'
import type { VaultTemplateRecord } from '@/application/interfaces/VaultTemplateRepository'
import { revalidatePath } from 'next/cache'
import {
  parseFolderPath,
  buildFolderPath,
  getParentPath,
  getFolderName,
  isSubfolder,
  normalizeFolderPath,
} from '@/lib/vault/folder-utils'
import { sanitizeFolderPath, escapeLikePattern } from '@/lib/utils/input-validation'
import type { AppUser } from '@/domain/models/AppUser'

async function requireCurrentUser(): Promise<AppUser> {
  const { authService } = createServerContainer()
  return authService.requireCurrentUser()
}

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
    const { vaultTemplateRepository, accessService } = createServerContainer()
    console.log('[VAULT ACTIONS] Resolving current user...')
    let user: AppUser
    try {
      user = await requireCurrentUser()
    } catch (authError: any) {
      console.log('[VAULT ACTIONS] Auth check - SERVER SIDE:', {
        hasUser: false,
        userId: null,
        authError: authError?.message || 'Not authenticated',
      })
      console.log('[VAULT ACTIONS] No user, returning unauthorized - SERVER SIDE')
      return { success: false, error: 'Unauthorized' }
    }

    console.log('[VAULT ACTIONS] Current user resolved, creating admin client...')
    const adminSupabase: any = createAdminClient() // Use admin client to bypass RLS
    
    console.log('[VAULT ACTIONS] Auth check - SERVER SIDE:', {
      hasUser: true,
      userId: user.id,
      authError: null,
    })

    // Check if superadmin
    console.log('[VAULT ACTIONS] Checking superadmin status for user:', user.id, '- SERVER SIDE')
    
    let isSuperadmin = false
    let rpcError = null
    
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Check timeout after 10 seconds')), 10000)
      })
      
      const checkPromise = accessService.isSuperadmin(user.id)
      isSuperadmin = await Promise.race([checkPromise, timeoutPromise]) as boolean
    } catch (error: any) {
      console.error('[VAULT ACTIONS] Superadmin check failed or timed out - SERVER SIDE:', error)
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
      const testResult = await Promise.race([
        vaultTemplateRepository.getFolderPaths(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Test query timeout')), 5000)
        )
      ]) as string[]

      console.log('[VAULT ACTIONS] Test query result:', {
        hasData: Array.isArray(testResult),
        hasError: false,
        error: undefined,
        errorCode: undefined,
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
    
    let folderData: string[] | null = null
    let error: any = null
    
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database query timeout after 15 seconds')), 15000)
      })
      
      folderData = await Promise.race([vaultTemplateRepository.getFolderPaths(), timeoutPromise]) as string[]
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

    folderData?.forEach((folderName: string) => {
      allPaths.add(folderName)
      folderMap.set(folderName, (folderMap.get(folderName) || 0) + 1)
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
    const { vaultFolderRepository, accessService } = createServerContainer()
    const adminSupabase: any = createAdminClient()
    let user: AppUser
    try {
      user = await requireCurrentUser()
    } catch {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const isSuperadmin = await accessService.isSuperadmin(user.id)
    
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
    if (await vaultFolderRepository.folderExists(fullPath)) {
      return { success: false, error: 'A folder with this name already exists' }
    }

    // Create a placeholder document template to represent the folder
    // This ensures the folder appears in the system even if empty
    try {
      await vaultFolderRepository.createFolderPlaceholder(fullPath, description || null)
    } catch (insertError: any) {
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
    const { vaultFolderRepository, accessService } = createServerContainer()
    const adminSupabase: any = createAdminClient()
    let user: AppUser
    try {
      user = await requireCurrentUser()
    } catch {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const isSuperadmin = await accessService.isSuperadmin(user.id)
    
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
        await vaultFolderRepository.updateFolderDescription(normalizedOldPath, description)
      }
      return { success: true, updatedCount: 0 }
    }

    // Check if new path already exists
    if (await vaultFolderRepository.folderExists(normalizedNewPath)) {
      return { success: false, error: 'A folder with the new name already exists' }
    }

    // Use cascade function to rename folder
    const updatedCount = await vaultFolderRepository.renameFolder(normalizedOldPath, normalizedNewPath)

    // Update description if provided
    if (description !== null) {
      try {
        await vaultFolderRepository.updateFolderDescription(normalizedNewPath, description)
      } catch (descError) {
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
    const { vaultFolderRepository, accessService } = createServerContainer()
    const adminSupabase: any = createAdminClient()
    let user: AppUser
    try {
      user = await requireCurrentUser()
    } catch {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const isSuperadmin = await accessService.isSuperadmin(user.id)
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can manage vault' }
    }

    // SECURITY: Validate and sanitize folder path to prevent SQL injection
    const normalizedPath = normalizeFolderPath(path)
    const sanitizedPath = sanitizeFolderPath(normalizedPath)
    if (!normalizedPath || !sanitizedPath || sanitizedPath !== normalizedPath) {
      return { success: false, error: 'Invalid folder path' }
    }

    // Check if folder has documents in company_documents_internal
    if (await vaultFolderRepository.folderHasDocuments(normalizedPath)) {
      return { success: false, error: 'Cannot delete folder: it contains documents in company vaults' }
    }

    // Check if folder has subfolders with documents
    // SECURITY: Escape LIKE pattern to prevent injection
    const likePattern = `${escapeLikePattern(normalizedPath)}/%`
    const subfolders = await vaultFolderRepository.getSubfolderPaths(normalizedPath)

    if (subfolders.length > 0) {
      // Check each subfolder for documents
      for (const subfolder of subfolders) {
        if (await vaultFolderRepository.folderHasDocuments(subfolder)) {
          return { success: false, error: 'Cannot delete folder: it contains subfolders with documents' }
        }
      }
    }

    // Delete all document templates in this folder and subfolders
    // SECURITY: Use separate queries instead of .or() with string interpolation to prevent SQL injection
    // First delete exact matches
    await vaultFolderRepository.deleteFolderPath(normalizedPath)
    
    // Then delete subfolders (using .like() which is safe with parameterized queries)
    // SECURITY: Escape LIKE pattern to prevent injection (reuse the pattern from above)
    await vaultFolderRepository.deleteSubfolderPaths(likePattern)

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
    const { vaultTemplateRepository, accessService } = createServerContainer()
    console.log('[VAULT ACTIONS] Resolving current user...')
    let user: AppUser
    try {
      user = await requireCurrentUser()
    } catch {
      return { success: false, error: 'Unauthorized' }
    }

    console.log('[VAULT ACTIONS] Current user resolved, creating admin client...')
    const adminSupabase: any = createAdminClient()

    // Check if superadmin
    const isSuperadmin = await accessService.isSuperadmin(user.id)
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can access vault' }
    }

    if (folderPath === null) {
      console.log('[VAULT ACTIONS] Querying root level templates (folder_name IS NULL) - SERVER SIDE')
    } else {
      const normalizedPath = normalizeFolderPath(folderPath)
      if (!normalizedPath) {
        console.error('[VAULT ACTIONS] Invalid folder path provided:', folderPath, '- SERVER SIDE')
        return { success: false, error: 'Invalid folder path' }
      }
      folderPath = normalizedPath
      console.log('[VAULT ACTIONS] Querying templates for folder:', normalizedPath, '- SERVER SIDE')
    }

    console.log('[VAULT ACTIONS] Executing query for folderPath:', folderPath, '- SERVER SIDE')
    const templates = await vaultTemplateRepository.getTemplates(folderPath)

    // Filter out placeholder documents
    const realTemplates = templates.filter(
      template => !template.documentName.startsWith('__FOLDER_PLACEHOLDER__')
    )

    console.log('[VAULT ACTIONS] After filtering placeholders - SERVER SIDE:', {
      originalCount: templates.length,
      realTemplatesCount: realTemplates.length,
    })

    // Normalize frequency values (annually -> yearly)
    const normalizedTemplates: DocumentTemplate[] = realTemplates.map((t: VaultTemplateRecord) => ({
      id: t.id,
      document_name: t.documentName,
      folder_name: t.folderName,
      default_frequency: (t.defaultFrequency === 'annually' ? 'yearly' : t.defaultFrequency) as 'one-time' | 'monthly' | 'quarterly' | 'yearly',
      category: t.category,
      description: t.description,
      is_mandatory: t.isMandatory,
    })) as DocumentTemplate[]

    console.log('[VAULT ACTIONS] Returning templates - SERVER SIDE:', {
      count: normalizedTemplates.length,
      sample: normalizedTemplates.slice(0, 3).map((t: DocumentTemplate) => ({
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
    const { vaultTemplateManagementRepository, accessService } = createServerContainer()
    const adminSupabase: any = createAdminClient()
    let user: AppUser
    try {
      user = await requireCurrentUser()
    } catch {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const isSuperadmin = await accessService.isSuperadmin(user.id)
    
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

    if (await vaultTemplateManagementRepository.existsByName(normalizedName)) {
      return { success: false, error: 'A document template with this name already exists' }
    }

    const template = await vaultTemplateManagementRepository.create({
      documentName: normalizedName,
      folderName: normalizedFolderPath,
      defaultFrequency: dbFrequency,
      category,
      description,
      isMandatory,
    })

    revalidatePath('/admin')
    return { 
      success: true, 
      template: {
        id: template.id,
        document_name: template.documentName,
        folder_name: template.folderName,
        default_frequency: (template.defaultFrequency === 'annually' ? 'yearly' : template.defaultFrequency) as 'one-time' | 'monthly' | 'quarterly' | 'yearly',
        category: template.category,
        description: template.description,
        is_mandatory: template.isMandatory,
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
    const { vaultDocumentUsageRepository, vaultTemplateManagementRepository, accessService } = createServerContainer()
    const adminSupabase: any = createAdminClient()
    let user: AppUser
    try {
      user = await requireCurrentUser()
    } catch {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const isSuperadmin = await accessService.isSuperadmin(user.id)
    
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

    if (await vaultTemplateManagementRepository.existsByName(normalizedName, id)) {
      return { success: false, error: 'A document template with this name already exists' }
    }

    // Get old template to check if folder changed
    const oldTemplate = await vaultTemplateManagementRepository.getById(id)

    if (!oldTemplate) {
      return { success: false, error: 'Document template not found' }
    }

    // Update template
    const template = await vaultTemplateManagementRepository.update(id, {
      documentName: normalizedName,
      folderName: normalizedFolderPath,
      defaultFrequency: dbFrequency,
      category,
      description,
      isMandatory,
    })

    // Cascade changes to company_documents for all users
    // When superadmin changes a template, it affects all companies using that template
    const oldFolder = normalizeFolderPath(oldTemplate.folderName)
    const oldName = oldTemplate.documentName
    
    // If folder changed, update all company documents that use this template
    if (oldFolder !== normalizedFolderPath) {
      console.log('[VAULT ACTIONS] Folder changed, cascading to company_documents - SERVER SIDE:', {
        oldFolder,
        newFolder: normalizedFolderPath,
        documentName: normalizedName,
      })
      
      // Update company documents with matching document_name (template name)
      try {
        await vaultDocumentUsageRepository.updateDocumentsFolderByType(normalizedName, normalizedFolderPath)
        console.log('[VAULT ACTIONS] Successfully updated company documents folder - SERVER SIDE')
      } catch (updateError) {
        console.error('[VAULT ACTIONS] Error updating company documents folder - SERVER SIDE:', updateError)
        // Don't fail the whole operation, but log it
      }
    }

    // If document name changed, update all company documents that reference the old name
    if (oldName !== normalizedName) {
      console.log('[VAULT ACTIONS] Document name changed, updating company_documents - SERVER SIDE:', {
        oldName,
        newName: normalizedName,
      })
      
      try {
        await vaultDocumentUsageRepository.renameDocumentsByType(oldName, normalizedName)
        console.log('[VAULT ACTIONS] Successfully updated company documents name - SERVER SIDE')
      } catch (nameUpdateError) {
        console.error('[VAULT ACTIONS] Error updating company documents name - SERVER SIDE:', nameUpdateError)
        // Don't fail the whole operation
      }
    }

    revalidatePath('/admin')
    return { 
      success: true, 
      template: {
        id: template.id,
        document_name: template.documentName,
        folder_name: template.folderName,
        default_frequency: (template.defaultFrequency === 'annually' ? 'yearly' : template.defaultFrequency) as 'one-time' | 'monthly' | 'quarterly' | 'yearly',
        category: template.category,
        description: template.description,
        is_mandatory: template.isMandatory,
      } as DocumentTemplate
    }
  } catch (error: any) {
    console.error('Error updating document template:', error)
    return { success: false, error: error.message || 'Failed to update document template' }
  }
}

export async function deleteDocumentTemplate(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { vaultDocumentUsageRepository, vaultTemplateManagementRepository, accessService } = createServerContainer()
    const adminSupabase: any = createAdminClient()
    let user: AppUser
    try {
      user = await requireCurrentUser()
    } catch {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const isSuperadmin = await accessService.isSuperadmin(user.id)
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can manage vault' }
    }

    // Get template to check if it's used
    const template = await vaultTemplateManagementRepository.getById(id)

    if (!template) {
      return { success: false, error: 'Document template not found' }
    }

    // Check if template is used by any company documents
    if (await vaultDocumentUsageRepository.hasDocumentsForTemplateName(template.documentName)) {
      return { success: false, error: 'Cannot delete template: it is used by company documents' }
    }

    // Delete template
    await vaultTemplateManagementRepository.delete(id)

    revalidatePath('/admin')
    return { success: true }
  } catch (error: any) {
    console.error('Error deleting document template:', error)
    return { success: false, error: error.message || 'Failed to delete document template' }
  }
}
