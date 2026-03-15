/**
 * Storage Adapter Interface
 * 
 * Provides abstraction for file storage operations, allowing easy switching
 * between storage providers (Supabase, AWS S3, Azure Blob, Google Cloud Storage, etc.)
 * 
 * This follows the Dependency Inversion Principle (DIP) - depend on abstractions, not concretions.
 */
export interface StorageAdapter {
  /**
   * Upload a file to storage
   * @param bucket - The storage bucket/container name
   * @param path - The file path within the bucket
   * @param fileData - The file data as Buffer or ArrayBuffer
   * @param options - Upload options (contentType, upsert, etc.)
   * @returns Promise that resolves when upload is complete
   * @throws Error if upload fails
   */
  uploadFile(
    bucket: string,
    path: string,
    fileData: Buffer | ArrayBuffer,
    options?: {
      contentType?: string
      upsert?: boolean
    }
  ): Promise<void>

  /**
   * Download a file from storage
   * @param bucket - The storage bucket/container name
   * @param path - The file path within the bucket
   * @returns Promise that resolves with the file data as Buffer
   * @throws Error if download fails
   */
  downloadFile(bucket: string, path: string): Promise<Buffer>

  /**
   * Delete a file from storage
   * @param bucket - The storage bucket/container name
   * @param paths - Array of file paths to delete
   * @returns Promise that resolves when deletion is complete
   * @throws Error if deletion fails
   */
  deleteFile(bucket: string, paths: string[]): Promise<void>

  /**
   * Create a signed URL for temporary file access
   * @param bucket - The storage bucket/container name
   * @param path - The file path within the bucket
   * @param expiresIn - Expiration time in seconds
   * @returns Promise that resolves with the signed URL
   * @throws Error if URL creation fails
   */
  createSignedUrl(bucket: string, path: string, expiresIn: number): Promise<string>
}
