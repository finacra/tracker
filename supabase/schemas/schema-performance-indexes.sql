-- ============================================
-- PERFORMANCE INDEXES FOR DATA ROOM INITIALIZATION
-- ============================================
-- This script adds indexes to optimize getDataRoomInitState query
-- which is taking 4-5 seconds in production
-- ============================================

-- ============================================
-- 1. USER_ROLES TABLE INDEXES
-- ============================================
-- The query frequently checks: (app_user_id = X OR user_id = X) AND company_id = Y
-- We need indexes for both app_user_id and user_id lookups

-- Index for Passport users (app_user_id)
CREATE INDEX IF NOT EXISTS idx_user_roles_app_user_id_company_id 
  ON public.user_roles(app_user_id, company_id) 
  WHERE app_user_id IS NOT NULL;

-- Index for legacy Supabase users (user_id)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_company_id 
  ON public.user_roles(user_id, company_id) 
  WHERE user_id IS NOT NULL;

-- Index for superadmin check (company_id IS NULL AND role = 'superadmin')
CREATE INDEX IF NOT EXISTS idx_user_roles_superadmin 
  ON public.user_roles(app_user_id, role) 
  WHERE company_id IS NULL AND role = 'superadmin';

CREATE INDEX IF NOT EXISTS idx_user_roles_superadmin_legacy 
  ON public.user_roles(user_id, role) 
  WHERE company_id IS NULL AND role = 'superadmin';

-- ============================================
-- 2. SUBSCRIPTIONS TABLE INDEXES
-- ============================================
-- The query frequently checks subscriptions with complex conditions:
-- - (app_user_id = X OR user_id = X)
-- - subscription_type = 'user' or 'company'
-- - (status = 'active' OR is_trial = true)
-- - (trial_ends_at > NOW() OR end_date > NOW())
-- - company_id = Y

-- Index for user-level subscriptions (Passport users)
CREATE INDEX IF NOT EXISTS idx_subscriptions_app_user_id_type_status 
  ON public.subscriptions(app_user_id, subscription_type, status, is_trial) 
  WHERE app_user_id IS NOT NULL;

-- Index for user-level subscriptions (legacy users)
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id_type_status 
  ON public.subscriptions(user_id, subscription_type, status, is_trial) 
  WHERE user_id IS NOT NULL;

-- Index for company-level subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_company_id_type_status 
  ON public.subscriptions(company_id, subscription_type, status, is_trial) 
  WHERE company_id IS NOT NULL;

-- Index for active subscription lookups with date checks
-- This helps with the EXISTS subqueries checking trial_ends_at and end_date
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_trial_dates 
  ON public.subscriptions(is_trial, trial_ends_at, end_date) 
  WHERE (status = 'active' OR is_trial = true);

-- Index for company subscriptions with date checks
CREATE INDEX IF NOT EXISTS idx_subscriptions_company_active_dates 
  ON public.subscriptions(company_id, subscription_type, is_trial, trial_ends_at, end_date) 
  WHERE company_id IS NOT NULL AND (status = 'active' OR is_trial = true);

-- Index for owner subscriptions (checking app_user_id or user_id on companies)
CREATE INDEX IF NOT EXISTS idx_subscriptions_owner_active_dates 
  ON public.subscriptions(app_user_id, subscription_type, is_trial, trial_ends_at, end_date) 
  WHERE app_user_id IS NOT NULL AND subscription_type = 'user' AND (status = 'active' OR is_trial = true);

CREATE INDEX IF NOT EXISTS idx_subscriptions_owner_active_dates_legacy 
  ON public.subscriptions(user_id, subscription_type, is_trial, trial_ends_at, end_date) 
  WHERE user_id IS NOT NULL AND subscription_type = 'user' AND (status = 'active' OR is_trial = true);

-- ============================================
-- 3. COMPANIES TABLE INDEXES
-- ============================================
-- The query checks: (app_user_id = X OR user_id = X)

-- Index for Passport users
CREATE INDEX IF NOT EXISTS idx_companies_app_user_id 
  ON public.companies(app_user_id) 
  WHERE app_user_id IS NOT NULL;

-- Index for legacy Supabase users
CREATE INDEX IF NOT EXISTS idx_companies_user_id 
  ON public.companies(user_id) 
  WHERE user_id IS NOT NULL;

-- Composite index for owner lookups
CREATE INDEX IF NOT EXISTS idx_companies_owner_ids 
  ON public.companies(app_user_id, user_id);

-- ============================================
-- 4. REGULATORY_REQUIREMENTS TABLE INDEXES
-- ============================================
-- The query orders by due_date, so we need a composite index

-- Composite index for company_id + due_date (for ORDER BY)
CREATE INDEX IF NOT EXISTS idx_regulatory_requirements_company_due_date 
  ON public.regulatory_requirements(company_id, due_date);

-- ============================================
-- 5. DIRECTORS TABLE INDEXES
-- ============================================
-- The query filters by company_id and orders by created_at

CREATE INDEX IF NOT EXISTS idx_directors_company_id_created_at 
  ON public.directors(company_id, created_at);

-- ============================================
-- 6. COMPANY_DOCUMENTS_INTERNAL TABLE INDEXES
-- ============================================
-- The query filters by company_id and orders by created_at DESC

CREATE INDEX IF NOT EXISTS idx_company_documents_company_created 
  ON public.company_documents_internal(company_id, created_at DESC);

-- ============================================
-- 7. COMPANY_DOCUMENT_TEMPLATE_EXCLUSIONS TABLE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_company_doc_template_exclusions_company 
  ON public.company_document_template_exclusions(company_id);

-- ============================================
-- 8. COMPANY_COMPLIANCE_EXCLUSIONS TABLE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_company_compliance_exclusions_company 
  ON public.company_compliance_exclusions(company_id);

-- ============================================
-- 9. APP_USERS TABLE INDEXES
-- ============================================
-- The query looks up users by id (primary key already indexed, but ensure it exists)

-- Primary key should already have an index, but verify
-- No additional index needed as id is the primary key

-- ============================================
-- 10. COVERING INDEXES (Include all columns needed)
-- ============================================
-- These indexes include all columns needed by the query, avoiding table lookups

-- Covering index for subscriptions (includes all columns used in active_subscriptions CTE)
CREATE INDEX IF NOT EXISTS idx_subscriptions_covering_active 
  ON public.subscriptions(company_id, subscription_type, status, is_trial, trial_ends_at, end_date, app_user_id, user_id, created_at)
  WHERE (status = 'active' OR is_trial = true)
    AND (
      (is_trial = true AND trial_ends_at > NOW())
      OR 
      ((is_trial = false OR is_trial IS NULL) AND end_date > NOW())
    );

-- Covering index for user_roles (includes role for superadmin and company lookups)
CREATE INDEX IF NOT EXISTS idx_user_roles_covering 
  ON public.user_roles(app_user_id, user_id, company_id, role)
  WHERE company_id IS NOT NULL;

-- Covering index for companies (includes app_user_id and user_id for owner lookups)
CREATE INDEX IF NOT EXISTS idx_companies_covering_owner 
  ON public.companies(id, app_user_id, user_id);

-- ============================================
-- ANALYZE TABLES
-- ============================================
-- Update statistics for the query planner

ANALYZE public.user_roles;
ANALYZE public.subscriptions;
ANALYZE public.companies;
ANALYZE public.regulatory_requirements;
ANALYZE public.directors;
ANALYZE public.company_documents_internal;
ANALYZE public.company_document_template_exclusions;
ANALYZE public.company_compliance_exclusions;
ANALYZE public.app_users;
