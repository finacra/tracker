export interface VaultTemplateDetails {
  id: string
  documentName: string
  folderName: string | null
}

export interface VaultTemplateMutationInput {
  documentName: string
  folderName: string | null
  defaultFrequency: 'one-time' | 'monthly' | 'quarterly' | 'annually'
  category: string | null
  description: string | null
  isMandatory: boolean
}

export interface VaultTemplateManagementRecord extends VaultTemplateMutationInput {
  id: string
}

export interface VaultTemplateManagementRepository {
  existsByName(documentName: string, excludeId?: string): Promise<boolean>
  getById(id: string): Promise<VaultTemplateDetails | null>
  create(input: VaultTemplateMutationInput): Promise<VaultTemplateManagementRecord>
  update(id: string, input: VaultTemplateMutationInput): Promise<VaultTemplateManagementRecord>
  delete(id: string): Promise<void>
}
