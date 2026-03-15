import { createAdminClient } from '@/utils/supabase/admin'
import type { StorageAdapter } from './StorageAdapter'

/**
 * Supabase Storage Adapter
 * 
 * Implements StorageAdapter interface using Supabase Storage.
 * This allows the application to use Supabase storage while maintaining
 * the ability to switch to other providers in the future.
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  private adminClient: ReturnType<typeof createAdminClient>

  constructor() {
    this.adminClient = createAdminClient()
  }

  async uploadFile(
    bucket: string,
    path: string,
    fileData: Buffer | ArrayBuffer,
    options?: {
      contentType?: string
      upsert?: boolean
    }
  ): Promise<void> {
    // Convert ArrayBuffer to Buffer if needed
    const buffer = fileData instanceof ArrayBuffer ? Buffer.from(fileData) : fileData
    
    const { error } = await this.adminClient.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: options?.contentType,
        upsert: options?.upsert ?? false,
      })

    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`)
    }
  }

  async downloadFile(bucket: string, path: string): Promise<Buffer> {
    const { data, error } = await this.adminClient.storage
      .from(bucket)
      .download(path)

    if (error || !data) {
      throw new Error(`Storage download failed: ${error?.message || 'Empty response'}`)
    }

    return Buffer.from(await data.arrayBuffer())
  }

  async deleteFile(bucket: string, paths: string[]): Promise<void> {
    const { error } = await this.adminClient.storage
      .from(bucket)
      .remove(paths)

    if (error) {
      throw new Error(`Storage deletion failed: ${error.message}`)
    }
  }

  async createSignedUrl(bucket: string, path: string, expiresIn: number): Promise<string> {
    const { data, error } = await this.adminClient.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn)

    if (error || !data) {
      throw new Error(`Failed to create signed URL: ${error?.message || 'Empty response'}`)
    }

    return data.signedUrl
  }
}
