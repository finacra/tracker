# Storage Abstraction Layer

## Overview

This document describes the storage abstraction layer that allows easy switching between storage providers (Supabase, AWS S3, Azure Blob, Google Cloud Storage, etc.) without changing application code.

## Architecture

### Interface-Based Design (DIP)

The storage abstraction follows the **Dependency Inversion Principle (DIP)**:
- Application code depends on the `StorageAdapter` interface (abstraction)
- Concrete implementations (SupabaseStorageAdapter, S3StorageAdapter, etc.) implement the interface
- Factory pattern creates the appropriate adapter based on environment configuration

### Files Created

1. **`lib/storage/StorageAdapter.ts`** - Interface defining storage operations
2. **`lib/storage/SupabaseStorageAdapter.ts`** - Supabase implementation
3. **`lib/storage/factory.ts`** - Factory function to create adapters

### Files Modified

1. **`lib/utils/document-processor.ts`** - Replaced direct Supabase download with adapter
2. **`app/onboarding/actions.ts`** - Replaced direct Supabase delete with adapter
3. **`app/data-room/actions.ts`** - Replaced upload, delete, and signed URL calls with adapter
4. **`app/data-room/document-actions.ts`** - Replaced upload, delete, and signed URL calls with adapter

## Usage

### Basic Usage

```typescript
import { createStorageAdapter } from '@/lib/storage/factory'

const storage = createStorageAdapter()

// Upload file
await storage.uploadFile('company-documents', 'path/to/file.pdf', buffer, {
  contentType: 'application/pdf',
  upsert: false
})

// Download file
const fileData = await storage.downloadFile('company-documents', 'path/to/file.pdf')

// Delete file
await storage.deleteFile('company-documents', ['path/to/file.pdf'])

// Create signed URL
const signedUrl = await storage.createSignedUrl('company-documents', 'path/to/file.pdf', 3600)
```

### Switching Providers

### Switching Storage Providers

To switch storage providers, set the `STORAGE_PROVIDER` environment variable:

```env
# Use Supabase (default)
STORAGE_PROVIDER=supabase

# Future: Use AWS S3
STORAGE_PROVIDER=s3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Future: Use Azure Blob
STORAGE_PROVIDER=azure
AZURE_STORAGE_ACCOUNT=...
AZURE_STORAGE_KEY=...

# Future: Use Google Cloud Storage
STORAGE_PROVIDER=gcs
GCS_PROJECT_ID=...
GCS_KEY_FILE=...
```

### Switching Database Providers

**IMPORTANT:** When switching database providers, you must update both `DATABASE_URL` and `DIRECT_URL` in your `.env.local` file. These are Prisma environment variables that control which PostgreSQL database to connect to.

```env
# Supabase PostgreSQL
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

# AWS RDS PostgreSQL
DATABASE_URL=postgresql://[USERNAME]:[PASSWORD]@[ENDPOINT]:5432/[DATABASE]
DIRECT_URL=postgresql://[USERNAME]:[PASSWORD]@[ENDPOINT]:5432/[DATABASE]

# Neon PostgreSQL
DATABASE_URL=postgresql://[USERNAME]:[PASSWORD]@[ENDPOINT]/[DATABASE]?sslmode=require
DIRECT_URL=postgresql://[USERNAME]:[PASSWORD]@[ENDPOINT]/[DATABASE]?sslmode=require

# Azure Database for PostgreSQL
DATABASE_URL=postgresql://[USERNAME]@[SERVER]:[PASSWORD]@[SERVER].postgres.database.azure.com:5432/[DATABASE]?sslmode=require
DIRECT_URL=postgresql://[USERNAME]@[SERVER]:[PASSWORD]@[SERVER].postgres.database.azure.com:5432/[DATABASE]?sslmode=require

# Google Cloud SQL (PostgreSQL)
DATABASE_URL=postgresql://[USERNAME]:[PASSWORD]@/[DATABASE]?host=/cloudsql/[PROJECT]:[REGION]:[INSTANCE]
DIRECT_URL=postgresql://[USERNAME]:[PASSWORD]@/[DATABASE]?host=/cloudsql/[PROJECT]:[REGION]:[INSTANCE]
```

**Note:** 
- `DATABASE_URL` is used for connection pooling (via PgBouncer for Supabase)
- `DIRECT_URL` is used for migrations and direct connections
- Both must point to the same database instance
- For most providers, `DATABASE_URL` and `DIRECT_URL` can be the same
- Supabase uses PgBouncer, so `DATABASE_URL` includes `?pgbouncer=true` but `DIRECT_URL` does not

## Current Implementation

### Supabase Storage Adapter

The `SupabaseStorageAdapter` wraps Supabase Storage operations:
- Uses `createAdminClient()` for admin access
- Maps interface methods to Supabase Storage API
- Handles errors consistently

### Default Bucket

The default bucket name is `company-documents`. This can be overridden with:

```env
STORAGE_BUCKET=my-custom-bucket
```

## Complete Provider Switching Guide

### Example: Switching from Supabase to AWS RDS + S3

When switching providers, you need to update both **database** and **storage** configurations:

```env
# Database Configuration (Prisma)
DATABASE_URL=postgresql://username:password@your-db.region.rds.amazonaws.com:5432/dbname
DIRECT_URL=postgresql://username:password@your-db.region.rds.amazonaws.com:5432/dbname

# Storage Configuration
STORAGE_PROVIDER=s3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET=company-documents

# Note: Supabase-specific variables are no longer needed for storage
# But you may still need them if using Supabase Auth
# NEXT_PUBLIC_SUPABASE_URL=... (only if using Supabase Auth)
# SUPABASE_SERVICE_ROLE_KEY=... (only if using Supabase Auth)
```

### Example: Switching from Supabase to Neon + Supabase Storage

You can mix providers - use Neon for database but keep Supabase for storage:

```env
# Database: Neon PostgreSQL
DATABASE_URL=postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require
DIRECT_URL=postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require

# Storage: Keep Supabase (default)
STORAGE_PROVIDER=supabase
# Still need Supabase credentials for storage
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Example: Switching from Supabase to Azure Postgres + Azure Blob

```env
# Database: Azure PostgreSQL
DATABASE_URL=postgresql://username@server:password@server.postgres.database.azure.com:5432/dbname?sslmode=require
DIRECT_URL=postgresql://username@server:password@server.postgres.database.azure.com:5432/dbname?sslmode=require

# Storage: Azure Blob Storage
STORAGE_PROVIDER=azure
AZURE_STORAGE_ACCOUNT=your_storage_account
AZURE_STORAGE_KEY=your_storage_key
AZURE_STORAGE_CONTAINER=company-documents
```

## Adding New Providers

To add a new storage provider:

1. **Create adapter class** implementing `StorageAdapter`:

```typescript
// lib/storage/S3StorageAdapter.ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageAdapter } from './StorageAdapter'

export class S3StorageAdapter implements StorageAdapter {
  private s3Client: S3Client
  private bucket: string

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
    this.bucket = process.env.AWS_S3_BUCKET || 'company-documents'
  }

  async uploadFile(bucket: string, path: string, fileData: Buffer, options?: { contentType?: string; upsert?: boolean }): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: path,
      Body: fileData,
      ContentType: options?.contentType,
    })
    await this.s3Client.send(command)
  }

  async downloadFile(bucket: string, path: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: path,
    })
    const response = await this.s3Client.send(command)
    const chunks: Uint8Array[] = []
    for await (const chunk of response.Body as any) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }

  async deleteFile(bucket: string, paths: string[]): Promise<void> {
    await Promise.all(
      paths.map(path =>
        this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: path,
          })
        )
      )
    )
  }

  async createSignedUrl(bucket: string, path: string, expiresIn: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: path,
    })
    return await getSignedUrl(this.s3Client, command, { expiresIn })
  }
}
```

2. **Add to factory**:

```typescript
// lib/storage/factory.ts
import { S3StorageAdapter } from './S3StorageAdapter'

export function createStorageAdapter(): StorageAdapter {
  const provider = process.env.STORAGE_PROVIDER || 'supabase'

  switch (provider) {
    case 'supabase':
      return new SupabaseStorageAdapter()
    case 's3':
      return new S3StorageAdapter()
    // ... other providers
    default:
      throw new Error(`Unknown storage provider: ${provider}`)
  }
}
```

## Benefits

1. **Easy Provider Switching** - Change one environment variable to switch providers
2. **No Code Changes** - Application code doesn't need to change when switching providers
3. **Testability** - Easy to mock storage adapter for testing
4. **Future-Proof** - New providers can be added without modifying existing code
5. **Consistent API** - All providers use the same interface

## Migration Notes

- All direct Supabase storage calls have been replaced with adapter calls
- The adapter maintains the same error handling behavior
- No breaking changes to existing functionality
- Supabase remains the default provider (no environment variable needed)

## Testing

To test the storage abstraction:

1. **Unit Tests** - Mock the `StorageAdapter` interface
2. **Integration Tests** - Test with actual Supabase storage
3. **Provider Tests** - Test each provider implementation separately

## Future Enhancements

- [ ] Add AWS S3 adapter
- [ ] Add Azure Blob Storage adapter
- [ ] Add Google Cloud Storage adapter
- [ ] Add Neon Storage adapter
- [ ] Add support for multiple buckets
- [ ] Add file metadata support
- [ ] Add file listing/search capabilities
