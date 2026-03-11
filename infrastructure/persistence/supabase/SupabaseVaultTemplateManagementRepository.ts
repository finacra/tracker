import type {
  VaultTemplateDetails,
  VaultTemplateManagementRecord,
  VaultTemplateManagementRepository,
  VaultTemplateMutationInput,
} from '@/application/interfaces/VaultTemplateManagementRepository'
import { createAdminClient } from '@/utils/supabase/admin'

type TemplateRow = {
  id: string
  document_name: string
  folder_name: string | null
  default_frequency: VaultTemplateMutationInput['defaultFrequency']
  category: string | null
  description: string | null
  is_mandatory: boolean
}

export class SupabaseVaultTemplateManagementRepository implements VaultTemplateManagementRepository {
  async existsByName(documentName: string, excludeId?: string): Promise<boolean> {
    const adminSupabase: any = createAdminClient()
    let query = adminSupabase
      .from('document_templates_internal')
      .select('id')
      .eq('document_name', documentName)

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { data, error } = await query.limit(1)
    if (error) throw new Error(error.message)
    return (data?.length ?? 0) > 0
  }

  async getById(id: string): Promise<VaultTemplateDetails | null> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('document_templates_internal')
      .select('id, document_name, folder_name')
      .eq('id', id)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return null

    return {
      id: data.id,
      documentName: data.document_name,
      folderName: data.folder_name,
    }
  }

  async create(input: VaultTemplateMutationInput): Promise<VaultTemplateManagementRecord> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('document_templates_internal')
      .insert({
        document_name: input.documentName,
        folder_name: input.folderName,
        default_frequency: input.defaultFrequency,
        category: input.category,
        description: input.description,
        is_mandatory: input.isMandatory,
      })
      .select('id, document_name, folder_name, default_frequency, category, description, is_mandatory')
      .single()

    if (error) throw new Error(error.message)
    return this.mapRow(data as TemplateRow)
  }

  async update(id: string, input: VaultTemplateMutationInput): Promise<VaultTemplateManagementRecord> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('document_templates_internal')
      .update({
        document_name: input.documentName,
        folder_name: input.folderName,
        default_frequency: input.defaultFrequency,
        category: input.category,
        description: input.description,
        is_mandatory: input.isMandatory,
      })
      .eq('id', id)
      .select('id, document_name, folder_name, default_frequency, category, description, is_mandatory')
      .single()

    if (error) throw new Error(error.message)
    return this.mapRow(data as TemplateRow)
  }

  async delete(id: string): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('document_templates_internal')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
  }

  private mapRow(row: TemplateRow): VaultTemplateManagementRecord {
    return {
      id: row.id,
      documentName: row.document_name,
      folderName: row.folder_name,
      defaultFrequency: row.default_frequency,
      category: row.category,
      description: row.description,
      isMandatory: row.is_mandatory,
    }
  }
}
