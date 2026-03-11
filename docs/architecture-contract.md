# Architecture Contract: Auth Isolation & Data Access

This document defines the architectural patterns and constraints for the ongoing refactoring of Finnovate Tracker's authentication and data access layers.

## 1. Core Principles

### Authentication Abstraction
- **Rule**: No feature code should import from `@supabase/ssr` or `@supabase/supabase-js`.
- **Implementation**: All auth logic must go through `AuthService` (Server) or `ClientAuthAdapter` (Client).
- **Identifier**: Always prefer `appUser.canonicalId` over `user.id` when working with new models. For legacy models, use both until cutover.

### Data Access (Repository Pattern)
- **Rule**: Feature actions and components must use Repositories via the `createServerContainer`.
- **Implementation**: Repositories must define an interface in `application/interfaces/` and have at least a Supabase implementation in `infrastructure/persistence/supabase/`.
- **Prisma Path**: New or refactored repositories should target `PrismaRepository` implementation to prepare for the Postgres-as-a-Main-DB strategy.

### Business Record Key Migration (Dual-Write)
- **Status**: We are in a "Dual-Write, Dual-Read" phase.
- **Constraint**: Every `INSERT` or `UPDATE` affecting user ownership must write both `user_id` (Legacy UUID) and `app_user_id` (Canonical PK).
- **Audit Fields**: Use `app_updated_by` and `app_filed_by` alongside legacy equivalents.

## 2. Directory Structure

| Layer | Directory | Responsibility |
|-------|-----------|----------------|
| **Domain** | `domain/models/` | Clean POJO/Interfaces for business entities. |
| **Application** | `application/interfaces/` | Repository and Service contracts (O-S interface). |
| **Infrastructure** | `infrastructure/persistence/` | Concrete implementations (Supabase, Prisma). |
| **Infrastructure** | `infrastructure/auth/` | Auth adapters and providers. |
| **Composition** | `lib/composition/` | Dependency injection and container setup. |

## 3. Implementation Workflow for New Features

1. Define the entity in `domain/models/`.
2. Define its repository interface in `application/interfaces/`.
3. Implement `Prisma[Entity]Repository` in `infrastructure/persistence/prisma/`.
4. Register the repository in `server-container.ts`.
5. Consume via `createServerContainer().[entity]Repository` in Server Actions.

## 4. Current Pilots & Cutover Tracker

- [x] **NotificationRepository**: Prisma (ACTIVE)
- [x] **CompanyRepository**: Prisma (Wired, Partial DB Sync)
- [x] **RequirementRepository**: Prisma (Wired, Dual-Write Active)
- [ ] **Onboarding**: Repositories Wired (ACTIVE)
- [ ] **Payments**: Pending Repository Refactor
- [ ] **Audit Trail**: Pending Canonical ID Cutover

---
*Maintained by Antigravity AI.*
