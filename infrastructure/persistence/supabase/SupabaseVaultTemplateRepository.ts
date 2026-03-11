import type { VaultTemplateRecord, VaultTemplateRepository } from '@/application/interfaces/VaultTemplateRepository'
import { createAdminClient } from '@/utils/supabase/admin'

type VaultTemplateRow = {
  id: string
  document_name: string
  folder_name: string | null
  default_frequency: VaultTemplateRecord['defaultFrequency']
  category: string | null
  description: string | null
  is_mandatory: boolean
}

export class SupabaseVaultTemplateRepository implements VaultTemplateRepository {
  async getFolderPaths(): Promise<string[]> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('document_templates_internal')
      .select('folder_name')
      .not('folder_name', 'is', null)

    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    return (data ?? [])
      .map((row: { folder_name: string | null }) => row.folder_name)
      .filter((folderName: string | null): folderName is string => Boolean(folderName))
  }

  async getTemplates(folderPath?: string | null): Promise<VaultTemplateRecord[]> {
    const adminSupabase: any = createAdminClient()
    let query = adminSupabase
      .from('document_templates_internal')
      .select('id, document_name, folder_name, default_frequency, category, description, is_mandatory')

    if (folderPath) {
      query = query.eq('folder_name', folderPath)
    }

    const { data, error } = await query.order('document_name', { ascending: true })
    if (error) throw Object.assign(new Error(error.message), { code: error.code })

    return (data ?? []).map((row: VaultTemplateRow) => ({
      id: row.id,
      documentName: row.document_name,
      folderName: row.folder_name,
      defaultFrequency: row.default_frequency,
      category: row.category,
      description: row.description,
      isMandatory: row.is_mandatory,
    }))
  }
}
