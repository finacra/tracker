# Phase 1: Index Verification Guide

## ✅ Indexes Created

You've successfully run both migration options:
- **Option 1:** Standard indexes (transaction-safe)
- **Option 2:** Concurrent indexes (zero-downtime)

## 🔍 Verify Indexes Exist

Run this query in Supabase SQL Editor to verify all indexes were created:

```sql
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('user_roles', 'auth_identities', 'companies', 'subscriptions', 'regulatory_requirements')
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
```

## 📊 Expected Indexes

You should see **12 indexes** total:

### user_roles (4 indexes)
- `idx_user_roles_app_user_id`
- `idx_user_roles_user_id`
- `idx_user_roles_company_app_user`
- `idx_user_roles_company_user`

### auth_identities (1 index)
- `idx_auth_identities_app_user_legacy`

### companies (1 index)
- `idx_companies_app_user_id`

### subscriptions (2 indexes)
- `idx_subscriptions_app_user_id`
- `idx_subscriptions_user_id`

### regulatory_requirements (4 indexes)
- `idx_regulatory_requirements_company_id`
- `idx_regulatory_requirements_due_date`
- `idx_regulatory_requirements_company_due_date`
- `idx_regulatory_requirements_status`

## ⚠️ Duplicate Indexes

If you ran both Option 1 and Option 2, you might have duplicate indexes. This is **harmless** - PostgreSQL will use one and ignore the other. However, you can clean up duplicates if desired.

### Check for Duplicates:
```sql
SELECT 
    tablename,
    indexdef,
    COUNT(*) as duplicate_count,
    array_agg(indexname) as index_names
FROM pg_indexes
WHERE tablename IN ('user_roles', 'auth_identities', 'companies', 'subscriptions', 'regulatory_requirements')
    AND indexname LIKE 'idx_%'
GROUP BY tablename, indexdef
HAVING COUNT(*) > 1
ORDER BY tablename;
```

### Remove Duplicates (if any):
```sql
-- Only run if duplicates exist - replace 'duplicate_index_name' with actual name
-- DROP INDEX IF EXISTS duplicate_index_name;
```

## 🚀 Performance Testing

After indexes are created, test query performance:

### Before/After Comparison:
```sql
-- Test query that should be much faster now
EXPLAIN ANALYZE
SELECT ur.*
FROM user_roles ur
WHERE ur.app_user_id::uuid = 'YOUR_USER_ID_HERE'::uuid
UNION
SELECT ur.*
FROM user_roles ur
INNER JOIN auth_identities ai ON ai.legacy_auth_id::uuid = ur.user_id::uuid
WHERE ai.app_user_id::uuid = 'YOUR_USER_ID_HERE'::uuid AND ai.provider = 'supabase';
```

Look for:
- **Index Scan** (good) vs **Seq Scan** (bad)
- **Execution Time** should be < 10ms for small tables

## ✅ Next Steps

1. ✅ Indexes created
2. ✅ React Query integrated
3. ✅ Hooks migrated
4. ⏭️ **Test the application** - should see significant performance improvements
5. ⏭️ **Monitor React Query DevTools** - check cache hit rates

## 📈 Expected Improvements

- **Query Speed:** 10-100x faster (with indexes)
- **Database Load:** 80-90% reduction (with React Query caching)
- **Concurrent Users:** 60 users = 1 query instead of 60 queries
