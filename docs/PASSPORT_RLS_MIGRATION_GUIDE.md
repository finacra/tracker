# Passport RLS Migration Guide

## Overview

This document identifies all areas where direct Supabase client usage may cause Row-Level Security (RLS) issues for Passport users, and provides guidance for fixing them.

## Problem Statement

Passport users authenticate via Passport.js and don't have Supabase sessions. Any direct Supabase client operations (storage, database queries) will fail with RLS errors because:
1. Passport users don't have `auth.users.id` (they have `app_users.id`)
2. RLS policies check `auth.users.id` which doesn't exist for Passport users
3. Direct client-side Supabase operations require a valid Supabase session

## Solution Pattern

**Replace direct Supabase client operations with server actions that use admin client:**

1. **Storage Operations**: Use `createAdminClient()` in server actions
2. **Database Queries**: Use repository pattern (already implemented)
3. **Client Components**: Call server actions instead of direct Supabase client

## Fixed Issues ✅

### Storage Operations (All Fixed)
- ✅ `getDownloadUrl` - Now uses admin client
- ✅ `deleteDocument` - Now uses admin client  
- ✅ `uploadFileToStorage` - New server action using admin client
- ✅ DocumentsTab uploads - Now use `uploadFileToStorage`
- ✅ Data Room page uploads (2 locations) - Now use `uploadFileToStorage`
- ✅ Onboarding page uploads - Now use `uploadFileToStorage`

## Remaining Potential Issues

### 1. Direct Supabase Client Usage in Client Components

**Files to Audit:**
- `app/data-room/page.tsx` - May have remaining direct queries
- `app/onboarding/page.tsx` - May have remaining direct queries
- `components/layout/Header.tsx` - Uses supabase client (but uses server actions for notifications)
- `app/admin/page.tsx` - Uses supabase client
- `app/team/page.tsx` - Uses supabase client

**Pattern to Look For:**
```typescript
// ❌ BAD - Direct client usage
const supabase = createClient()
const { data } = await supabase.from('table').select('*')

// ✅ GOOD - Server action with repository
const result = await getDataFromServer()
```

### 2. Database Queries (Likely Already Fixed)

Most database operations should already go through repositories which handle both Supabase and Passport users. However, check for:

**Pattern to Look For:**
```typescript
// ❌ BAD - Direct query
const { data } = await supabase.from('companies').select('*').eq('user_id', userId)

// ✅ GOOD - Repository pattern
const companies = await companyRepository.listOwnedByUser(userId)
```

### 3. Storage Operations (All Fixed ✅)

All storage operations have been migrated to server actions using admin client.

## Migration Checklist

### For Each File with Direct Supabase Client Usage:

- [ ] Identify all `supabase.from()`, `supabase.storage`, `supabase.rpc()` calls
- [ ] Check if operation is already handled by a repository
- [ ] If not, create a server action that uses:
  - `createAdminClient()` for storage operations
  - Repository pattern for database operations
- [ ] Update client component to call server action instead
- [ ] Test with Passport user authentication

## Testing Strategy

1. **Switch to Passport authentication**: Set `AUTH_PROVIDER=passport` in `.env.local`
2. **Test each feature**:
   - Document viewing/previewing/exporting
   - Document uploading
   - Company data access
   - User profile access
   - Notifications
   - Team management
   - Admin features
3. **Check browser console** for RLS errors
4. **Check server logs** for authentication errors

## Common Error Patterns

### Storage Errors
```
Error [StorageApiError]: Object not found
Error [StorageApiError]: new row violates row-level security policy
```

### Database Errors
```
Error: insert or update on table "X" violates foreign key constraint
Error: new row violates row-level security policy
```

### Authentication Errors
```
Error: Not authenticated
Error: JWT expired
```

## Files Already Using Correct Pattern

These files already use server actions/repositories and should work for Passport users:
- `app/data-room/actions.ts` - Uses repositories
- `app/onboarding/actions.ts` - Uses repositories (storage operations fixed)
- All repository implementations in `infrastructure/persistence/`
- `app/providers.tsx` - Uses auth adapters correctly

## Next Steps

1. **Audit remaining files** listed in "Remaining Potential Issues"
2. **Create server actions** for any direct Supabase operations found
3. **Update client components** to use server actions
4. **Test thoroughly** with Passport authentication
5. **Document any new patterns** discovered

## Notes

- The repository pattern already handles most database operations correctly
- Storage operations were the main issue and are now fixed
- Some client components may still have direct Supabase usage for non-critical operations
- Admin operations may need special handling (they might legitimately need admin client)
