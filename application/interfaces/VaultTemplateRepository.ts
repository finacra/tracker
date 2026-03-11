export interface VaultTemplateRecord {
  id: string
  documentName: string
  folderName: string | null
  defaultFrequency: 'one-time' | 'monthly' | 'quarterly' | 'yearly' | 'annually'
  category: string | null
  description: string | null
  isMandatory: boolean
}

export interface VaultTemplateRepository {
  getFolderPaths(): Promise<string[]>
  getTemplates(folderPath?: string | null): Promise<VaultTemplateRecord[]>
}
