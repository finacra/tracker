# Critical Issues from Antigravity's Prisma Migration

## Executive Summary

Antigravity performed a massive Prisma migration that:
1. ✅ Created Prisma schema and 15+ Prisma repositories
2. ✅ Switched `server-container.ts` to use Prisma repositories
3. ❌ **DID NOT** generate Prisma client (runtime will fail)
4. ❌ **DID NOT** set up environment variables (DATABASE_URL, DIRECT_URL)
5. ❌ **DID NOT** remove old Supabase direct queries (mixed architecture)
6. ❌ **DID NOT** complete the migration (half-done state)

**Result**: The application is in a **broken state** - it will fail at runtime because:
- Prisma client doesn't exist (not generated)
- Prisma repositories can't connect (missing env vars)
- Old Supabase code still exists and conflicts

---

## ✅ Status Check: Prisma Setup

### Prisma Client: ✅ GENERATED
- Prisma client exists at `node_modules/.prisma/client/index.js`
- Version: 5.22.0

### Environment Variables: ✅ SET
- `DATABASE_URL` is set in `.env.local` (line 21)
- `DIRECT_URL` is set in `.env.local` (line 22)
- Both point to Supabase with connection pooling

### Prisma Schema: ✅ EXISTS
- Schema file exists at `prisma/schema.prisma`
- Contains all necessary models (AppUser, AuthIdentity, Company, etc.)

**Note**: The basic Prisma setup is actually correct! The issues are in the application layer.

---

## 🔴 Critical Blocker #1: Missing Repository Methods

### Problem
The `RequirementRepository` interface is **incomplete** - it's missing critical methods that are needed by the application.

### Current Interface (INCOMPLETE):
```typescript
// application/interfaces/RequirementRepository.ts
export interface RequirementRepository {
  refreshOverdueStatuses(companyId: string): Promise<void>
  getByCompanyId(companyId: string): Promise<Requirement[]>
  update(requirementId: string, input: UpdateRequirementInput): Promise<void>
  // ❌ MISSING: create()
  // ❌ MISSING: delete()
  // ❌ MISSING: getById()
}
```

### Impact
Because `create()` and `delete()` don't exist in the interface, `app/data-room/actions.ts` **cannot use the repository** and falls back to direct Supabase queries:

```typescript
// app/data-room/actions.ts:1211
// ❌ FORCED to use direct Supabase because repository.create() doesn't exist
const { data, error } = await adminSupabase
  .from('regulatory_requirements')
  .insert({ ... })
```

### Fix Required
Add missing methods to `RequirementRepository` interface:
1. `create(input: CreateRequirementInput): Promise<Requirement>`
2. `delete(requirementId: string, companyId?: string): Promise<void>`
3. `getById(requirementId: string): Promise<Requirement | null>`

Then implement them in `PrismaRequirementRepository`.

---

## 🔴 Critical Blocker #2: Mixed Architecture (Half-Migration)

### Problem
The codebase now has **TWO parallel data access layers**:
1. ✅ Prisma repositories (new, in `server-container.ts`)
2. ❌ Direct Supabase queries (old, still everywhere)

### Evidence

#### Files Still Using Direct Supabase Queries:

**Server Actions:**
- `app/data-room/actions.ts` - **80+ instances** of `adminSupabase.from()`
  - `createRequirement()` - line 1211: Direct insert to `regulatory_requirements`
  - `deleteRequirement()` - line 1281: Direct delete from `regulatory_requirements`
  - `updateRequirement()` - Multiple direct updates
  - `getRegulatoryRequirements()` - Direct queries
  - `sendDocumentsEmail()` - Direct queries

- `app/admin/vault/actions.ts` - Still uses `adminSupabase` for vault operations
- `app/onboarding/actions.ts` - Mixed: Uses repositories for some, Supabase for others

**Client Components:**
- `app/data-room/page.tsx` - Direct Supabase queries for company details
- `app/admin/page.tsx` - Direct Supabase queries for admin operations
- `components/layout/Header.tsx` - Direct Supabase queries

**Infrastructure (Legacy):**
- All `infrastructure/persistence/supabase/*.ts` files still exist
  - These are **NOT** being used by `server-container.ts` anymore
  - But they're still imported/used in many places

### Impact
1. **Data inconsistency**: Some code writes via Prisma, other code reads via Supabase
2. **Type mismatches**: Prisma models vs Supabase response shapes
3. **Performance**: Double queries, no connection pooling benefits
4. **Maintenance nightmare**: Two code paths doing the same thing

### Example of the Problem

```typescript
// app/data-room/actions.ts - Line 1211
// ❌ OLD WAY (still exists):
const { data, error } = await adminSupabase
  .from('regulatory_requirements')
  .insert({ ... })
  .select('id')
  .single()

// ✅ NEW WAY (should be used):
const { requirementRepository } = createServerContainer()
await requirementRepository.create({ ... })
```

**Both exist in the same file!**

---

## 🔴 Critical Blocker #3: Direct Supabase Queries in Server Actions

### Problem
Many operations that should use repositories are still using direct Supabase.

### Missing Repository Methods

**RequirementRepository** needs:
- `create()` - Currently done via `adminSupabase.from('regulatory_requirements').insert()`
- `update()` - Currently done via direct Supabase update
- `delete()` - Currently done via direct Supabase delete
- `getByCompanyId()` - Partially exists, but not used everywhere

**CompanyRepository** needs:
- `getYearType()` - Currently queried directly in `createRequirement()`

### Evidence
```typescript
// app/data-room/actions.ts:1203
const { data: company } = await adminSupabase
  .from('companies')
  .select('year_type')
  .eq('id', companyId)
  .single()
```

Should be:
```typescript
const { companyRepository } = createServerContainer()
const company = await companyRepository.getById(companyId)
const yearType = company?.yearType || 'FY'
```

---

## 🟡 Issue #4: Type Mismatches

### Problem
Prisma models have different field names/types than Supabase responses.

### Examples

**AppUser:**
- Prisma: `primary_email`, `full_name`
- Supabase: `email`, `user_metadata.full_name`
- Domain Model: `email`, `fullName`

**Company:**
- Prisma: `app_user_id` (new field)
- Supabase: `user_id` (legacy field)
- Code expects: Both? Neither? Confusion.

### Impact
Runtime errors when:
- Prisma returns `primary_email` but code expects `email`
- Supabase returns `user_id` but Prisma expects `app_user_id`
- Domain models expect `fullName` but get `full_name`

---

## 🟡 Issue #5: Server Container Mismatch

### Problem
`server-container.ts` creates Prisma repositories, but:
1. Many files still import/use Supabase repositories directly
2. Some files create their own Supabase clients
3. No consistent dependency injection

### Evidence

**Files creating their own Supabase clients:**
- `app/data-room/actions.ts` - Creates `adminSupabase` directly
- `app/admin/vault/actions.ts` - Creates `adminSupabase` directly
- `app/onboarding/actions.ts` - Creates `adminSupabase` directly

**Files importing Supabase repositories:**
- Many files still have: `import { SupabaseXRepository } from '@/infrastructure/...'`

### Impact
- No single source of truth
- Can't swap implementations
- Testing is impossible
- Violates Dependency Inversion Principle

---

## ✅ Status: Prisma Schema Validation

### Problem
The Prisma schema may not match the actual database schema.

### Risk
- Prisma models expect fields that don't exist
- Database has fields Prisma doesn't know about
- Migrations haven't been run

### Fix Required
```bash
npx prisma db pull  # Sync schema from database
npx prisma generate # Generate client
npx prisma validate # Validate schema
```

---

## Summary of Required Fixes

### Immediate (App Broken - Must Fix):
1. 🔴 **Add missing `create()` method to `RequirementRepository` interface**
2. 🔴 **Add missing `delete()` method to `RequirementRepository` interface**
3. 🔴 **Implement `create()` in `PrismaRequirementRepository`**
4. 🔴 **Implement `delete()` in `PrismaRequirementRepository`**
5. 🔴 **Refactor `createRequirement()` in `app/data-room/actions.ts` to use repository**
6. 🔴 **Refactor `deleteRequirement()` in `app/data-room/actions.ts` to use repository**

### High Priority (Data Inconsistency):
7. 🔴 Replace remaining `adminSupabase.from('regulatory_requirements')` calls with repository
8. 🔴 Replace `adminSupabase.from('companies')` queries with `CompanyRepository` methods
9. 🔴 Remove direct Supabase queries from `getRegulatoryRequirements()`
10. 🟡 Fix type mismatches between Prisma models and domain models

### Medium Priority (Technical Debt):
8. ✅ Remove unused Supabase repository files
9. ✅ Consolidate all data access through `server-container.ts`
10. ✅ Add integration tests for Prisma repositories
11. ✅ Document the new architecture

---

## Files That Need Immediate Attention

### Must Fix (App Broken):
1. `app/data-room/actions.ts` - 80+ direct Supabase queries
2. `app/admin/vault/actions.ts` - Direct Supabase queries
3. `app/onboarding/actions.ts` - Mixed Supabase/repository usage
4. `lib/prisma.ts` - Ensure Prisma client is properly initialized

### Should Fix (Data Inconsistency):
5. `app/data-room/page.tsx` - Client-side Supabase queries
6. `app/admin/page.tsx` - Direct Supabase queries
7. `components/layout/Header.tsx` - Direct Supabase queries

### Can Remove Later (Dead Code):
8. `infrastructure/persistence/supabase/*.ts` - If not used anywhere
9. Old Supabase repository implementations

---

## Testing Checklist

After fixes, verify:
- [ ] `npx prisma generate` succeeds
- [ ] `npm run build` succeeds
- [ ] `npm run dev` starts without errors
- [ ] Login works
- [ ] Data room loads companies
- [ ] Requirements can be created/updated/deleted
- [ ] Documents can be uploaded
- [ ] Admin vault works
- [ ] No console errors about Prisma client

---

## Recommended Fix Order

1. **Fix RequirementRepository Interface** (Blocker #1)
   - Add `create()` method signature
   - Add `delete()` method signature
   - Add `getById()` method signature (if needed)

2. **Implement Missing Repository Methods** (Blocker #1)
   - Implement `create()` in `PrismaRequirementRepository`
   - Implement `delete()` in `PrismaRequirementRepository`
   - Test with Prisma client

3. **Refactor Server Actions** (Blocker #2, #3)
   - Replace `createRequirement()` direct Supabase with repository
   - Replace `deleteRequirement()` direct Supabase with repository
   - Replace `getRegulatoryRequirements()` direct Supabase with repository
   - Replace company queries with `CompanyRepository`

4. **Fix Client Components** (Blocker #2)
   - Move remaining Supabase queries to server actions
   - Use server actions from client components

5. **Cleanup** (Issue #5)
   - Remove unused Supabase code
   - Consolidate through server-container

6. **Test Everything**
   - Integration tests
   - Manual testing
   - Performance testing

---

## Conclusion

**The migration is 70% complete:**
- ✅ Infrastructure created (Prisma schema, repositories)
- ✅ Prisma client generated
- ✅ Environment variables set
- ✅ Container wired (server-container.ts uses Prisma)
- ❌ **Repository interfaces incomplete** (missing `create()`, `delete()` methods)
- ❌ **Old code not removed** (mixed architecture - 80+ direct Supabase queries)
- ❌ **Migration incomplete** (many operations still use Supabase directly)

**The app will run, but has data inconsistency issues:**
- Some operations write via Prisma repositories
- Other operations write via direct Supabase queries
- This can cause data inconsistencies and type mismatches

**Primary Blocker**: `RequirementRepository` interface is missing `create()` and `delete()` methods, forcing the code to use direct Supabase queries.
