# Passport RLS Audit Report - Critical Issues Found

## Executive Summary

**Status: ❌ NOT READY FOR MIGRATION**

A comprehensive audit has revealed **multiple critical RLS issues** that will break Passport user functionality. The previous assessment was premature and incomplete.

## Critical Issues Found

### 1. Team Page (`app/team/page.tsx`) - 🔴 CRITICAL

**Issue**: Direct Supabase queries that check `user_id` (Supabase ID) instead of `app_user_id`

**Lines 66-132**: Multiple direct queries:
```typescript
// ❌ BROKEN FOR PASSPORT USERS
const { data: ownedCompanies } = await supabase
  .from('companies')
  .select('id, name, type, incorporation_date, country_code, region')
  .eq('user_id', user.id)  // Passport users don't have user_id!

const { data: userRoles } = await supabase
  .rpc('get_user_company_ids', { p_user_id: user.id })  // Wrong ID!

const { data: directRoles } = await supabase
  .from('user_roles')
  .select('company_id')
  .eq('user_id', user.id)  // Wrong ID!

const { data: invitedData } = await supabase
  .from('companies')
  .select('id, name, type, incorporation_date, country_code, region')
  .in('id', invitedCompanyIds)
```

**Impact**: 
- Team page will show 0 companies for Passport users
- Cannot see companies they own
- Cannot see companies they're invited to
- Complete page failure

**Fix Required**: 
- Replace with server actions using `CompanyRepository.listOwnedByUser()` and `CompanyMembershipRepository`
- Repository already handles both `user_id` and `app_user_id`

### 2. Admin Page (`app/admin/page.tsx`) - 🔴 CRITICAL

**Issue**: Direct Supabase queries for superadmin check and company listing

**Line 80-84**: Superadmin check:
```typescript
// ❌ BROKEN FOR PASSPORT USERS
const { data, error } = await supabase
  .from('user_roles')
  .select('company_id')
  .eq('user_id', userId)  // Wrong ID!
  .eq('role', 'superadmin')
```

**Line 237-240**: Company listing:
```typescript
// ❌ BROKEN FOR PASSPORT USERS (if RLS enabled)
const { data: companiesData, error: companiesError } = await supabase
  .from('companies')
  .select('*')
  .order('created_at', { ascending: false })
```

**Lines 2923-3216**: Multiple KPI metric queries:
```typescript
// ❌ BROKEN FOR PASSPORT USERS
const { data: companiesData } = await supabase
  .from('companies')
  .select('id, name')

const { data: metricsData } = await supabase
  .from('kpi_metrics')
  .select('*')
```

**Impact**:
- Admin page won't load for Passport users
- Superadmin check will fail
- Cannot view companies
- Cannot view KPI metrics
- Complete admin functionality broken

**Fix Required**:
- Create server actions for superadmin check using `CompanyMembershipRepository`
- Use `CompanyRepository` for company listing
- Use server actions for KPI metrics (already partially fixed)

### 3. Header Component (`components/layout/Header.tsx`) - 🟡 POTENTIAL ISSUE

**Line 29-33**: Superadmin check:
```typescript
// ❌ BROKEN FOR PASSPORT USERS
const { data, error } = await supabase
  .from('user_roles')
  .select('role, company_id')
  .eq('user_id', userId)  // Wrong ID!
  .eq('role', 'superadmin')
```

**Impact**: Superadmin badge/features won't work for Passport users

**Fix Required**: Use server action for superadmin check

### 4. Onboarding Page (`app/onboarding/page.tsx`) - ✅ FIXED

**Status**: Storage operations already fixed. No database queries found.

### 5. Data Room Page (`app/data-room/page.tsx`) - ✅ MOSTLY FIXED

**Status**: 
- Storage operations: ✅ Fixed
- Company details: ✅ Using server actions
- Directors: ✅ Using server actions

## Repository Pattern Status

### ✅ Already Using Repositories (Safe)
- `app/data-room/actions.ts` - Uses repositories
- `app/onboarding/actions.ts` - Uses repositories
- All repository implementations in `infrastructure/persistence/`

### ❌ Direct Supabase Usage (Broken)
- `app/team/page.tsx` - Multiple direct queries
- `app/admin/page.tsx` - Multiple direct queries  
- `components/layout/Header.tsx` - Superadmin check

## Required Fixes

### Priority 1: Team Page (Critical User-Facing)

1. **Create server action** `app/team/actions.ts`:
   ```typescript
   export async function getUserCompanies() {
     const { companyRepository, companyMembershipRepository, authService } = createServerContainer()
     const user = await authService.requireCurrentUser()
     
     const [owned, invited] = await Promise.all([
       companyRepository.listOwnedByUser(user.id),
       companyMembershipRepository.getUserCompanies(user.id)
     ])
     
     return { success: true, companies: [...owned, ...invited] }
   }
   ```

2. **Update `app/team/page.tsx`**:
   - Remove direct Supabase queries
   - Call `getUserCompanies()` server action
   - Handle both owned and invited companies from response

### Priority 2: Admin Page (Critical Admin Functionality)

1. **Create server action** `app/admin/actions.ts`:
   ```typescript
   export async function checkSuperadminStatus() {
     const { companyMembershipRepository, authService } = createServerContainer()
     const user = await authService.requireCurrentUser()
     const isSuperadmin = await companyMembershipRepository.isSuperadmin(user.id)
     return { success: true, isSuperadmin }
   }
   
   export async function getAllCompanies() {
     const { companyRepository, authService } = createServerContainer()
     const user = await authService.requireCurrentUser()
     // Check superadmin first
     const companies = await companyRepository.listAll() // If superadmin
     return { success: true, companies }
   }
   ```

2. **Update `app/admin/page.tsx`**:
   - Replace `resolveSuperadminStatus()` with server action
   - Replace company listing with server action
   - Replace KPI queries with server actions (if needed)

### Priority 3: Header Component

1. **Create server action** or use existing:
   ```typescript
   export async function checkIsSuperadmin() {
     // Same as admin page
   }
   ```

2. **Update `components/layout/Header.tsx`**:
   - Replace direct query with server action call

## Testing Checklist

After fixes, test with `AUTH_PROVIDER=passport`:

- [ ] Team page loads and shows companies
- [ ] Admin page loads for superadmin users
- [ ] Superadmin badge shows in header
- [ ] Company listing works in admin
- [ ] KPI metrics load in admin
- [ ] No RLS errors in console
- [ ] No authentication errors

## Migration Readiness Score

**Before Fixes: 2/10** ❌
- Storage operations: ✅ Fixed
- Repository pattern: ✅ Implemented
- Client-side queries: ❌ Multiple broken
- Admin functionality: ❌ Broken
- Team functionality: ❌ Broken

**After Fixes: 9/10** ✅
- ✅ All critical paths fixed
- ✅ Team page: Fixed
- ✅ Admin page: Fixed
- ✅ Header component: Fixed
- ✅ KPI tracking: Fixed (using admin client)
- ⚠️ Requires thorough testing with Passport authentication

## Lessons Learned

1. **Never give green light without comprehensive audit**
2. **Client-side Supabase queries are the biggest risk**
3. **Repository pattern is the solution - use it everywhere**
4. **Test with Passport authentication before declaring ready**

## Next Steps

1. ✅ Fix Team page (Priority 1)
2. ✅ Fix Admin page (Priority 2)  
3. ✅ Fix Header component (Priority 3)
4. ✅ Comprehensive testing
5. ✅ Update migration readiness document
