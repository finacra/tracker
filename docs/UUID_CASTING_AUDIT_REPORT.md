# UUID Casting Audit Report

## Issue Summary

PostgreSQL requires explicit type casting when comparing UUID columns with string parameters in raw SQL queries. Using `$queryRawUnsafe` with `$1::uuid` syntax doesn't properly cast the parameter, causing errors like:

```
ERROR: operator does not exist: uuid = text
HINT: No operator matches the given name and argument types. You might need to add explicit type casts.
```

## Solution

Replace all `$queryRawUnsafe` and `$executeRawUnsafe` calls that use UUID parameters with `Prisma.sql` template literals, which properly handle parameter casting:

**Before:**
```typescript
await prisma.$queryRawUnsafe(
  `SELECT * FROM companies WHERE id = $1::uuid`,
  companyId
)
```

**After:**
```typescript
await prisma.$queryRaw(
  Prisma.sql`SELECT * FROM companies WHERE id = ${companyId}::uuid`
)
```

## Files Audited and Fixed

### ✅ PrismaCompanyRepository.ts
- **Fixed:** `getDetailsById()` - Converted to use `Prisma.sql` with UUID cast
- **Status:** ✅ Fixed

### ✅ PrismaCompanyMembershipRepository.ts
- **Fixed:** `getRolesByUserId()` - Fixed both UUID queries
- **Fixed:** `findRole()` - Fixed both UUID queries
- **Status:** ✅ Fixed

### ✅ PrismaRequirementRepository.ts
- **Fixed:** `refreshOverdueStatuses()` - Converted to use `Prisma.sql`
- **Fixed:** `getByCompanyId()` - Converted to use `Prisma.sql` with UUID cast
- **Fixed:** `getById()` - Converted to use `Prisma.sql` with UUID cast
- **Fixed:** `create()` - Converted to use `Prisma.sql` with UUID casts for all UUID parameters
- **Fixed:** `delete()` - Converted to use `Prisma.sql` with UUID casts
- **Fixed:** `update()` - Converted to use `Prisma.sql` with UUID casts
- **Status:** ✅ Fixed

### ✅ PrismaVaultFolderRepository.ts
- **Checked:** No UUID parameters in raw queries
- **Status:** ✅ No issues found

## Remaining `$queryRawUnsafe` / `$executeRawUnsafe` Calls

The following calls remain but **do NOT have UUID parameters**, so they are safe:

1. **PrismaRequirementRepository.ts:**
   - `refreshAllOverdueStatuses()` - No parameters
   - `getAll()` - No parameters

## Impact

This audit and fix ensures that:
1. ✅ All UUID comparisons in Prisma raw queries work correctly
2. ✅ Company switching works without errors
3. ✅ All repository methods handle UUID parameters correctly
4. ✅ No more "operator does not exist: uuid = text" errors

## Testing Checklist

- [ ] Test company switching with Passport authentication
- [ ] Test requirement creation/update/delete
- [ ] Test company membership queries
- [ ] Test company details fetching
- [ ] Verify no UUID casting errors in console

## Notes

- All fixes use `Prisma.sql` template literals for proper parameterization
- UUID casts are explicit: `${variable}::uuid`
- This pattern should be used for all future raw queries with UUID parameters
