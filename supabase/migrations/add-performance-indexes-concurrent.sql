-- Critical indexes for Passport authentication queries (CONCURRENT VERSION)
-- These dramatically speed up the UNION queries used for Passport user lookups
-- 
-- IMPORTANT: This file must be run OUTSIDE of a transaction block.
-- Each statement should be run individually in Supabase SQL Editor.
-- 
-- For production databases with large tables, use this version to avoid table locks.
-- For development/small databases, use add-performance-indexes.sql instead.

-- Index for user_roles app_user_id lookups (Passport users)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_roles_app_user_id 
ON user_roles(app_user_id) 
WHERE app_user_id IS NOT NULL;

-- Index for user_roles user_id lookups (Supabase users)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_roles_user_id 
ON user_roles(user_id) 
WHERE user_id IS NOT NULL;

-- Composite index for company + app_user lookups (most common query pattern)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_roles_company_app_user 
ON user_roles(company_id, app_user_id) 
WHERE company_id IS NOT NULL AND app_user_id IS NOT NULL;

-- Composite index for company + user lookups (legacy Supabase pattern)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_roles_company_user 
ON user_roles(company_id, user_id) 
WHERE company_id IS NOT NULL AND user_id IS NOT NULL;

-- Index for auth_identities lookups (Passport migration - links Supabase to Passport)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auth_identities_app_user_legacy 
ON auth_identities(app_user_id, legacy_auth_id) 
WHERE provider = 'supabase' AND legacy_auth_id IS NOT NULL;

-- Index for companies app_user_id (owner lookups for Passport users)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_app_user_id 
ON companies(app_user_id) 
WHERE app_user_id IS NOT NULL;

-- Index for subscriptions app_user_id (user-based subscriptions)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_app_user_id 
ON subscriptions(app_user_id) 
WHERE app_user_id IS NOT NULL AND subscription_type = 'user';

-- Index for subscriptions user_id (legacy Supabase subscriptions)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_user_id 
ON subscriptions(user_id) 
WHERE user_id IS NOT NULL AND subscription_type = 'user';

-- Index for regulatory_requirements company_id (most common query pattern)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_regulatory_requirements_company_id 
ON regulatory_requirements(company_id) 
WHERE company_id IS NOT NULL;

-- Index for regulatory_requirements due_date (for status updates and filtering)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_regulatory_requirements_due_date 
ON regulatory_requirements(due_date) 
WHERE due_date IS NOT NULL;

-- Composite index for company + due_date queries (common in tracker)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_regulatory_requirements_company_due_date 
ON regulatory_requirements(company_id, due_date) 
WHERE company_id IS NOT NULL AND due_date IS NOT NULL;

-- Index for regulatory_requirements status (for filtering)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_regulatory_requirements_status 
ON regulatory_requirements(status) 
WHERE status IS NOT NULL;

-- Analyze tables after index creation to update query planner statistics
ANALYZE user_roles;
ANALYZE auth_identities;
ANALYZE companies;
ANALYZE subscriptions;
ANALYZE regulatory_requirements;
