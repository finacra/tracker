export interface VaultDocumentUsageRepository {
  hasDocumentsForTemplateName(documentName: string): Promise<boolean>
  updateDocumentsFolderByType(documentType: string, folderName: string | null): Promise<void>
  renameDocumentsByType(oldDocumentType: string, newDocumentType: string): Promise<void>
}
