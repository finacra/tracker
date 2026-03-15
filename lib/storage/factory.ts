import type { StorageAdapter } from './StorageAdapter'
import { SupabaseStorageAdapter } from './SupabaseStorageAdapter'

/**
 * Storage Factory
 * 
 * Creates the appropriate storage adapter based on environment configuration.
 * This allows easy switching between storage providers by changing an environment variable.
 * 
 * Supported providers:
 * - 'supabase' (default) - Supabase Storage
 * - Future: 's3', 'azure', 'gcs', 'neon', etc.
 * 
 * Usage:
 * ```typescript
 * const storage = createStorageAdapter()
 * await storage.uploadFile('bucket', 'path', buffer)
 * ```
 */
export function createStorageAdapter(): StorageAdapter {
  const provider = process.env.STORAGE_PROVIDER || 'supabase'

  switch (provider) {
    case 'supabase':
      return new SupabaseStorageAdapter()
    
    // Future providers can be added here:
    // case 's3':
    //   return new S3StorageAdapter()
    // case 'azure':
    //   return new AzureStorageAdapter()
    // case 'gcs':
    //   return new GCSStorageAdapter()
    
    default:
      throw new Error(
        `Unknown storage provider: ${provider}. ` +
        `Supported providers: supabase. ` +
        `Set STORAGE_PROVIDER environment variable.`
      )
  }
}

/**
 * Get the default storage bucket name for company documents
 */
export function getDefaultBucket(): string {
  return process.env.STORAGE_BUCKET || 'company-documents'
}
