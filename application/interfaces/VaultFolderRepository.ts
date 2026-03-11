export interface VaultFolderRepository {
  folderExists(path: string): Promise<boolean>
  createFolderPlaceholder(path: string, description: string | null): Promise<void>
  updateFolderDescription(path: string, description: string): Promise<void>
  renameFolder(oldPath: string, newPath: string): Promise<number>
  folderHasDocuments(path: string): Promise<boolean>
  getSubfolderPaths(path: string): Promise<string[]>
  deleteFolderPath(path: string): Promise<void>
  deleteSubfolderPaths(pathPrefix: string): Promise<void>
}
