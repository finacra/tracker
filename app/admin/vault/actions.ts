'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export interface VaultFolder {
  id: string
  name: string
  parent_id: string | null
  description: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  children?: VaultFolder[]
  file_count?: number
}

export interface VaultFile {
  id: string
  name: string
  folder_id: string | null
  file_path: string
  file_size: number | null
  mime_type: string | null
  description: string | null
  tags: string[]
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

// ============================================
// FOLDER OPERATIONS
// ============================================

export async function createFolder(
  name: string,
  parentId: string | null = null,
  description: string | null = null
): Promise<{ success: boolean; folder?: VaultFolder; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const { data: isSuperadmin } = await supabase
      .rpc('is_superadmin', { p_user_id: user.id })
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can manage vault' }
    }

    // Check if folder with same name exists in parent
    if (parentId) {
      const { data: existing } = await supabase
        .from('vault_folders')
        .select('id')
        .eq('name', name)
        .eq('parent_id', parentId)
        .single()
      
      if (existing) {
        return { success: false, error: 'A folder with this name already exists in this location' }
      }
    } else {
      const { data: existing } = await supabase
        .from('vault_folders')
        .select('id')
        .eq('name', name)
        .is('parent_id', null)
        .single()
      
      if (existing) {
        return { success: false, error: 'A folder with this name already exists at root level' }
      }
    }

    const { data: folder, error } = await supabase
      .from('vault_folders')
      .insert({
        name,
        parent_id: parentId,
        description,
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath('/admin/vault')
    return { success: true, folder: folder as VaultFolder }
  } catch (error: any) {
    console.error('Error creating folder:', error)
    return { success: false, error: error.message || 'Failed to create folder' }
  }
}

export async function updateFolder(
  id: string,
  name: string,
  description: string | null = null
): Promise<{ success: boolean; folder?: VaultFolder; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const { data: isSuperadmin } = await supabase
      .rpc('is_superadmin', { p_user_id: user.id })
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can manage vault' }
    }

    // Get current folder to check parent
    const { data: currentFolder } = await supabase
      .from('vault_folders')
      .select('parent_id')
      .eq('id', id)
      .single()

    if (!currentFolder) {
      return { success: false, error: 'Folder not found' }
    }

    // Check if folder with same name exists in parent
    if (currentFolder.parent_id) {
      const { data: existing } = await supabase
        .from('vault_folders')
        .select('id')
        .eq('name', name)
        .eq('parent_id', currentFolder.parent_id)
        .neq('id', id)
        .single()
      
      if (existing) {
        return { success: false, error: 'A folder with this name already exists in this location' }
      }
    } else {
      const { data: existing } = await supabase
        .from('vault_folders')
        .select('id')
        .eq('name', name)
        .is('parent_id', null)
        .neq('id', id)
        .single()
      
      if (existing) {
        return { success: false, error: 'A folder with this name already exists at root level' }
      }
    }

    const { data: folder, error } = await supabase
      .from('vault_folders')
      .update({
        name,
        description,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/admin/vault')
    return { success: true, folder: folder as VaultFolder }
  } catch (error: any) {
    console.error('Error updating folder:', error)
    return { success: false, error: error.message || 'Failed to update folder' }
  }
}

export async function deleteFolder(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const { data: isSuperadmin } = await supabase
      .rpc('is_superadmin', { p_user_id: user.id })
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can manage vault' }
    }

    // Check if folder has children or files
    const { data: children } = await supabase
      .from('vault_folders')
      .select('id')
      .eq('parent_id', id)
      .limit(1)

    const { data: files } = await supabase
      .from('vault_files')
      .select('id')
      .eq('folder_id', id)
      .limit(1)

    if (children && children.length > 0) {
      return { success: false, error: 'Cannot delete folder: it contains subfolders' }
    }

    if (files && files.length > 0) {
      return { success: false, error: 'Cannot delete folder: it contains files' }
    }

    const { error } = await supabase
      .from('vault_folders')
      .delete()
      .eq('id', id)

    if (error) throw error

    revalidatePath('/admin/vault')
    return { success: true }
  } catch (error: any) {
    console.error('Error deleting folder:', error)
    return { success: false, error: error.message || 'Failed to delete folder' }
  }
}

export async function getFolders(): Promise<{ success: boolean; folders?: VaultFolder[]; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const { data: isSuperadmin } = await supabase
      .rpc('is_superadmin', { p_user_id: user.id })
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can access vault' }
    }

    const { data: folders, error } = await supabase
      .from('vault_folders')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error

    // Get file counts for each folder
    const foldersWithCounts = await Promise.all(
      (folders || []).map(async (folder) => {
        const { count } = await supabase
          .from('vault_files')
          .select('*', { count: 'exact', head: true })
          .eq('folder_id', folder.id)
        
        return {
          ...folder,
          file_count: count || 0,
        }
      })
    )

    return { success: true, folders: foldersWithCounts as VaultFolder[] }
  } catch (error: any) {
    console.error('Error fetching folders:', error)
    return { success: false, error: error.message || 'Failed to fetch folders' }
  }
}

// ============================================
// FILE OPERATIONS
// ============================================

export async function uploadFile(
  file: File,
  folderId: string | null,
  name: string,
  description: string | null = null,
  tags: string[] = []
): Promise<{ success: boolean; file?: VaultFile; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const { data: isSuperadmin } = await supabase
      .rpc('is_superadmin', { p_user_id: user.id })
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can manage vault' }
    }

    // Check if file with same name exists in folder
    if (folderId) {
      const { data: existing } = await supabase
        .from('vault_files')
        .select('id')
        .eq('name', name)
        .eq('folder_id', folderId)
        .single()
      
      if (existing) {
        return { success: false, error: 'A file with this name already exists in this folder' }
      }
    } else {
      const { data: existing } = await supabase
        .from('vault_files')
        .select('id')
        .eq('name', name)
        .is('folder_id', null)
        .single()
      
      if (existing) {
        return { success: false, error: 'A file with this name already exists at root level' }
      }
    }

    // Upload file to Supabase Storage
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
    const filePath = `vault/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('compliance-vault')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return { success: false, error: 'Failed to upload file to storage' }
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('compliance-vault')
      .getPublicUrl(filePath)

    // Create file record
    const { data: vaultFile, error } = await supabase
      .from('vault_files')
      .insert({
        name,
        folder_id: folderId,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
        description,
        tags,
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single()

    if (error) {
      // Clean up uploaded file if database insert fails
      await supabase.storage.from('compliance-vault').remove([filePath])
      throw error
    }

    revalidatePath('/admin/vault')
    return { success: true, file: vaultFile as VaultFile }
  } catch (error: any) {
    console.error('Error uploading file:', error)
    return { success: false, error: error.message || 'Failed to upload file' }
  }
}

export async function getFiles(folderId: string | null = null): Promise<{ success: boolean; files?: VaultFile[]; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const { data: isSuperadmin } = await supabase
      .rpc('is_superadmin', { p_user_id: user.id })
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can access vault' }
    }

    const query = supabase
      .from('vault_files')
      .select('*')
      .order('name', { ascending: true })

    if (folderId === null) {
      query.is('folder_id', null)
    } else {
      query.eq('folder_id', folderId)
    }

    const { data: files, error } = await query

    if (error) throw error

    return { success: true, files: files as VaultFile[] }
  } catch (error: any) {
    console.error('Error fetching files:', error)
    return { success: false, error: error.message || 'Failed to fetch files' }
  }
}

export async function updateFile(
  id: string,
  name: string,
  description: string | null = null,
  tags: string[] = []
): Promise<{ success: boolean; file?: VaultFile; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const { data: isSuperadmin } = await supabase
      .rpc('is_superadmin', { p_user_id: user.id })
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can manage vault' }
    }

    // Get current file to check folder
    const { data: currentFile } = await supabase
      .from('vault_files')
      .select('folder_id')
      .eq('id', id)
      .single()

    if (!currentFile) {
      return { success: false, error: 'File not found' }
    }

    // Check if file with same name exists in folder
    if (currentFile.folder_id) {
      const { data: existing } = await supabase
        .from('vault_files')
        .select('id')
        .eq('name', name)
        .eq('folder_id', currentFile.folder_id)
        .neq('id', id)
        .single()
      
      if (existing) {
        return { success: false, error: 'A file with this name already exists in this folder' }
      }
    } else {
      const { data: existing } = await supabase
        .from('vault_files')
        .select('id')
        .eq('name', name)
        .is('folder_id', null)
        .neq('id', id)
        .single()
      
      if (existing) {
        return { success: false, error: 'A file with this name already exists at root level' }
      }
    }

    const { data: vaultFile, error } = await supabase
      .from('vault_files')
      .update({
        name,
        description,
        tags,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/admin/vault')
    return { success: true, file: vaultFile as VaultFile }
  } catch (error: any) {
    console.error('Error updating file:', error)
    return { success: false, error: error.message || 'Failed to update file' }
  }
}

export async function deleteFile(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const { data: isSuperadmin } = await supabase
      .rpc('is_superadmin', { p_user_id: user.id })
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can manage vault' }
    }

    // Get file path before deleting
    const { data: file } = await supabase
      .from('vault_files')
      .select('file_path')
      .eq('id', id)
      .single()

    if (!file) {
      return { success: false, error: 'File not found' }
    }

    // Delete from database
    const { error } = await supabase
      .from('vault_files')
      .delete()
      .eq('id', id)

    if (error) throw error

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('compliance-vault')
      .remove([file.file_path])

    if (storageError) {
      console.error('Error deleting file from storage:', storageError)
      // Don't fail if storage delete fails - file record is already deleted
    }

    revalidatePath('/admin/vault')
    return { success: true }
  } catch (error: any) {
    console.error('Error deleting file:', error)
    return { success: false, error: error.message || 'Failed to delete file' }
  }
}

export async function getFileDownloadUrl(filePath: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if superadmin
    const { data: isSuperadmin } = await supabase
      .rpc('is_superadmin', { p_user_id: user.id })
    
    if (!isSuperadmin) {
      return { success: false, error: 'Only superadmins can access vault' }
    }

    const { data: { publicUrl } } = supabase.storage
      .from('compliance-vault')
      .getPublicUrl(filePath)

    return { success: true, url: publicUrl }
  } catch (error: any) {
    console.error('Error getting file URL:', error)
    return { success: false, error: error.message || 'Failed to get file URL' }
  }
}
