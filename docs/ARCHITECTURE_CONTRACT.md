# Architecture Contract

This document defines the layered architecture of the Finacra application and the rules that prevent architectural drift during migration.

## Layers

### 1. Domain Layer (`domain/`)

Contains pure business types and value objects. Has **zero** dependencies on infrastructure, frameworks, or libraries.

```
domain/
  models/          — AppUser, Requirement, Notification, Payment
  types/           — CompanyAccess, Role
```

**Rules:**
- Domain models are plain TypeScript interfaces.
- No imports from `@supabase/*`, `@prisma/*`, `next/*`, or any infrastructure.
- Domain models represent the canonical shape of business entities.

### 2. Application Layer (`application/`)

Contains **interfaces** (ports) that define how domain operations interact with the outside world. Also contains application services that orchestrate domain logic.

```
application/
  interfaces/      — Repository interfaces, AuthService, etc.
```

**Rules:**
- Interfaces reference **only** domain models.
- No concrete implementations live here.
- No Supabase/Prisma types in interface signatures.
- Application services may depend on multiple interfaces but never on concrete implementations.

### 3. Infrastructure Layer (`infrastructure/`)

Contains **concrete implementations** of application interfaces.

```
infrastructure/
  auth/
    supabase/      — SupabaseAuthService
  billing/
    supabase/      — SupabaseSubscriptionService
  persistence/
    supabase/      — Supabase*Repository implementations
    prisma/        — Prisma*Repository implementations
```

**Rules:**
- Each implementation satisfies exactly one application interface.
- Supabase and Prisma implementations MUST be behaviorally equivalent.
- Infrastructure code may import from `@supabase/*`, `@prisma/*`, etc.
- Infrastructure code MUST NOT be imported directly by feature code.

### 4. Composition Layer (`lib/composition/`)

The **only** place where infrastructure implementations are instantiated and wired together.

```
lib/composition/
  server-container.ts          — main server-side DI container
  server-notification-container.ts
  server-user-container.ts
```

**Rules:**
- Feature code imports from composition roots, never from infrastructure directly.
- Swapping Supabase→Prisma requires **only** changing composition wiring.
- No business logic in composition files.

### 5. Feature Layer (`app/`, `components/`, `hooks/`)

React components, Next.js pages, server actions, API routes, and hooks that implement user-facing features.

**Rules:**
- Feature code depends on **application interfaces** and **domain models**, accessed via composition.
- Feature code MUST NOT import from `infrastructure/` directly.
- Feature code MUST NOT construct repository or service instances.

## Client vs Server Boundary

| Concern | Location |
|---------|----------|
| Server-side auth resolution | `SupabaseAuthService.getCurrentUser()` |
| Client-side auth state | `AuthProvider` / `useAuth` hook |
| Server actions | `app/*/actions.ts` files |
| API routes | `app/api/*/route.ts` files |
| Composition roots | Server-only (`lib/composition/`) |

**Client code** receives `AppUser` through the `AuthProvider`/`useAuth` hook. It MUST NOT call `supabase.auth.getUser()` for application logic.

**Server code** resolves the current user via `authService.getCurrentUser()` from the composition root.

## Migration Rules

### Raw Supabase Auth User Access
- Raw `supabase.auth.getUser()` may ONLY appear in:
  - `infrastructure/auth/` implementations
  - `proxy.ts` middleware (until Workstream I completes)
  - `app/providers.tsx` (until Workstream I completes)
- All other code MUST use `authService.getCurrentUser()` or the `useAuth` hook.

### Repository-Only Data Access
- All database reads/writes MUST go through a repository interface.
- New direct Supabase `from('table_name')` calls in feature code are FORBIDDEN.
- If no repository method exists for a needed operation, extend the interface first.

### Naming Conventions

| Concept | Convention | Example |
|---------|-----------|---------|
| Domain model | PascalCase interface | `AppUser`, `Requirement` |
| Repository interface | `{Domain}Repository` | `CompanyRepository` |
| Supabase implementation | `Supabase{Domain}Repository` | `SupabaseCompanyRepository` |
| Prisma implementation | `Prisma{Domain}Repository` | `PrismaCompanyRepository` |
| Application service interface | `{Concern}Service` | `AuthService`, `AccessService` |
| Composition root | `server-{scope}-container.ts` | `server-container.ts` |

### Foreign Key Migration
- Business tables currently reference `auth.users.id` (legacy Supabase auth IDs).
- Migration path: add `app_user_id` column → backfill → dual-read → cutover → drop legacy column.
- During dual-read, prefer `app_user_id` when present, fall back to legacy `user_id`.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Feature Layer                         │
│  app/  │  components/  │  hooks/  │  server actions      │
│                                                          │
│  Depends on: domain models + application interfaces      │
│  Accessed via: composition roots                         │
└──────────────────────┬──────────────────────────────────┘
                       │ imports
┌──────────────────────▼──────────────────────────────────┐
│                 Composition Layer                         │
│  lib/composition/server-container.ts                     │
│                                                          │
│  Wires: infrastructure → application interfaces          │
└──────────────────────┬──────────────────────────────────┘
                       │ constructs
┌──────────────────────▼──────────────────────────────────┐
│               Infrastructure Layer                       │
│  infrastructure/persistence/supabase/*                   │
│  infrastructure/persistence/prisma/*                     │
│  infrastructure/auth/supabase/*                          │
│  infrastructure/billing/supabase/*                       │
│                                                          │
│  Implements: application interfaces                      │
│  Depends on: domain models, external SDKs                │
└──────────────────────┬──────────────────────────────────┘
                       │ implements
┌──────────────────────▼──────────────────────────────────┐
│               Application Layer                          │
│  application/interfaces/*                                │
│                                                          │
│  Defines: repository ports, service contracts            │
│  Depends on: domain models ONLY                          │
└──────────────────────┬──────────────────────────────────┘
                       │ references
┌──────────────────────▼──────────────────────────────────┐
│                  Domain Layer                            │
│  domain/models/*   │   domain/types/*                    │
│                                                          │
│  Zero dependencies — pure business types                 │
└─────────────────────────────────────────────────────────┘
```
