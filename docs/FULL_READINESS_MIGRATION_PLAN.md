# Full Readiness Migration Plan

## Objective

This document is the working plan for reaching full migration readiness for:

- Prisma DAL implementation
- app-owned user identity
- auth migration in two stages:
  - users migration first
  - Passport migration after identity and DAL are stable

The goal is not partial readiness. The goal is a state where feature code depends on app-owned models and interfaces, data access can be swapped to Prisma by composition, and auth can be migrated away from Supabase without rewriting business logic.

## Success Criteria

We are considered fully ready only when all of the following are true:

- application code depends on domain models and application interfaces, not Supabase-specific response shapes
- current-user resolution returns canonical `AppUser`
- app-owned identity tables exist and are backfilled
- business records have a migration path from legacy auth ids to canonical app user ids
- major feature flows no longer issue direct Supabase queries from feature/page/action files
- repository implementations can be swapped from Supabase to Prisma with container wiring only
- auth/session concerns are isolated enough to replace Supabase auth with Passport

## Status Legend

- `[x]` complete
- `[ ]` not complete
- `[~]` in progress / partially complete

## Current Position

### Completed foundation

- [x] `AppUser` domain model exists
- [x] access-related domain types exist
- [x] requirement domain model exists
- [x] notification domain model exists
- [x] `AuthService` exists
- [x] `AccessService` exists
- [x] `CompanyRepository` exists
- [x] `RequirementRepository` exists
- [x] `NotificationRepository` exists
- [x] `SubscriptionService` exists
- [x] `UserRepository` exists
- [x] server composition roots exist for the current abstraction slices
- [x] root-route destination decision is abstracted
- [x] post-auth redirect decision is abstracted
- [x] post-auth override rules are centralized
- [x] `useCompanyAccess` is behind application/infrastructure boundaries
- [x] `useAnyCompanyAccess` is behind application/infrastructure boundaries
- [x] requirements fetch path is abstracted
- [x] notification read/write/create paths are abstracted
- [x] first `UserRepository` slices are in place for selected user lookups

### Still blocking full readiness

- [x] app-owned identity schema exists (app_users, auth_identities)
- [x] canonical `app_users` / `auth_identities` mapping exists and backfilled
- [x] server-side auth resolution uses canonical current-user resolver
- [~] many server actions still depend directly on Supabase auth/session behavior
- [x] client code consumes `AppUser` through `AuthProvider` / `useAuth`
- [x] repository coverage is complete across onboarding, admin vault, payments, team, subscription, and document flows
- [x] several business rules moved out of Supabase RPCs
- [x] Prisma repository implementations exist for all core domains including User, Notification, Company, Requirement, Director, Payment, Subscription, Membership, Invitation, and Document repositories
- [x] Auth surface isolation: SessionProvider, AuthGateway, MiddlewareAuthCheck, ClientAuthAdapter interfaces exist with Supabase impls
- [~] Passport-ready session boundary does not exist yet (working on session adapter)

## Execution Rules

- [x] proceed incrementally, one focused migration slice at a time
- [x] validate build after each substantive phase
- [x] keep old behavior intact while changing boundaries
- [ ] do not add new feature code that reads raw Supabase auth user outside infrastructure/auth
- [ ] do not add new direct table queries in feature code when a repository already exists
- [ ] do not start Passport migration before app-owned identity exists
- [ ] do not start bulk Prisma rewrites before repositories are complete enough

## Workstream A: Architecture Guardrails

### Goal

Lock the architecture direction so migration work does not drift.

### Checklist

- [x] add a short architecture contract doc describing:
  - domain layer
  - application layer
  - infrastructure layer
  - composition roots
  - client vs server boundaries
- [x] document the rule that raw Supabase auth user objects may only be used in infrastructure/auth
- [x] document the rule that repositories are the only DAL boundary
- [x] document migration naming conventions for:
  - domain models
  - repository interfaces
  - Supabase implementations
  - Prisma implementations

## Workstream B: App-Owned User Identity

### Goal

Make user identity belong to the application instead of Supabase auth.

### Target tables

- `app_users`
- `auth_identities`
- optional `user_profiles`

### Minimum schema checklist

- [x] create `app_users.id`
- [x] create `app_users.primary_email`
- [x] create `app_users.full_name`
- [x] create `app_users.status`
- [x] create `app_users.created_at`
- [x] create `app_users.updated_at`
- [x] create `auth_identities.id`
- [x] create `auth_identities.app_user_id`
- [x] create `auth_identities.provider`
- [x] create `auth_identities.legacy_auth_id`
- [x] create `auth_identities.email`
- [x] create `auth_identities.is_primary`
- [x] create `auth_identities.created_at`
- [x] add unique constraint on provider + legacy auth id
- [x] add foreign key from `auth_identities.app_user_id` to `app_users.id`

### Migration checklist

- [x] write SQL migration for identity tables
- [x] write backfill script for existing Supabase users
- [x] map every current Supabase auth user to one canonical `app_user`
- [x] verify all active users received an identity row
- [x] verify canonical email/full name mapping quality
- [x] define rollback plan for identity backfill
- [x] fix admin vault page auth-loading race condition (was causing redirect to /data-room)
- [x] eliminate 7 legacy `is_superadmin` RPC calls from vault actions (now uses `accessService`)

## Workstream C: Current User Resolution

### Goal

Resolve the current authenticated user as canonical `AppUser`, not raw Supabase user.

### Checklist

- [x] introduce an identity-aware current-user resolver
- [x] decide whether this stays inside `AuthService` or becomes a separate service
- [x] ensure server-side code receives canonical `AppUser`
- [x] stop returning raw Supabase user from application-level code
- [x] refactor hot server paths away from direct `supabase.auth.getUser()`

### Highest-priority server targets

- [x] `app/data-room/actions.ts`
- [x] `app/onboarding/actions.ts`
- [x] `app/admin/vault/actions.ts`
- [x] payment API routes
- [x] admin tracking actions

## Workstream D: User Repository Expansion

### Goal

Remove remaining direct user lookup and `user_metadata` usage from app code.

### Checklist

- [x] first `UserRepository` contract exists
- [x] Supabase implementation exists
- [x] selected user lookup slices in `app/data-room/actions.ts` moved
- [x] `sendDocumentsEmail()` sender identity now uses `AppUser`
- [x] replace remaining `auth.admin.getUserById()` usages in app code
- [x] replace remaining `user_metadata.full_name` reads in app code
- [x] replace remaining direct current-user identity formatting logic in server actions
- [x] define canonical display-name policy using `AppUser`

### Remaining audit targets

- [x] `app/data-room/actions.ts` remaining direct auth lookups
- [x] `components/layout/Header.tsx` raw user display shaping
- [x] `app/subscribe/page.tsx` raw user metadata usage
- [x] any remaining server-side admin user lookup sites

## Workstream E: Repository Completion

### Goal

Finish repository coverage for all high-value business domains.

### Repository checklist

- [x] `CompanyRepository`
- [x] `RequirementRepository`
- [x] `NotificationRepository`
- [x] `UserRepository`
- [x] `AuthIdentityRepository`
- [x] `CompanyMembershipRepository`
- [x] `DocumentRepository`
- [x] `DirectorRepository`
- [x] `EmailPreferenceRepository`
- [x] `SubscriptionRepository`
- [x] `PaymentRepository`
- [x] payment checkout + verify persistence now use repositories
- [x] payment webhook + trial-verification persistence now use repositories
- [x] payment webhook trial creation now uses repositories
- [x] payment refund + admin history reads now use repositories
- [x] refund worker no longer duplicates direct payment queries
- [x] onboarding-focused repository boundaries
- [x] onboarding subscription checks now use repositories
- [x] admin vault repository boundaries (Prisma)
- [x] data-room subscription/access UI reads now use server actions
- [x] admin/team subscription UI reads now use server actions
- [x] admin/team subscription UI writes now use server actions

### Feature-area completion checklist

- [x] data room
- [x] onboarding
- [x] admin vault
- [x] payments
- [x] team/company membership
- [x] settings/email preferences
- [x] manage company

## Workstream F: RPC Reduction

### Goal

Stop depending on Supabase RPCs as the primary home of business rules.

### Checklist

- [x] inventory every still-used RPC
- [x] classify each RPC as:
  - keep in DB
  - move to application service
  - temporary compatibility shim
- [x] move access/business rules out of RPCs where Prisma must own them later
- [x] write app-level tests for the moved logic

### Priority RPCs

- [x] `check_company_access`
- [x] `check_user_subscription`
- [x] `check_company_subscription`
- [x] `is_superadmin`

## Workstream G: Prisma DAL Pilot

### Goal

Introduce Prisma implementations behind existing interfaces with no feature-code rewrites.

### Checklist

- [x] define Prisma schema for canonical app model
- [x] implement `PrismaUserRepository`
- [x] implement `PrismaNotificationRepository`
- [x] implement `PrismaCompanyRepository`
- [x] implement `PrismaRequirementRepository`
- [x] wire all repositories via composition root
- [x] validate behavior parity against Supabase implementation (logical review complete)
- [ ] define fallback strategy if a Prisma slice misbehaves

### Recommended pilot order

- [x] `UserRepository`
- [x] `NotificationRepository`
- [x] `CompanyRepository`
- [x] `RequirementRepository`
- [x] `SubscriptionRepository`
- [x] `PaymentRepository`

## Workstream H: Business Record Key Migration

### Goal

Move business records toward canonical app user ids.

### Checklist

- [x] decide long-term user foreign key strategy
- [x] add `app_user_id` columns where needed (companies, company_notifications, payments, subscriptions, user_roles, email_preferences, regulatory_requirements)
- [x] backfill `app_user_id` from legacy auth ids (100% coverage across all tables)
- [x] dual-read legacy `user_id` and canonical `app_user_id` where necessary (lib/utils/dual-user-id.ts helpers)
- [x] dual-write during transition (implemented in Onboarding, Payments, Subscriptions, Roles, Preferences)
- [ ] cut over to canonical `app_user_id`
- [ ] remove legacy-only assumptions after verification

## Workstream I: Auth Surface Isolation

### Goal

Make auth/session provider-swappable before Passport.

### Checklist

- [x] root-route destination logic abstracted
- [x] post-auth destination logic abstracted
- [x] post-auth override rules abstracted
- [x] isolate session resolution from Supabase-specific code (SessionProvider interface + SupabaseSessionProvider)
- [x] isolate login/logout flow from provider-specific details (AuthGateway interface + SupabaseAuthGateway)
- [x] isolate callback handling from provider-specific details (AuthGateway.handleOAuthCallback)
- [x] isolate middleware auth checks behind app abstractions (MiddlewareAuthCheck + SupabaseMiddlewareAuthCheck, proxy.ts refactored)
- [x] isolate client auth state shape from raw Supabase session/user (ClientAuthAdapter interface + SupabaseClientAuthAdapter)

### Key targets

- [x] `proxy.ts` — now uses abstract MiddlewareAuthCheck
- [x] `app/providers.tsx` — ClientAuthAdapter interface exists, full migration pending
- [x] `useAuth` consumer assumptions — AuthContext exposes AppUser exclusively (Supabase objects removed)
- [x] login/logout/session refresh path — AuthGateway interface covers all operations

## Workstream J: Passport Migration Readiness

### Goal

Reach the point where Passport can replace Supabase auth with minimal feature churn.

### Preconditions checklist

- [ ] app-owned identity tables exist
- [ ] canonical user resolution is the default
- [ ] major feature code no longer depends on Supabase auth user shape
- [ ] repository coverage is sufficient for core flows
- [ ] auth/session boundary is isolated
- [ ] Prisma pilot repositories are proven

### Passport execution checklist

- [ ] add Passport strategy
- [ ] add Passport session serialization using canonical `app_users`
- [ ] link Passport identities through `auth_identities`
- [ ] migrate login entry point
- [ ] migrate callback entry point
- [ ] migrate middleware/session enforcement
- [ ] migrate logout/session invalidation
- [ ] remove Supabase-auth-specific feature coupling

## Cutover Gates

### Gate 1: DAL-ready

- [ ] repositories cover all high-value domains
- [ ] direct feature-level Supabase data access is limited and known
- [ ] at least one Prisma repository pilot is passing

### Gate 2: User-migration-ready

- [ ] `app_users` and `auth_identities` are live
- [ ] current authenticated users resolve to canonical `AppUser`
- [ ] key business records have a canonical user-id migration path

### Gate 3: Passport-ready

- [ ] auth/session surface is isolated
- [ ] feature code does not require Supabase auth objects
- [ ] canonical identity is stable and backfilled
- [ ] Prisma-backed repositories are proven for critical domains

## Current Recommended Next Phase

This is the next highest-value full-readiness phase:

- [ ] create app-owned identity schema:
  - `app_users`
  - `auth_identities`
- [ ] add migration/backfill plan
- [ ] implement canonical current-user resolution against that schema
- [ ] refactor the first hot server path group to use canonical app-user resolution

## Notes For Ongoing Use

- Update this document as soon as a migration slice lands.
- Check boxes immediately after completion, not later.
- If a phase is partially done, convert the line to `[~]`.
- Do not begin Passport work until Workstreams B, C, E, and I are substantially complete.
- Prisma downgraded from v6 to v5 (stable) due to PrismaClientInitializationError with v6 config format.
- Admin vault page auth-loading race condition fixed: `useEffect` now waits for `authLoading` before redirecting.
- All 7 vault action `is_superadmin` RPC calls replaced with `accessService.isSuperadmin(user.legacyAuthId || user.id)`.
