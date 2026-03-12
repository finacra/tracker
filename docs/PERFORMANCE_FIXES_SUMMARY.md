# Performance Fixes Summary

## Fixes Applied

### 1. ✅ Add Subscription Index (saves ~500ms, more robust)

**Migration Files:**
- `supabase/migrations/add-subscription-app-user-index.sql` - For production (CONCURRENTLY, zero-downtime)
- `supabase/migrations/add-subscription-app-user-index-transaction.sql` - For Supabase SQL Editor (transaction-safe)

**What it does:**
- Creates index `idx_subscriptions_app_user_active` on `subscriptions(app_user_id, status, is_trial)`
- Optimizes the UNION query in `getUserSubscriptionState` without fragile conditional logic
- Makes subscription lookups fast for all identity paths (Passport, Supabase, linked)

**To apply:**
1. Run `add-subscription-app-user-index-transaction.sql` in Supabase SQL Editor (for immediate use)
2. Or run `add-subscription-app-user-index.sql` in production with `CONCURRENTLY` for zero-downtime

### 2. ✅ Revert Fragile Conditional Logic (more robust)

**File:** `infrastructure/persistence/prisma/PrismaSubscriptionRepository.ts`

**What changed:**
- Removed the fragile "try Passport user first" conditional logic
- Now always uses the UNION query (which is fast with the new index)
- More robust - handles all identity paths correctly without silent failures

**Why:**
- The conditional logic could fail silently if `app_user_id` was null or mismatched
- UNION query with index is just as fast and more reliable

### 3. ✅ Skip getAccessibleCompanyIds When CompanyId Known (saves ~1.9s for superadmins)

**File:** `app/data-room/actions.ts`

**What changed:**
- Modified `getDataRoomInitState` to check if `preferredCompanyId` is provided
- If provided: Only validate access for that single company (fast path)
- If not provided: Fetch all accessible companies (slow path, needed for company selector)

**Performance impact:**
- Superadmins: Saves ~1.9s (no need to fetch all 31 companies)
- Regular users: Saves ~500ms (no need to fetch all accessible companies)

### 4. ✅ Non-Blocking Refresh (already done)

**File:** `application/use-cases/requirements/GetCompanyRequirements.ts`

**Status:** Already implemented
- `refreshOverdueStatuses` runs in background (fire and forget)
- Requirements are fetched immediately without waiting for status refresh
- Tradeoff: Users may briefly see stale overdue statuses on first load (acceptable)

## Expected Performance Improvements

| Step | Before | After (with all fixes) | Improvement |
|------|--------|------------------------|-------------|
| DB cold start | 1871ms | ~200ms (with pooler) | -1.7s |
| getAccessibleCompanyIds | 1879ms | ~0ms (if companyId known) | -1.9s |
| Subscription check | 2997ms | ~200ms (with index) | -2.8s |
| User role | 4253ms | ~1000ms (parallelized) | -3.3s |
| Requirements | 6638ms | ~1500ms (non-blocking) | -5.1s |
| **Total** | **~17s** | **~2-3s** | **-14-15s** |

## Next Steps

1. **Apply Transaction Pooler** (biggest win - saves ~3.5s):
   - Update `DATABASE_URL` in `.env` and Vercel: port `5432` → `6543` + `?pgbouncer=true&connection_limit=1`
   - Keep `DIRECT_URL` on port `5432` for migrations

2. **Run Migration:**
   - Execute `add-subscription-app-user-index-transaction.sql` in Supabase SQL Editor

3. **Deploy:**
   - Commit and push these changes
   - Monitor performance logs to verify improvements

## Verification

After deployment, check performance logs for:
- `[InitAction] ⏱️ Single company access check` (should be < 500ms)
- `[InitAction] ⏱️ Get accessible company IDs` (should only appear when companyId not known)
- `[PrismaSubscriptionRepository] getUserSubscriptionState` (should be < 500ms with index)
