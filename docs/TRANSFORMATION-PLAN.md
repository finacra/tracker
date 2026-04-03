# Finacra Transformation Plan

**Inspired by:** Claude Code source code analysis (Anthropic's production CLI — 512K+ lines, 1916 files)
**Goal:** Transform Finacra from a working MVP into a production-grade, resilient, extensible compliance platform.
**Principle:** Ship incrementally. Every phase is independently valuable. No big-bang rewrites.

---

## Current State

- 333 TypeScript files, 16 Prisma models, 28 API routes, 105 components, 17 hooks
- Clean DDD architecture (domain → application → infrastructure → composition → feature)
- CLAUDE.md with 13 rules, ARCHITECTURE_CONTRACT.md with 5 layers
- Zero tests, zero feature flags, no staging environment, no rate limiting
- All development happens directly on production
- Auth has 10+ security gaps (no rate limiting, predictable OAuth state, race conditions)
- Error handling is `catch (error: any)` + `console.error` everywhere
- No retry logic on external API calls (Razorpay, OpenAI, CIN/DIN verification)
- No background jobs (deadlines only checked when user opens tracker)

---

## Phase 0: Stop Breaking Production (Week 1)

**Why first:** Everything else is pointless if you keep shipping broken code to prod.

### 0.1 — Git Branching Strategy

```bash
git checkout -b develop
git push -u origin develop
```

- `main` = production (auto-deploys to Vercel)
- `develop` = staging (Vercel preview)
- `feature/*` = work in progress (Vercel preview per branch)
- **Rule:** Never push directly to `main`. Always go through `develop` first.

### 0.2 — Vercel Environment Separation

In Vercel Dashboard → Settings → Environment Variables, set per environment:

| Variable | Production | Preview | Development |
|----------|-----------|---------|-------------|
| `DATABASE_URL` | prod DB | staging DB | local DB |
| `RAZORPAY_KEY_ID` | live key | **test key** | **test key** |
| `RAZORPAY_KEY_SECRET` | live secret | **test secret** | **test secret** |
| `NEXT_PUBLIC_SITE_URL` | `https://finacra.com` | auto (Vercel) | `http://localhost:3000` |
| `SESSION_SECRET` | prod secret | different secret | dev secret |
| `OPENAI_API_KEY` | prod key | same or dev key | dev key |

### 0.3 — Create Staging Database

Create a second Supabase project (free tier) for staging. Run `prisma db push` against it.

### 0.4 — Feature Flag System

Create `lib/feature-flags.ts`:

```typescript
type FeatureFlag =
  | 'SEBI_COMPLIANCE'
  | 'CIA_V2'
  | 'MULTI_COUNTRY'
  | 'REAL_TIME_NOTIFICATIONS'
  | 'ADVANCED_REPORTS'
  | 'BULK_UPLOAD_V2'

const FLAGS: Record<FeatureFlag, {
  description: string
  enabledIn: ('development' | 'preview' | 'production')[]
}> = {
  // Define all flags here
}

function getCurrentEnvironment(): 'development' | 'preview' | 'production' {
  if (process.env.NODE_ENV === 'development') return 'development'
  if (process.env.VERCEL_ENV === 'preview') return 'preview'
  return 'production'
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const envOverride = process.env[`FEATURE_${flag}`]
  if (envOverride === 'true') return true
  if (envOverride === 'false') return false
  const config = FLAGS[flag]
  if (!config) return false
  return config.enabledIn.includes(getCurrentEnvironment())
}
```

**Usage:**
```typescript
{isFeatureEnabled('SEBI_COMPLIANCE') && <SEBITab />}
```

### 0.5 — Environment Validation

Create `lib/config/validate-env.ts` with Zod schema for all required env vars. Call at startup. App crashes immediately with clear message if config is wrong instead of failing at runtime.

**Deliverables:**
- [ ] `develop` branch created and set as default for PRs
- [ ] Vercel env vars configured per environment
- [ ] Staging Supabase project created
- [ ] `lib/feature-flags.ts` created
- [ ] `lib/config/validate-env.ts` created
- [ ] Razorpay TEST keys in preview/dev environments
- [ ] Team briefed: "never push to main directly"

---

## Phase 1: Error Handling & Validation Foundation (Week 2-3)

**Why:** Every phase after this depends on having structured errors and validated inputs. This is the foundation Claude Code builds everything on.

### 1.1 — Structured Error Hierarchy

Create `lib/errors/index.ts`:

```typescript
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true // vs programmer error
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class ValidationError extends AppError {
  constructor(public field: string, message: string) {
    super(`VALIDATION_${field.toUpperCase()}`, message, 400)
  }
}

export class AuthError extends AppError {
  constructor(message: string = 'Authentication required') {
    super('AUTH_ERROR', message, 401)
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied') {
    super('FORBIDDEN', message, 403)
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super('NOT_FOUND', `${resource}${id ? ` (${id})` : ''} not found`, 404)
  }
}

export class PaymentError extends AppError {
  constructor(message: string, public razorpayCode?: string) {
    super('PAYMENT_ERROR', message, 402)
  }
}

export class ExternalAPIError extends AppError {
  constructor(service: string, message: string, public originalError?: unknown) {
    super(`EXTERNAL_${service.toUpperCase()}`, message, 502)
  }
}

export class RateLimitError extends AppError {
  constructor(public retryAfterMs?: number) {
    super('RATE_LIMIT', 'Too many requests', 429)
  }
}
```

### 1.2 — Centralized Error Handler

Create `lib/errors/handle-error.ts`:

```typescript
// For server actions — returns { success, error } instead of throwing
export function handleActionError(error: unknown): { success: false; error: string } {
  if (error instanceof ValidationError) {
    return { success: false, error: error.message }
  }
  if (error instanceof AuthError) {
    return { success: false, error: 'Please sign in again' }
  }
  if (error instanceof AppError && error.isOperational) {
    return { success: false, error: error.message }
  }
  // Never leak internal errors
  console.error('[UnhandledError]', safeErrorMessage(error))
  return { success: false, error: 'Something went wrong. Please try again.' }
}

// For API routes — returns NextResponse
export function handleAPIError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode })
  }
  console.error('[UnhandledAPIError]', safeErrorMessage(error))
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

// Strip tokens, hashes, connection strings from error messages
function safeErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  return msg
    .replace(/eyJ[A-Za-z0-9_-]+/g, '[JWT_REDACTED]')
    .replace(/\$2[aby]\$.+/g, '[HASH_REDACTED]')
    .replace(/postgresql:\/\/[^\s]+/g, '[DB_URL_REDACTED]')
}
```

### 1.3 — Zod Validation Schemas

Create `lib/validation/schemas.ts`:

```typescript
import { z } from 'zod'

export const onboardingSchema = z.object({
  companyName: z.string().min(1).max(255),
  cinNumber: z.string().regex(/^[A-Z]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/, 'Invalid CIN format'),
  companyType: z.enum(['Private Limited', 'LLP', 'Public Limited', 'OPC', 'Partnership']),
  industries: z.array(z.string()).min(1, 'Select at least one industry'),
  employeeCount: z.coerce.number().int().positive().optional(),
  annualTurnover: z.coerce.number().positive().optional(),
  panNumber: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/).optional().or(z.literal('')),
  gstNumber: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z]\dZ[A-Z\d]$/).optional().or(z.literal('')),
  // ... all fields with proper validation
})

export const requirementSchema = z.object({
  companyId: z.string().uuid(),
  category: z.string().min(1),
  requirement: z.string().min(1).max(500),
  dueDate: z.coerce.date().optional(),
  status: z.enum(['not_started', 'upcoming', 'pending', 'overdue', 'completed']),
})

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  fullName: z.string().min(1).max(100),
})

export const paymentSchema = z.object({
  amount: z.number().positive(),
  currency: z.enum(['INR', 'USD', 'AED']),
  tier: z.enum(['Starter', 'Professional', 'Enterprise']),
  billingCycle: z.enum(['Monthly', 'Quarterly', 'Half-yearly', 'Annual']),
})

// Usage in server actions:
// const data = onboardingSchema.parse(rawInput) // throws ZodError with per-field details
```

### 1.4 — Migrate All Server Actions & API Routes

Systematically replace every `catch (error: any)` with the new error handling:

**Before:**
```typescript
} catch (error: any) {
  console.error('Error in getUserRole:', error)
  return { success: false, role: null, error: error.message }
}
```

**After:**
```typescript
} catch (error) {
  return handleActionError(error)
}
```

**Deliverables:**
- [ ] `lib/errors/index.ts` — error class hierarchy
- [ ] `lib/errors/handle-error.ts` — centralized handlers
- [ ] `lib/validation/schemas.ts` — Zod schemas for all inputs
- [ ] All 28 API routes migrated to `handleAPIError()`
- [ ] All server actions migrated to `handleActionError()`
- [ ] Zero `error: any` remaining in codebase

---

## Phase 2: Auth Security Hardening (Week 3-4)

**Why:** 10+ security vulnerabilities identified. Rate limiting alone prevents brute force attacks on your compliance platform.

### 2.1 — Rate Limiting

Create `lib/auth/rate-limit.ts`:

- In-memory rate limiter for development
- Vercel KV / Upstash Redis rate limiter for production
- Limits: 5 login attempts per 15 min per IP, 3 registrations per hour per IP, 3 password resets per hour per email

Apply to: `/api/auth/passport/login`, `/api/auth/passport/register`, `/api/auth/passport/forgot-password`, `/api/auth/verify-email`

### 2.2 — Fix OAuth CSRF

Replace predictable state parameter in `app/api/auth/passport/google/route.ts`:

```typescript
// Before: deterministic base64 (predictable)
const state = Buffer.from(JSON.stringify({ redirectTo })).toString('base64url')

// After: cryptographically random + CSRF cookie
import { randomBytes } from 'crypto'
const csrf = randomBytes(32).toString('hex')
const state = Buffer.from(JSON.stringify({ redirectTo, csrf })).toString('base64url')
// Store csrf in httpOnly cookie, validate in callback
```

### 2.3 — Fix Race Conditions in Registration

Replace check-then-act with atomic upsert:

```typescript
// Use Prisma upsert or unique constraint + error handling
const user = await prisma.appUser.upsert({
  where: { primary_email: email },
  create: { primary_email: email, password_hash: hash, full_name: name },
  update: {},
})
```

### 2.4 — Session Invalidation on Password Change

Add `token_version` column to `app_users`. Include in JWT. Verify on every session check. Increment on password change.

### 2.5 — Stronger Password Policy

Replace 6-char minimum with entropy-based validation using `zxcvbn`:

```typescript
import zxcvbn from 'zxcvbn'
const result = zxcvbn(password)
if (result.score < 3) {
  throw new ValidationError('password', `Password too weak: ${result.feedback.suggestions[0]}`)
}
```

### 2.6 — Fix Account Enumeration

Return identical responses for "email exists" and "email doesn't exist" in registration and forgot-password.

### 2.7 — Auth Audit Log

Add `auth_audit_log` Prisma model:

```prisma
model AuthAuditLog {
  id        String   @id @default(uuid())
  userId    String?
  email     String
  event     String   // login_success, login_failed, password_reset, etc.
  ip        String?
  userAgent String?
  metadata  Json?
  createdAt DateTime @default(now())
}
```

Log every auth event. Enables forensics and anomaly detection.

**Deliverables:**
- [ ] Rate limiting on all auth endpoints
- [ ] Cryptographically random OAuth state parameter
- [ ] Atomic user creation (no race conditions)
- [ ] `token_version` for session invalidation
- [ ] `zxcvbn` password validation
- [ ] Generic responses preventing account enumeration
- [ ] `AuthAuditLog` model and logging

---

## Phase 3: Resilience & Retry Patterns (Week 4-5)

**Why:** External APIs fail. Without retry, a single network blip loses a payment or blocks onboarding.

### 3.1 — Generic Retry Utility

Create `lib/utils/with-retry.ts`:

```typescript
interface RetryOptions {
  maxRetries?: number      // default: 3
  baseDelayMs?: number     // default: 500
  maxDelayMs?: number      // default: 10000
  retryOn?: (error: unknown) => boolean  // which errors to retry
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 500, maxDelayMs = 10000 } = options
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries) throw error
      if (options.retryOn && !options.retryOn(error)) throw error
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
      const jitter = Math.random() * 0.25 * delay
      await new Promise(r => setTimeout(r, delay + jitter))
    }
  }
  throw new Error('unreachable')
}
```

### 3.2 — Apply Retry to All External APIs

Wrap with retry:
- Razorpay order creation & payment verification
- CIN/DIN verification API calls
- OpenAI / Perplexity / Tavily API calls
- Resend email delivery
- Google OAuth token exchange

```typescript
// Before:
const response = await fetch('https://api.razorpay.com/...')

// After:
const response = await withRetry(
  () => fetch('https://api.razorpay.com/...'),
  { maxRetries: 3, retryOn: (e) => isTransientError(e) }
)
```

### 3.3 — Circuit Breaker for Non-Critical Services

If OpenAI is down, the compliance tracker should still work. Only CIA chat should be affected.

```typescript
// lib/utils/circuit-breaker.ts
class CircuitBreaker {
  private failures = 0
  private lastFailure = 0
  private state: 'closed' | 'open' | 'half-open' = 'closed'

  async call<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeoutMs) {
        this.state = 'half-open'
      } else {
        return fallback
      }
    }
    try {
      const result = await fn()
      this.reset()
      return result
    } catch (error) {
      this.recordFailure()
      return fallback
    }
  }
}
```

**Deliverables:**
- [ ] `lib/utils/with-retry.ts` — generic retry with exponential backoff
- [ ] All external API calls wrapped with retry
- [ ] Circuit breaker for OpenAI/Perplexity (non-critical AI services)

---

## Phase 4: Background Tasks & Proactive Compliance (Week 5-6)

**Why:** A compliance platform that only checks deadlines when users look at it is fundamentally broken. This is your highest-value feature gap.

### 4.1 — Vercel Cron for Deadline Monitoring

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron/deadline-check", "schedule": "0 6 * * *" },
    { "path": "/api/cron/overdue-update", "schedule": "0 0 * * *" },
    { "path": "/api/cron/digest-email", "schedule": "0 8 * * 1" }
  ]
}
```

### 4.2 — Deadline Check Job

Create `app/api/cron/deadline-check/route.ts`:

- Runs daily at 6 AM
- Fetches all active companies with non-completed requirements
- For each requirement with a due date: calculate days remaining
- Create notifications at 30, 14, 7, 3, 1 days before deadline
- Auto-mark requirements as `overdue` when past due
- Send email alerts based on user's `EmailPreference` settings
- Protected by `CRON_SECRET` env var (Vercel injects this automatically)

### 4.3 — Weekly Digest Email

Create `app/api/cron/digest-email/route.ts`:

- Runs weekly (Monday 8 AM)
- Per user: compile upcoming deadlines, overdue items, recent status changes
- Respect `EmailPreference.digest_frequency` setting
- Send via Resend

### 4.4 — Compliance Report Generation

Create `app/api/cron/monthly-report/route.ts`:

- Runs monthly
- Generate compliance score per company
- Track month-over-month trends
- Store in new `ComplianceSnapshot` Prisma model

**Deliverables:**
- [ ] `vercel.json` cron configuration
- [ ] Daily deadline checker with auto-overdue marking
- [ ] Notification creation for approaching deadlines (30/14/7/3/1 days)
- [ ] Weekly digest email
- [ ] Monthly compliance snapshot generation
- [ ] `CRON_SECRET` protection on all cron endpoints

---

## Phase 5: Testing Foundation (Week 6-7)

**Why:** You have zero tests. Every future change is a gamble. Start with the highest-value targets.

### 5.1 — Setup Vitest

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './') },
  },
})
```

### 5.2 — Priority Test Targets (Highest ROI First)

**Tier 1 — Validation schemas** (prevents garbage in database):
```
tests/lib/validation/schemas.test.ts
- onboardingSchema: valid CIN, invalid CIN, missing required fields, coercion
- paymentSchema: valid amounts, negative amounts, invalid currencies
- registerSchema: short passwords, invalid emails
```

**Tier 2 — Business logic** (prevents compliance errors):
```
tests/lib/compliance/deadline-engine.test.ts
- Deadline calculations for different regulatory categories
- Financial year boundary handling
- Overdue detection logic

tests/lib/pricing/pricing.test.ts
- Price calculations per tier and billing cycle
- Trial period calculations
- Currency conversion
```

**Tier 3 — Auth flows** (prevents security regressions):
```
tests/lib/auth/rate-limit.test.ts
- Rate limiter blocks after N attempts
- Rate limiter resets after window
- Different IPs tracked independently
```

**Tier 4 — Server action return shapes** (prevents client-side crashes):
```
tests/app/data-room/actions.test.ts
- getUserRole returns { success, role } shape
- getCompanyAccessState returns correct snapshot shape
- Error cases return { success: false, error: string }
```

### 5.3 — Add Test Script

```json
// package.json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Deliverables:**
- [ ] Vitest configured with path aliases
- [ ] 20+ tests for validation schemas
- [ ] 10+ tests for deadline/compliance logic
- [ ] 5+ tests for rate limiting
- [ ] `npm test` runs in CI before deploy

---

## Phase 6: Type Safety & Code Quality (Week 7-8)

### 6.1 — Branded Types for IDs

Create `domain/types/ids.ts`:

```typescript
export type CompanyId = string & { __brand: 'CompanyId' }
export type UserId = string & { __brand: 'UserId' }
export type RequirementId = string & { __brand: 'RequirementId' }
export type PaymentId = string & { __brand: 'PaymentId' }
export type SubscriptionId = string & { __brand: 'SubscriptionId' }

export const asCompanyId = (id: string): CompanyId => id as CompanyId
export const asUserId = (id: string): UserId => id as UserId
// ... etc
```

Migrate gradually: start with repository interfaces, then server actions, then hooks.

### 6.2 — Discriminated Union for Action Results

Replace `{ success: boolean; error?: string; data?: any }` with:

```typescript
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string }
```

This forces callers to check `success` before accessing `data` — TypeScript narrows the type automatically.

### 6.3 — Split TrackerContext into Zustand

TrackerContext has 40+ fields mixing UI state with data. Extract filter/modal state to Zustand:

```typescript
// lib/store/trackerStore.ts
export const useTrackerStore = create<TrackerState>()((set) => ({
  view: 'list' as 'list' | 'calendar',
  selectedFY: getCurrentFY(),
  selectedMonth: null,
  searchQuery: '',
  categoryFilter: null,
  statusFilter: null,
  setView: (v) => set({ view: v }),
  setFilter: (key, value) => set((s) => ({ ...s, [key]: value })),
  resetFilters: () => set({ categoryFilter: null, statusFilter: null, searchQuery: '' }),
}))

// Granular selectors — component only re-renders when its slice changes
export const useTrackerView = () => useTrackerStore(s => s.view)
export const useTrackerFilters = () => useTrackerStore(s => s.filters)
```

Keep TrackerContext for data (requirements, derived lists). Move UI state to Zustand.

### 6.4 — Safe Logging Utility

Create `lib/utils/safe-log.ts` — strips JWTs, password hashes, database URLs, API keys from all log output. Replace all `console.error` calls with `safeLog.error()`.

**Deliverables:**
- [ ] `domain/types/ids.ts` — branded types
- [ ] `ActionResult<T>` discriminated union
- [ ] TrackerContext split: data stays in context, UI state moves to Zustand
- [ ] `lib/utils/safe-log.ts` replaces raw `console.error`

---

## Phase 7: Compliance Module Registry (Week 8-10)

**Why:** You want to expand to 7+ countries. Hardcoded compliance rules don't scale. This is the Claude Code plugin architecture adapted for compliance.

### 7.1 — Module Interface

```typescript
// lib/compliance/registry.ts
export interface ComplianceModule {
  id: string                    // 'companies-act-2013', 'gst-india', 'sebi'
  name: string                  // 'Companies Act 2013'
  jurisdiction: string          // 'IN', 'AE', 'SA'
  version: string               // '1.0.0'
  applicableTo: (company: Company) => boolean
  rules: ComplianceRule[]
  deadlineCalculator: (rule: ComplianceRule, company: Company) => Date | null
  categories: string[]          // ['Annual Filing', 'Board Meetings', 'Statutory Audit']
  tabs?: ComplianceTab[]        // Optional custom tabs for data-room
}

export interface ComplianceRule {
  id: string
  name: string
  category: string
  description: string
  frequency: 'one-time' | 'monthly' | 'quarterly' | 'half-yearly' | 'annual' | 'event-based'
  criticality: 'low' | 'medium' | 'high' | 'critical'
  penaltyInfo?: string
  applicableTo?: (company: Company) => boolean
}
```

### 7.2 — Registry

```typescript
class ComplianceRegistry {
  private modules = new Map<string, ComplianceModule>()

  register(mod: ComplianceModule) { this.modules.set(mod.id, mod) }

  getForCompany(company: Company): ComplianceModule[] {
    return [...this.modules.values()].filter(m => m.applicableTo(company))
  }

  getForJurisdiction(code: string): ComplianceModule[] {
    return [...this.modules.values()].filter(m => m.jurisdiction === code)
  }

  getAllCategories(company: Company): string[] {
    return this.getForCompany(company).flatMap(m => m.categories)
  }
}

export const complianceRegistry = new ComplianceRegistry()
```

### 7.3 — Module Implementations

```
lib/compliance/modules/
├── india/
│   ├── companies-act.ts        // Companies Act 2013 rules
│   ├── gst.ts                  // GST compliance
│   ├── income-tax.ts           // Income Tax Act
│   ├── sebi.ts                 // SEBI (behind feature flag)
│   └── index.ts                // registerAll()
├── uae/
│   ├── commercial-companies.ts // UAE Commercial Companies Law
│   ├── vat.ts                  // UAE VAT
│   └── index.ts
└── registry.ts                 // Global registry + initialization
```

### 7.4 — Database Schema Updates

```prisma
model Company {
  // ... existing fields
  country_code  String  @default("IN")
}

model RegulatoryRequirement {
  // ... existing fields
  module_id     String?   // Which compliance module generated this
  jurisdiction  String    @default("IN")
}

model DocumentTemplate {
  // ... existing fields
  country_code  String    @default("IN")
}
```

### 7.5 — Dynamic Tab Registration

Compliance modules can register custom tabs in the data-room:

```typescript
// In data-room page
const modules = complianceRegistry.getForCompany(currentCompany)
const customTabs = modules.flatMap(m => m.tabs ?? [])

return (
  <Tabs>
    <Tab id="overview">Overview</Tab>
    <Tab id="tracker">Tracker</Tab>
    {customTabs.map(tab => (
      <Tab key={tab.id} id={tab.id}>{tab.label}</Tab>
    ))}
  </Tabs>
)
```

**Deliverables:**
- [ ] `ComplianceModule` interface and `ComplianceRegistry`
- [ ] India modules: Companies Act, GST, Income Tax
- [ ] Database schema: `country_code` on Company, Requirement, DocumentTemplate
- [ ] Dynamic tab registration from modules
- [ ] Expansion-ready: adding a country = adding a folder in `lib/compliance/modules/`

---

## Phase 8: Performance & Monitoring (Week 10-11)

### 8.1 — Vercel Speed Insights + Web Vitals

Already have Vercel Analytics. Add targeted performance tracking for critical paths:

- Sign-in → data room load time
- Company switch time
- Tab switching time
- Requirement creation time

### 8.2 — React Query Optimization

- Stale time for compliance data: 15 minutes (deadlines don't change often)
- Background refetch interval: 1 hour for deadlines
- Prefetch adjacent tabs on hover (reduce perceived latency)

### 8.3 — Code Splitting for Data Room Tabs

```typescript
const TrackerTab = lazy(() => import('./tabs/TrackerTab'))
const DocumentsTab = lazy(() => import('./tabs/DocumentsTab'))
const CIATab = lazy(() => import('./tabs/CIATab'))
const GSTTab = lazy(() => import('./tabs/GSTTab'))
```

Each tab loads only when selected. First tab (Overview) stays eager.

### 8.4 — Performance Budget

Add to CLAUDE.md:

```
## Performance Budget
- Data room initial load: < 2 seconds
- Company switch: < 1 second
- Tab switch: < 500ms (if data cached)
- Requirement creation: < 1 second
```

**Deliverables:**
- [ ] Critical path performance tracking
- [ ] React Query cache tuning for compliance data
- [ ] Lazy loading for all data room tabs except Overview
- [ ] Performance budget documented in CLAUDE.md

---

## Phase 9: CI/CD Pipeline (Week 11-12)

### 9.1 — GitHub Actions Workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
    branches: [develop, main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm test
```

### 9.2 — Protected Branches

- `main`: requires PR, requires CI pass, requires 1 approval
- `develop`: requires PR, requires CI pass

### 9.3 — Automated Checks

- TypeScript: `tsc --noEmit` (zero type errors)
- Lint: `next lint` (zero warnings)
- Tests: `vitest run` (all pass)
- Env validation: startup check in test environment

**Deliverables:**
- [ ] GitHub Actions CI workflow
- [ ] Branch protection on `main` and `develop`
- [ ] PR template with checklist
- [ ] All checks must pass before merge

---

## Phase 10: Advanced Features (Week 12+)

These are future enhancements, prioritized by user value:

### 10.1 — Real-Time Notifications (WebSocket/SSE)
- Push deadline alerts to open browser tabs
- Behind `REAL_TIME_NOTIFICATIONS` feature flag

### 10.2 — Compliance Score Dashboard
- Monthly compliance score per company (0-100)
- Trend charts (improving/declining)
- Benchmark against industry average

### 10.3 — Public API for Compliance Data
- REST API for third-party integrations
- API key management
- Rate limiting per key
- OpenAPI spec generation

### 10.4 — Mobile App (React Native)
- When this happens: extract backend to separate NestJS service
- Share `domain/`, `application/` layers between web and mobile
- API routes become the real API

### 10.5 — Multi-Tenancy / White-Label
- Custom branding per organization
- Subdomain-based routing
- Tenant-scoped data isolation

---

## Metrics to Track

| Metric | Current | Phase 0 Target | Phase 5 Target | Phase 9 Target |
|--------|---------|----------------|----------------|----------------|
| Production incidents/month | Unknown | Track it | < 5 | < 1 |
| Test count | 0 | 0 | 35+ | 100+ |
| `error: any` in codebase | ~30 | ~30 | 0 | 0 |
| Feature flags | 0 | 5+ | 5+ | 5+ |
| Auth security gaps | 10+ | 5 | 0 | 0 |
| External API calls with retry | 0 | 0 | All | All |
| Background jobs | 0 | 0 | 3 | 3+ |
| Avg deploy confidence | Low | Medium | High | High |
| Time to add new country | Weeks | Weeks | Days | Days |

---

## Rules to Add to CLAUDE.md

After transformation, add these rules (inspired by Claude Code):

```markdown
## Error Handling
14. Never use `catch (error: any)`. Use `handleActionError()` or `handleAPIError()`.
15. Never log raw errors. Use `safeLog.error()` which strips tokens and secrets.
16. External API calls MUST use `withRetry()`. Single-attempt fetch is a bug.

## Validation
17. All server action inputs MUST be validated with Zod schemas before processing.
18. Never use `parseInt`/`parseFloat` on user input. Use `z.coerce.number()`.

## Security
19. All auth endpoints MUST have rate limiting.
20. Never return different error messages for "user exists" vs "user doesn't exist".
21. Password changes MUST invalidate all existing sessions.

## Feature Development
22. New features MUST be behind a feature flag until explicitly shipped.
23. Never push directly to `main`. All changes go through `develop` via PR.

## Testing
24. Validation schemas, deadline calculations, and pricing logic MUST have tests.
25. All auth security fixes MUST have regression tests.
```

---

## Summary Timeline

| Week | Phase | Focus |
|------|-------|-------|
| 1 | Phase 0 | Git branching, env separation, feature flags |
| 2-3 | Phase 1 | Error hierarchy, Zod validation, migrate all catch blocks |
| 3-4 | Phase 2 | Auth security: rate limiting, CSRF, race conditions, audit log |
| 4-5 | Phase 3 | Retry utility, wrap all external API calls |
| 5-6 | Phase 4 | Vercel cron jobs, deadline checker, digest emails |
| 6-7 | Phase 5 | Vitest setup, 35+ tests for validation/compliance/auth |
| 7-8 | Phase 6 | Branded types, ActionResult union, Zustand migration |
| 8-10 | Phase 7 | Compliance module registry, country expansion prep |
| 10-11 | Phase 8 | Performance monitoring, code splitting, cache tuning |
| 11-12 | Phase 9 | GitHub Actions CI, branch protection, automated checks |
| 12+ | Phase 10 | Real-time notifications, compliance scores, public API |
