import type { VaultFolderRepository } from '@/application/interfaces/VaultFolderRepository'
import { createAdminClient } from '@/utils/supabase/admin'

export class SupabaseVaultFolderRepository implements VaultFolderRepository {
  async folderExists(path: string): Promise<boolean> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('document_templates_internal')
      .select('folder_name')
      .eq('folder_name', path)
      .limit(1)
    if (error) throw new Error(error.message)
    return (data?.length ?? 0) > 0
  }

  async createFolderPlaceholder(path: string, description: string | null): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('document_templates_internal')
      .insert({
        document_name: `__FOLDER_PLACEHOLDER_${Date.now()}__`,
        folder_name: path,
        default_frequency: 'one-time',
        is_mandatory: false,
        description,
      })
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
  }

  async updateFolderDescription(path: string, description: string): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('document_templates_internal')
      .update({ description })
      .eq('folder_name', path)
    if (error) throw new Error(error.message)
  }

  async renameFolder(oldPath: string, newPath: string): Promise<number> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase.rpc('update_folder_name_cascade', {
      old_folder_path: oldPath,
      new_folder_path: newPath,
    })
    if (error) throw new Error(error.message)
    return Number(data ?? 0)
  }

  async folderHasDocuments(path: string): Promise<boolean> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase.rpc('folder_has_documents', { folder_path: path })
    if (error) throw new Error(error.message)
    return Boolean(data)
  }

  async getSubfolderPaths(path: string): Promise<string[]> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('document_templates_internal')
      .select('folder_name')
      .like('folder_name', `${path}/%`)
    if (error) throw new Error(error.message)
    return (data ?? [])
      .map((row: { folder_name: string | null }) => row.folder_name)
      .filter((folderName: string | null): folderName is string => Boolean(folderName))
  }

  async deleteFolderPath(path: string): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('document_templates_internal')
      .delete()
      .eq('folder_name', path)
    if (error) throw new Error(error.message)
  }

  async deleteSubfolderPaths(pathPrefix: string): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('document_templates_internal')
      .delete()
      .like('folder_name', pathPrefix)
    if (error) throw new Error(error.message)
  }
}
