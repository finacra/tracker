# Phase 2: Comprehensive Refactoring Plan

## Overview

**Goal**: Transform the monolithic 5,315-line `app/data-room/page.tsx` into a maintainable, performant, and scalable architecture.

**Three Pillars**:
1. **Component Splitting** (5,315 lines → <200 lines per component)
2. **Redis Caching Layer** (Reduce DB load by 80%+)
3. **SSR/Streaming** (Instant initial load, progressive enhancement)

---

## 📊 Current State Analysis

### Component Metrics
- **Total Lines**: 5,315
- **State Variables**: ~50+ `useState` calls
- **Functions**: ~200+ (useEffect, useMemo, useCallback, regular functions)
- **useEffect Hooks**: ~30+
- **Props Passed to Tabs**: 50+ props per tab (violates ISP)
- **Server Actions Called**: 15+ direct calls
- **Modals**: 8+ modals mixed in JSX

### Current Architecture Issues

#### 1. **Single Responsibility Violations**
- ❌ Initialization logic mixed with UI rendering
- ❌ Data fetching mixed with business logic
- ❌ Modal state management scattered
- ❌ Company switching logic intertwined with tab rendering

#### 2. **Dependency Inversion Violations**
- ❌ Direct server action imports (15+)
- ❌ Direct Supabase client usage
- ❌ No service layer abstraction
- ❌ Hard-coded utility functions

#### 3. **Interface Segregation Violations**
- ❌ `DocumentsTab` receives 50+ props
- ❌ `TrackerTab` receives 50+ props
- ❌ Components depend on unused props

#### 4. **Performance Issues**
- ❌ No server-side caching (Redis)
- ❌ Client-side only rendering (no SSR)
- ❌ Waterfall data fetching
- ❌ No streaming/partial hydration

---

## 🎯 Phase 2 Goals

### Component Splitting
- **Target**: <200 lines per UI component, <150 lines per hook, <100 lines per service
- **Result**: 25-30 focused components instead of 1 monolith

### Redis Caching
- **Target**: 80%+ cache hit rate for read operations
- **Result**: 5-10x reduction in database queries

### SSR/Streaming
- **Target**: <500ms initial page load (vs current 4-7s)
- **Result**: Instant perceived performance, progressive enhancement

---

## 📋 Phase 2.1: Component Splitting (Incremental)

### Strategy: ONE Component at a Time, ONE Phase at a Time

Following `.cursor/rules/incremental-refactoring.mdc`, we will:
1. Extract ONE component per iteration
2. Complete ONE phase (Business Logic → Services → UI → Cleanup)
3. Stop and get user approval after each phase
4. Test thoroughly before proceeding

### Component Extraction Order (Smallest → Largest)

#### **Priority 1: Data Room Container** (Foundation)
**Current**: Lines 183-5315 in `page.tsx`
**Target**: Extract to `app/data-room/components/DataRoomContainer.tsx`

**Phases**:
1. **Phase 1.1**: Extract initialization logic to `hooks/useDataRoomInit.ts`
2. **Phase 1.2**: Extract company switching logic to `hooks/useCompanySwitching.ts`
3. **Phase 1.3**: Extract access control logic to `hooks/useDataRoomAccess.ts`
4. **Phase 1.4**: Extract modal state management to `hooks/useDataRoomModals.ts`
5. **Phase 1.5**: Extract tab state management to `hooks/useDataRoomTabs.ts`
6. **Phase 1.6**: Create `DataRoomContainer.tsx` (orchestration only, <200 lines)

**Dependencies to Extract**:
- `getDataRoomInitState` → `services/DataRoomInitService.ts`
- `getCompanyAccessState` → Already in React Query (Phase 1)
- `getRegulatoryRequirements` → Already in React Query (Phase 1)
- `getCompanyDocuments` → `services/DocumentService.ts`
- `getDirectors` → `services/CompanyService.ts`

**Props Interface** (ISP Compliant):
```typescript
interface DataRoomContainerProps {
  initialCompanyId?: string | null
}
```

**Estimated Size After Extraction**:
- `DataRoomContainer.tsx`: ~150 lines (orchestration)
- `hooks/useDataRoomInit.ts`: ~120 lines
- `hooks/useCompanySwitching.ts`: ~80 lines
- `hooks/useDataRoomAccess.ts`: ~60 lines
- `hooks/useDataRoomModals.ts`: ~100 lines
- `hooks/useDataRoomTabs.ts`: ~50 lines

---

#### **Priority 2: Document Upload Modal** (Isolated)
**Current**: Lines 917-932, 5050-5062 (state + JSX)
**Target**: Extract to `app/data-room/components/modals/DocumentUploadModal.tsx`

**Phases**:
1. **Phase 2.1**: Extract modal state to `hooks/useDocumentUpload.ts`
2. **Phase 2.2**: Extract upload logic to `services/DocumentUploadService.ts`
3. **Phase 2.3**: Create `DocumentUploadModal.tsx` (<200 lines)

**Dependencies**:
- `uploadFileToStorage` → `services/DocumentUploadService.ts`
- `handleTrackerDocumentUpload` → Move to hook

**Props Interface**:
```typescript
interface DocumentUploadModalProps {
  isOpen: boolean
  requirementId?: string
  requirement?: string
  onClose: () => void
  onSuccess: () => void
}
```

---

#### **Priority 3: Compliance Details Modal** (Isolated)
**Current**: Lines 912-914, 4600-4946 (state + JSX)
**Target**: Extract to `app/data-room/components/modals/ComplianceDetailsModal.tsx`

**Phases**:
1. **Phase 3.1**: Extract modal state to `hooks/useComplianceDetails.ts`
2. **Phase 3.2**: Create `ComplianceDetailsModal.tsx` (<200 lines)

**Props Interface**:
```typescript
interface ComplianceDetailsModalProps {
  requirement: RegulatoryRequirement | null
  isOpen: boolean
  onClose: () => void
}
```

---

#### **Priority 4: Export Modal** (Isolated)
**Current**: Lines 1032, 5200-5300 (estimated)
**Target**: Extract to `app/data-room/components/modals/ExportModal.tsx`

**Phases**:
1. **Phase 4.1**: Extract export logic to `services/ExportService.ts`
2. **Phase 4.2**: Create `ExportModal.tsx` (<200 lines)

---

#### **Priority 5: Send Documents Modal** (Isolated)
**Current**: Lines 1033, 5300-5400 (estimated)
**Target**: Extract to `app/data-room/components/modals/SendDocumentsModal.tsx`

**Phases**:
1. **Phase 5.1**: Extract email logic to `services/EmailService.ts`
2. **Phase 5.2**: Create `SendDocumentsModal.tsx` (<200 lines)

---

#### **Priority 6: Loading States** (Reusable)
**Current**: Lines 4195-4259 (multiple loading states)
**Target**: Extract to `app/data-room/components/LoadingStates.tsx`

**Phases**:
1. **Phase 6.1**: Create `LoadingStates.tsx` with variants (<150 lines)

---

#### **Priority 7: Trial Banner** (Reusable)
**Current**: Lines 4289-4320 (estimated)
**Target**: Extract to `app/data-room/components/TrialBanner.tsx`

**Phases**:
1. **Phase 7.1**: Create `TrialBanner.tsx` (<100 lines)

---

### Component Extraction Checklist (Per Component)

**Before Extraction**:
- [ ] Read entire component block (all lines)
- [ ] Identify exact boundaries (start/end lines)
- [ ] Create dependency inventory (state, functions, imports, props)
- [ ] Identify modal ownership (SRP)
- [ ] Count props (if >10, plan Context API)
- [ ] Plan extraction phases (Business Logic → Services → UI → Cleanup)

**During Extraction**:
- [ ] Extract ONE phase at a time
- [ ] Save after each phase
- [ ] Validate after each phase
- [ ] Stop and ask for approval

**After Extraction**:
- [ ] Component <200 lines (UI) or <150 lines (Hook)
- [ ] Props <10 (or using Context)
- [ ] No direct server action imports (use services)
- [ ] Test thoroughly
- [ ] Get user approval before next component

---

## 📋 Phase 2.2: Redis Caching Layer

### Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Server Action  │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐      ┌──────────┐
│  Cache Service  │─────▶│  Redis   │
└──────┬──────────┘      └──────────┘
       │
       ▼ (cache miss)
┌─────────────────┐
│  Data Service   │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│   Database      │
└─────────────────┘
```

### Implementation Plan

#### **Step 1: Redis Setup**

**1.1 Install Dependencies**
```bash
npm install ioredis @types/ioredis
```

**1.2 Create Redis Client**
- File: `lib/cache/redis-client.ts`
- Singleton pattern
- Connection pooling
- Error handling
- Health checks

**1.3 Environment Variables**
```env
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your_password (if needed)
REDIS_TTL_DEFAULT=300 (5 minutes)
```

#### **Step 2: Cache Service Layer**

**2.1 Create Cache Service Interface** (DIP)
- File: `lib/cache/ICacheService.ts`
- Methods: `get`, `set`, `del`, `exists`, `invalidate`

**2.2 Implement Redis Cache Service**
- File: `lib/cache/RedisCacheService.ts`
- Implements `ICacheService`
- TTL management
- Key prefixing (`data-room:company:{id}:requirements`)
- Serialization/deserialization

**2.3 Create Cache Key Factory**
- File: `lib/cache/cache-keys.ts`
- Type-safe cache key generation
- Example: `cacheKeys.companyRequirements(companyId)`

#### **Step 3: Integrate with Server Actions**

**3.1 Cache-Enabled Server Actions**

**Priority 1: High-Frequency Queries**
- `getRegulatoryRequirements` → Cache key: `data-room:company:{id}:requirements`
- `getCompanyDocuments` → Cache key: `data-room:company:{id}:documents`
- `getCompanyAccessState` → Cache key: `data-room:user:{id}:company:{id}:access`
- `getUserSubscriptionSummary` → Cache key: `data-room:user:{id}:subscription`

**Priority 2: Medium-Frequency Queries**
- `getDirectors` → Cache key: `data-room:company:{id}:directors`
- `getDocumentTemplates` → Cache key: `data-room:templates:{country}`
- `getHiddenTemplates` → Cache key: `data-room:company:{id}:hidden-templates`

**3.2 Cache Invalidation Strategy**

**Write-Through Pattern**:
- On `updateRequirementStatus` → Invalidate `requirements` cache
- On `createRequirement` → Invalidate `requirements` cache
- On `deleteRequirement` → Invalidate `requirements` cache
- On `uploadDocument` → Invalidate `documents` cache
- On `deleteDocument` → Invalidate `documents` cache

**TTL Strategy**:
- **Requirements**: 5 minutes (frequently updated)
- **Documents**: 10 minutes (less frequently updated)
- **Access State**: 2 minutes (security-sensitive)
- **Subscription**: 5 minutes (rarely changes)
- **Templates**: 1 hour (static data)

#### **Step 4: Cache Warming (Optional)**

**4.1 Pre-fetch on Company Switch**
- When user switches company, pre-fetch and cache:
  - Requirements
  - Documents
  - Directors
  - Access state

**4.2 Background Refresh**
- Use React Query's `refetchInterval` for stale data
- Refresh cache in background before expiration

### Cache Service Implementation

**File Structure**:
```
lib/cache/
├── redis-client.ts          # Redis connection
├── ICacheService.ts         # Interface (DIP)
├── RedisCacheService.ts     # Implementation
├── cache-keys.ts            # Key factory
└── cache-middleware.ts      # Server action wrapper
```

**Example Usage**:
```typescript
// Before (no cache)
export async function getRegulatoryRequirements(companyId: string) {
  const requirements = await requirementRepository.getByCompanyId(companyId)
  return requirements
}

// After (with cache)
export async function getRegulatoryRequirements(companyId: string) {
  const cacheKey = cacheKeys.companyRequirements(companyId)
  const cached = await cacheService.get<RegulatoryRequirement[]>(cacheKey)
  if (cached) return cached
  
  const requirements = await requirementRepository.getByCompanyId(companyId)
  await cacheService.set(cacheKey, requirements, 300) // 5 min TTL
  return requirements
}
```

### Expected Performance Gains

| Operation | Before | After (Redis) | Improvement |
|-----------|--------|---------------|-------------|
| Requirements Fetch | 200ms | 5ms (cache hit) | 40x faster |
| Documents Fetch | 300ms | 5ms (cache hit) | 60x faster |
| Access Check | 150ms | 5ms (cache hit) | 30x faster |
| **Cache Hit Rate** | 0% | **80-90%** | New capability |

---

## 📋 Phase 2.3: SSR/Streaming Implementation

### Architecture

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Next.js SSR    │
└──────┬──────────┘
       │
       ├─▶ Server Component (Initial HTML)
       │   - Company list
       │   - Access state
       │   - Subscription status
       │
       └─▶ Streaming (Progressive)
           - Requirements (suspense)
           - Documents (suspense)
           - Directors (suspense)
```

### Implementation Plan

#### **Step 1: Convert to Server Component Structure**

**1.1 Create Server Component Wrapper**
- File: `app/data-room/page.tsx` (Server Component)
- Responsibilities:
  - Fetch initial data (companies, access, subscription)
  - Pass data as props to client component
  - Handle redirects server-side

**1.2 Create Client Component**
- File: `app/data-room/DataRoomClient.tsx` (Client Component)
- Responsibilities:
  - Interactive UI (tabs, modals, forms)
  - Client-side state management
  - React Query for additional data

**1.3 Data Flow**
```
Server Component (page.tsx)
  ├─▶ Fetch companies (server-side)
  ├─▶ Fetch access state (server-side)
  ├─▶ Fetch subscription (server-side)
  └─▶ Pass to Client Component (DataRoomClient.tsx)
      ├─▶ Render initial UI (instant)
      └─▶ Stream additional data (Suspense)
          ├─▶ Requirements (lazy)
          ├─▶ Documents (lazy)
          └─▶ Directors (lazy)
```

#### **Step 2: Streaming with Suspense**

**2.1 Create Streaming Components**

**Requirements Streamer**:
- File: `app/data-room/components/streaming/RequirementsStream.tsx`
- Wrapped in `<Suspense>`
- Fetches requirements server-side
- Streams to client

**Documents Streamer**:
- File: `app/data-room/components/streaming/DocumentsStream.tsx`
- Wrapped in `<Suspense>`
- Fetches documents server-side
- Streams to client

**2.2 Loading States**
- Skeleton loaders for each stream
- Progressive enhancement
- No blocking on slow queries

#### **Step 3: Server Actions for SSR**

**3.1 Convert to Server Actions**
- All data fetching moved to server actions
- Server actions can be called from Server Components
- Server actions can be called from Client Components (via React Query)

**3.2 Parallel Data Fetching**
```typescript
// Server Component
export default async function DataRoomPage({ searchParams }) {
  const companyId = searchParams.company_id
  
  // Parallel fetching (no waterfall)
  const [companies, access, subscription] = await Promise.all([
    getCompanies(),
    getCompanyAccessState(companyId),
    getUserSubscriptionSummary()
  ])
  
  return <DataRoomClient 
    companies={companies}
    access={access}
    subscription={subscription}
  />
}
```

#### **Step 4: Partial Hydration**

**4.1 Hydration Strategy**
- Server-render static content (company list, tabs)
- Client-hydrate interactive parts (modals, forms)
- Lazy-load heavy components (TrackerTab, DocumentsTab)

**4.2 Code Splitting**
- Each tab is already lazy-loaded (`React.lazy`)
- Further split modals and heavy components
- Reduce initial bundle size

### Expected Performance Gains

| Metric | Before (CSR) | After (SSR/Streaming) | Improvement |
|--------|--------------|----------------------|-------------|
| **Initial Load** | 4-7s | <500ms | **8-14x faster** |
| **Time to First Byte** | 200ms | 50ms | 4x faster |
| **First Contentful Paint** | 2-3s | <200ms | **10-15x faster** |
| **Time to Interactive** | 4-7s | 1-2s | **2-3x faster** |
| **Perceived Performance** | Slow | Instant | Massive improvement |

---

## 🗓️ Execution Timeline

### Week 1: Component Splitting (Foundation)
- **Day 1-2**: Extract Data Room Container (Phases 1.1-1.6)
- **Day 3**: Extract Document Upload Modal (Phases 2.1-2.3)
- **Day 4**: Extract Compliance Details Modal (Phases 3.1-3.2)
- **Day 5**: Extract Export & Send Modals (Phases 4-5)

### Week 2: Redis Caching
- **Day 1**: Redis setup and client
- **Day 2**: Cache service implementation
- **Day 3**: Integrate with high-frequency queries
- **Day 4**: Integrate with medium-frequency queries
- **Day 5**: Cache invalidation and testing

### Week 3: SSR/Streaming
- **Day 1**: Convert to Server Component structure
- **Day 2**: Implement streaming with Suspense
- **Day 3**: Parallel data fetching
- **Day 4**: Partial hydration
- **Day 5**: Performance testing and optimization

---

## ✅ Success Criteria

### Component Splitting
- [ ] `DataRoomContainer.tsx` <200 lines
- [ ] All hooks <150 lines
- [ ] All services <100 lines
- [ ] All modals <200 lines
- [ ] Props <10 per component (or using Context)
- [ ] No direct server action imports in components

### Redis Caching
- [ ] 80%+ cache hit rate for read operations
- [ ] Cache invalidation on writes
- [ ] TTL strategy implemented
- [ ] Error handling and fallback

### SSR/Streaming
- [ ] Initial load <500ms
- [ ] First Contentful Paint <200ms
- [ ] Streaming with Suspense
- [ ] Progressive enhancement

---

## 🚨 Risk Mitigation

### Component Splitting Risks
- **Risk**: Breaking existing functionality
- **Mitigation**: Incremental extraction, thorough testing after each phase, user approval

### Redis Risks
- **Risk**: Cache inconsistency
- **Mitigation**: Write-through pattern, proper invalidation, fallback to DB

### SSR Risks
- **Risk**: Hydration mismatches
- **Mitigation**: Server/client component separation, careful state management

---

## 📝 Notes

- **Incremental Approach**: Follow `.cursor/rules/incremental-refactoring.mdc` strictly
- **User Approval**: Stop after each phase, get approval before proceeding
- **Testing**: Test thoroughly after each extraction
- **Documentation**: Update component docs as we extract

---

## 🎯 Next Steps

1. **Review this plan** with user
2. **Start with Priority 1** (Data Room Container)
3. **Extract Phase 1.1** (Initialization logic to hook)
4. **Stop and get approval**
5. **Continue incrementally**
