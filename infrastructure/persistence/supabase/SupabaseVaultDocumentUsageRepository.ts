import type { VaultDocumentUsageRepository } from '@/application/interfaces/VaultDocumentUsageRepository'
import { createAdminClient } from '@/utils/supabase/admin'

export class SupabaseVaultDocumentUsageRepository implements VaultDocumentUsageRepository {
  async hasDocumentsForTemplateName(documentName: string): Promise<boolean> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('company_documents_internal')
      .select('id')
      .eq('document_type', documentName)
      .limit(1)
    if (error) throw new Error(error.message)
    return (data?.length ?? 0) > 0
  }

  async updateDocumentsFolderByType(documentType: string, folderName: string | null): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('company_documents_internal')
      .update({ folder_name: folderName })
      .eq('document_type', documentType)
    if (error) throw new Error(error.message)
  }

  async renameDocumentsByType(oldDocumentType: string, newDocumentType: string): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('company_documents_internal')
      .update({ document_type: newDocumentType })
      .eq('document_type', oldDocumentType)
    if (error) throw new Error(error.message)
  }
}
