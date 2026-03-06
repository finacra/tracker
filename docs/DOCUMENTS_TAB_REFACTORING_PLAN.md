# Documents Tab Refactoring Plan

## Overview

This document provides a detailed, step-by-step plan for extracting the Documents Tab from `app/data-room/page.tsx` into a separate component `app/data-room/components/DocumentsTab.tsx`. This follows the methodology outlined in `REFACTORING_GUIDE.md` and addresses the priorities in `DATA_ROOM_REFACTORING_PLAN.md`.

**Target:** Extract ~3,441 lines (lines 8149-11590) into a lazy-loaded component.

**Priority:** 🔴 **HIGHEST** - Largest remaining tab, complex document management logic.

---

## Pre-Extraction Analysis

### 1. Component Boundaries

**Exact Boundaries:**
- **Start:** Line 8149 - `{activeTab === 'documents' && (`
- **End:** Line 11590 - `)}` (closing the documents tab conditional)

**Total Lines:** ~3,441 lines

**JSX Structure:**
```typescript
{activeTab === 'documents' && (
  <div className="space-y-4 sm:space-y-6">
    {/* Header */}
    {/* Search and Filters */}
    {/* Document Folders */}
    {/* Modals */}
  </div>
)}
```

### 2. Dependency Inventory

#### State Variables (useState)

| Variable | Type | Used For | Pass as Prop? |
|----------|------|----------|---------------|
| `vaultDocuments` | `any[]` | Document list | ✅ Yes |
| `setVaultDocuments` | `(docs: any[]) => void` | Update documents | ✅ Yes |
| `isLoadingVaultDocuments` | `boolean` | Loading state | ✅ Yes |
| `setIsLoadingVaultDocuments` | `(loading: boolean) => void` | Set loading | ✅ Yes |
| `documentTemplates` | `any[]` | Template definitions | ✅ Yes |
| `setDocumentTemplates` | `(templates: any[]) => void` | Update templates | ✅ Yes |
| `hiddenTemplates` | `Set<string>` | Hidden template keys | ✅ Yes |
| `setHiddenTemplates` | `(updater: (prev: Set<string>) => Set<string>) => void` | Update hidden | ✅ Yes |
| `isExportModalOpen` | `boolean` | Export modal state | ✅ Yes |
| `setIsExportModalOpen` | `(open: boolean) => void` | Toggle export modal | ✅ Yes |
| `isSendModalOpen` | `boolean` | Send modal state | ✅ Yes |
| `setIsSendModalOpen` | `(open: boolean) => void` | Toggle send modal | ✅ Yes |
| `isUploadModalOpen` | `boolean` | Upload modal state | ✅ Yes |
| `setIsUploadModalOpen` | `(open: boolean) => void` | Toggle upload modal | ✅ Yes |
| `isBulkUploadModalOpen` | `boolean` | Bulk upload modal state | ✅ Yes |
| `setIsBulkUploadModalOpen` | `(open: boolean) => void` | Toggle bulk upload modal | ✅ Yes |
| `searchQuery` | `string` | Search input | ✅ Yes (or move to component) |
| `setSearchQuery` | `(query: string) => void` | Update search | ✅ Yes (or move to component) |
| `selectedFY` | `string` | Financial year filter | ✅ Yes (or move to component) |
| `setSelectedFY` | `(fy: string) => void` | Update FY filter | ✅ Yes (or move to component) |
| `sortOption` | `'name-asc' \| 'name-desc' \| 'date-newest' \| 'date-oldest' \| 'expiry' \| 'folder'` | Sort option | ✅ Yes (or move to component) |
| `setSortOption` | `(option: typeof sortOption) => void` | Update sort | ✅ Yes (or move to component) |
| `expiringSoonFilter` | `'all' \| 'expiring' \| 'expired'` | Expiry filter | ✅ Yes (or move to component) |
| `setExpiringSoonFilter` | `(filter: typeof expiringSoonFilter) => void` | Update filter | ✅ Yes (or move to component) |
| `expandedFolders` | `Set<string>` | Expanded folder state | ✅ Yes (or move to component) |
| `setExpandedFolders` | `(updater: (prev: Set<string>) => Set<string>) => void` | Update expanded | ✅ Yes (or move to component) |
| `expandedDocumentVersions` | `Set<string>` | Expanded version state | ✅ Yes (or move to component) |
| `setExpandedDocumentVersions` | `(updater: (prev: Set<string>) => Set<string>) => void` | Update versions | ✅ Yes (or move to component) |
| `expandedYearGroups` | `Record<string, Set<string>>` | Expanded year groups | ✅ Yes (or move to component) |
| `setExpandedYearGroups` | `(updater: (prev: Record<string, Set<string>>) => Record<string, Set<string>>) => void` | Update year groups | ✅ Yes (or move to component) |

**Decision:** Move filter/search/expand state to component (local state, not shared with other tabs).

#### Computed Values (useMemo)

| Variable | Type | Used For | Pass as Prop? |
|----------|------|----------|---------------|
| `documentFolders` | `string[]` | Folder list | ✅ Yes |
| `predefinedDocuments` | `Record<string, string[]>` | Predefined doc names | ✅ Yes |

#### Functions (Actions & Helpers)

| Function | Source | Used For | Pass as Prop? |
|----------|--------|----------|---------------|
| `fetchVaultDocuments` | Defined in parent | Fetch documents | ✅ Yes |
| `uploadDocument` | Imported from `@/app/onboarding/actions` | Upload file | ✅ Yes |
| `getCompanyDocuments` | Imported from `@/app/onboarding/actions` | Get documents | ✅ Yes |
| `getDocumentTemplates` | Imported from `@/app/onboarding/actions` | Get templates | ✅ Yes |
| `getDownloadUrl` | Imported from `@/app/onboarding/actions` | Get download URL | ✅ Yes |
| `deleteDocument` | Imported from `@/app/onboarding/actions` | Delete document | ✅ Yes |
| `sendDocumentsEmail` | Imported from `@/app/data-room/actions` | Send email | ✅ Yes |
| `hideDocumentTemplateForCompany` | Imported from `@/app/data-room/actions` | Hide template | ✅ Yes |
| `getHiddenDocumentTemplates` | Imported from `@/app/data-room/actions` | Get hidden templates | ✅ Yes |
| `trackVaultFileExport` | Imported from `@/lib/tracking/kpi-tracker` | Track export | ✅ Yes |
| `trackVaultFileUpload` | Imported from `@/lib/tracking/kpi-tracker` | Track upload | ✅ Yes |
| `showToast` | Imported from `@/components/ui/Toast` | Show toast | ✅ Yes |

#### Helper Functions (Defined in Parent)

| Function | Type | Used For | Move to Component? |
|----------|------|----------|-------------------|
| `getFileTypeIcon` | `(fileName: string) => JSX.Element` | File icon | ✅ Yes - Move to component |
| `getFinancialYear` | `(dateStr: string) => string` | Get FY from date | ✅ Yes - Move to component |
| `formatPeriodInfo` | `(doc: any) => string \| null` | Format period | ✅ Yes - Move to component |
| `getPeriodBadgeColor` | `(periodType: string \| null) => string` | Badge color | ✅ Yes - Move to component |
| `getFinancialYearFromDoc` | `(doc: any) => string \| null` | Get FY from doc | ✅ Yes - Move to component |
| `formatRelativeTime` | `(dateStr: string) => string` | Relative time | ✅ Yes - Move to component |
| `formatFileSize` | `(bytes: number \| null \| undefined) => string` | File size | ✅ Yes - Move to component |
| `groupDocumentsByVersion` | `(documents: any[]) => VersionGroup[]` | Group versions | ✅ Yes - Move to component |
| `matchesSearch` | `(doc: any, query: string) => boolean` | Search matching | ✅ Yes - Move to component |
| `getDocumentStatus` | `(doc: any) => 'valid' \| 'expiring' \| 'expired' \| 'no-expiry'` | Doc status | ✅ Yes - Move to component |
| `getStatusBadgeColor` | `(status: string) => string` | Status badge color | ✅ Yes - Move to component |
| `formatDateForDisplay` | `(dateStr: string) => string` | Date formatting | ✅ Yes - Move to component |
| `sortDocuments` | `(docs: any[], sortBy: typeof sortOption) => any[]` | Sort docs | ✅ Yes - Move to component |

**Decision:** Move all helper functions to component (they're only used in Documents tab).

#### Props from Parent

| Prop | Type | Used For | Pass as Prop? |
|------|------|----------|---------------|
| `currentCompany` | `Company \| null` | Company context | ✅ Yes |
| `canEdit` | `boolean` | Edit permissions | ✅ Yes |
| `canManage` | `boolean` | Manage permissions | ✅ Yes |
| `user` | `User` | User context | ✅ Yes |
| `financialYears` | `string[]` | FY dropdown | ✅ Yes |
| `countryCode` | `string` | Country context | ✅ Yes |
| `countryConfig` | `any` | Country config | ✅ Yes |

#### Imports Needed

```typescript
// React
import React, { useState, useMemo, useCallback } from 'react'

// Actions
import { uploadDocument, getCompanyDocuments, getDocumentTemplates, getDownloadUrl, deleteDocument } from '@/app/onboarding/actions'
import { sendDocumentsEmail, hideDocumentTemplateForCompany, getHiddenDocumentTemplates } from '@/app/data-room/actions'

// Tracking
import { trackVaultFileExport, trackVaultFileUpload } from '@/lib/tracking/kpi-tracker'

// UI
import { showToast } from '@/components/ui/Toast'

// Types
import { Company } from '@/app/data-room/page' // Or define locally
```

#### Types/Interfaces Needed

```typescript
interface VersionGroup {
  documentType: string
  latestVersion: any
  totalVersions: number
  versions: any[]
}

interface DocumentsTabProps {
  // State
  vaultDocuments: any[]
  setVaultDocuments: (docs: any[]) => void
  isLoadingVaultDocuments: boolean
  setIsLoadingVaultDocuments: (loading: boolean) => void
  documentTemplates: any[]
  setDocumentTemplates: (templates: any[]) => void
  hiddenTemplates: Set<string>
  setHiddenTemplates: (updater: (prev: Set<string>) => Set<string>) => void
  
  // Modal States
  isExportModalOpen: boolean
  setIsExportModalOpen: (open: boolean) => void
  isSendModalOpen: boolean
  setIsSendModalOpen: (open: boolean) => void
  isUploadModalOpen: boolean
  setIsUploadModalOpen: (open: boolean) => void
  isBulkUploadModalOpen: boolean
  setIsBulkUploadModalOpen: (open: boolean) => void
  
  // Computed
  documentFolders: string[]
  predefinedDocuments: Record<string, string[]>
  
  // Functions
  fetchVaultDocuments: () => Promise<void>
  
  // Props
  currentCompany: Company | null
  canEdit: boolean
  canManage: boolean
  user: any
  financialYears: string[]
  countryCode: string
  countryConfig: any
  
  // Actions (passed as props)
  uploadDocument: typeof uploadDocument
  getCompanyDocuments: typeof getCompanyDocuments
  getDocumentTemplates: typeof getDocumentTemplates
  getDownloadUrl: typeof getDownloadUrl
  deleteDocument: typeof deleteDocument
  sendDocumentsEmail: typeof sendDocumentsEmail
  hideDocumentTemplateForCompany: typeof hideDocumentTemplateForCompany
  getHiddenDocumentTemplates: typeof getHiddenDocumentTemplates
  trackVaultFileExport: typeof trackVaultFileExport
  trackVaultFileUpload: typeof trackVaultFileUpload
  showToast: typeof showToast
}
```

---

## Step-by-Step Extraction Workflow

### Phase 1: Preparation (DO NOT EXTRACT YET)

#### Step 1.1: Create Component File Structure

**File:** `app/data-room/components/DocumentsTab.tsx`

```typescript
'use client'

import React, { useState, useMemo, useCallback } from 'react'
// We'll add imports as we discover them

interface DocumentsTabProps {
  // Will be populated based on dependency analysis
  [key: string]: any
}

export default function DocumentsTab({
  ...props
}: DocumentsTabProps) {
  // Local state for filters/search (not shared with other tabs)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedFY, setSelectedFY] = useState<string>('')
  const [sortOption, setSortOption] = useState<'name-asc' | 'name-desc' | 'date-newest' | 'date-oldest' | 'expiry' | 'folder'>('date-newest')
  const [expiringSoonFilter, setExpiringSoonFilter] = useState<'all' | 'expiring' | 'expired'>('all')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [expandedDocumentVersions, setExpandedDocumentVersions] = useState<Set<string>>(new Set())
  const [expandedYearGroups, setExpandedYearGroups] = useState<Record<string, Set<string>>>({})

  // Placeholder for JSX
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* JSX will be moved here */}
    </div>
  )
}
```

#### Step 1.2: Create Complete Props Interface

Based on dependency analysis above, create the full `DocumentsTabProps` interface.

#### Step 1.3: Move Helper Functions

**Create:** `app/data-room/components/DocumentsTabHelpers.ts` (optional - or keep in component)

Move all helper functions:
- `getFileTypeIcon`
- `getFinancialYear`
- `formatPeriodInfo`
- `getPeriodBadgeColor`
- `getFinancialYearFromDoc`
- `formatRelativeTime`
- `formatFileSize`
- `groupDocumentsByVersion`
- `matchesSearch`
- `getDocumentStatus`
- `getStatusBadgeColor`
- `formatDateForDisplay`
- `sortDocuments`

**Decision:** Keep helpers in component file initially (can extract later if needed).

#### Step 1.4: Update Parent Component

**In `app/data-room/page.tsx`:**

```typescript
// Add lazy import at top
import { lazy, Suspense } from 'react'
const DocumentsTab = lazy(() => import('./components/DocumentsTab'))

// Replace documents tab JSX with:
{activeTab === 'documents' && (
  <Suspense fallback={
    <div className="flex items-center justify-center p-8">
      <div className="w-8 h-8 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
    </div>
  }>
    <DocumentsTab
      // Pass all props from dependency analysis
      vaultDocuments={vaultDocuments}
      setVaultDocuments={setVaultDocuments}
      isLoadingVaultDocuments={isLoadingVaultDocuments}
      setIsLoadingVaultDocuments={setIsLoadingVaultDocuments}
      documentTemplates={documentTemplates}
      setDocumentTemplates={setDocumentTemplates}
      hiddenTemplates={hiddenTemplates}
      setHiddenTemplates={setHiddenTemplates}
      isExportModalOpen={isExportModalOpen}
      setIsExportModalOpen={setIsExportModalOpen}
      isSendModalOpen={isSendModalOpen}
      setIsSendModalOpen={setIsSendModalOpen}
      isUploadModalOpen={isUploadModalOpen}
      setIsUploadModalOpen={setIsUploadModalOpen}
      isBulkUploadModalOpen={isBulkUploadModalOpen}
      setIsBulkUploadModalOpen={setIsBulkUploadModalOpen}
      documentFolders={documentFolders}
      predefinedDocuments={predefinedDocuments}
      fetchVaultDocuments={fetchVaultDocuments}
      currentCompany={currentCompany}
      canEdit={canEdit}
      canManage={canManage}
      user={user}
      financialYears={financialYears}
      countryCode={countryCode}
      countryConfig={countryConfig}
      uploadDocument={uploadDocument}
      getCompanyDocuments={getCompanyDocuments}
      getDocumentTemplates={getDocumentTemplates}
      getDownloadUrl={getDownloadUrl}
      deleteDocument={deleteDocument}
      sendDocumentsEmail={sendDocumentsEmail}
      hideDocumentTemplateForCompany={hideDocumentTemplateForCompany}
      getHiddenDocumentTemplates={getHiddenDocumentTemplates}
      trackVaultFileExport={trackVaultFileExport}
      trackVaultFileUpload={trackVaultFileUpload}
      showToast={showToast}
    />
  </Suspense>
)}
```

### Phase 2: Extraction

#### Step 2.1: Copy JSX Block

1. **Cut** the entire JSX block from `app/data-room/page.tsx` (lines 8149-11590)
2. **Paste** into `DocumentsTab.tsx` return statement
3. **Verify** JSX structure is intact

#### Step 2.2: Add All Imports

Add all imports identified in dependency analysis to `DocumentsTab.tsx`.

#### Step 2.3: Move Helper Functions

Copy all helper functions from parent to `DocumentsTab.tsx` (place before return statement).

#### Step 2.4: Update References

Replace all parent-scope references with props:
- `vaultDocuments` → `props.vaultDocuments` (or destructured)
- `setVaultDocuments` → `props.setVaultDocuments`
- etc.

### Phase 3: Validation

#### Step 3.1: JSX Structure Check

**Count tags:**
```bash
# PowerShell
$content = Get-Content 'app\data-room\components\DocumentsTab.tsx'
$openDivs = ($content | Select-String -Pattern '<div' -AllMatches).Matches.Count
$closeDivs = ($content | Select-String -Pattern '</div>' -AllMatches).Matches.Count
Write-Host "Open divs: $openDivs"
Write-Host "Close divs: $closeDivs"
```

**Verify:**
- All opening tags have closing tags
- All conditional renders are properly closed
- No orphaned JSX expressions

#### Step 3.2: TypeScript Check

```bash
npm run build
```

**Fix errors:**
- Add type annotations to all callback parameters
- Ensure all props are properly typed
- Fix any implicit `any` types

#### Step 3.3: Runtime Check

1. Start dev server: `npm run dev`
2. Navigate to data-room page
3. Click Documents tab
4. Verify:
   - Component renders
   - All buttons work
   - All modals open/close
   - Search/filter works
   - Upload/download works
   - No console errors

---

## Common Pitfalls & Mitigation

### Pitfall 1: Missing Props

**Symptom:** `Cannot find name 'variableName'`

**Solution:**
1. Check dependency inventory
2. Add to `DocumentsTabProps`
3. Pass from parent
4. Update references in component

**Prevention:** Complete dependency analysis before extraction.

### Pitfall 2: Unbalanced JSX

**Symptom:** `Unterminated regexp literal`, `Parsing ecmascript source code failed`

**Solution:**
1. Count opening/closing tags
2. Verify nesting structure
3. Check conditional renders
4. Use JSX formatter

**Prevention:** Validate JSX structure before moving on.

### Pitfall 3: Helper Functions Not Moved

**Symptom:** `Cannot find name 'functionName'`

**Solution:**
1. Identify all helper functions used
2. Move to component or pass as prop
3. Update references

**Prevention:** Document all helper functions in dependency analysis.

### Pitfall 4: State Dependencies

**Symptom:** State not updating correctly

**Solution:**
1. Verify state setters are passed correctly
2. Check state update logic
3. Ensure proper prop types

**Prevention:** Test state updates after extraction.

### Pitfall 5: Modal State Management

**Symptom:** Modals not opening/closing

**Solution:**
1. Verify modal state props are passed
2. Check modal JSX is included
3. Ensure event handlers are correct

**Prevention:** Test all modals after extraction.

---

## Testing Checklist

### Build Validation
- [ ] `npm run build` succeeds
- [ ] No TypeScript errors
- [ ] No syntax errors
- [ ] No import errors

### Runtime Validation
- [ ] Documents tab renders
- [ ] Search works
- [ ] Filters work (FY, sort, expiry)
- [ ] Folders expand/collapse
- [ ] Document versions expand/collapse
- [ ] Upload modal opens/closes
- [ ] Bulk upload modal opens/closes
- [ ] Export modal opens/closes
- [ ] Send modal opens/closes
- [ ] File upload works
- [ ] File download works
- [ ] File delete works
- [ ] Template hide/show works
- [ ] Export functionality works
- [ ] Send email works
- [ ] No console errors

### Performance Validation
- [ ] Lazy loading works (check Network tab)
- [ ] Tab switching is fast (< 500ms)
- [ ] No unnecessary re-renders
- [ ] Bundle size reduced

---

## Post-Extraction Tasks

### Code Quality
- [ ] Remove unused imports
- [ ] Remove unused variables
- [ ] Add JSDoc comments for complex functions
- [ ] Format code with Prettier

### Documentation
- [ ] Update component documentation
- [ ] Document props interface
- [ ] Add usage examples

### Optimization (Future)
- [ ] Consider extracting modals to separate components
- [ ] Consider extracting helper functions to utilities
- [ ] Consider using Context API if props exceed 40
- [ ] Consider memoization for expensive computations

---

## Risk Assessment

### High Risk Areas

1. **Complex File Operations**
   - Upload/download logic
   - File path handling
   - **Mitigation:** Test thoroughly, keep logic intact

2. **Modal State Management**
   - Multiple modals with complex state
   - **Mitigation:** Verify all modal states are passed correctly

3. **Version Grouping Logic**
   - Complex document version grouping
   - **Mitigation:** Test version expansion/collapse thoroughly

4. **Search/Filter Logic**
   - Complex filtering with multiple criteria
   - **Mitigation:** Test all filter combinations

### Medium Risk Areas

1. **Helper Functions**
   - Many helper functions to move
   - **Mitigation:** Move all at once, test each

2. **State Dependencies**
   - Many state variables
   - **Mitigation:** Use dependency inventory checklist

### Low Risk Areas

1. **UI Components**
   - Standard React components
   - **Mitigation:** Should work as-is

---

## Success Metrics

### Code Quality
- [ ] Component < 3,500 lines
- [ ] All TypeScript errors resolved
- [ ] All props properly typed
- [ ] No implicit `any` types

### Functionality
- [ ] All features work as before
- [ ] No regressions
- [ ] All modals work
- [ ] All file operations work

### Performance
- [ ] Tab switching < 500ms
- [ ] Lazy loading works
- [ ] Bundle size reduced
- [ ] No performance regressions

---

## Timeline Estimate

- **Dependency Analysis:** 1-2 hours
- **Component Creation:** 2-3 hours
- **Extraction:** 3-4 hours
- **Testing & Fixes:** 2-3 hours
- **Total:** 8-12 hours

---

## Notes

- **Follow REFACTORING_GUIDE.md** methodology strictly
- **Test incrementally** - don't extract everything at once
- **Keep parent file working** - extract in stages if needed
- **Document as you go** - note any issues or learnings
- **Consider Context API** if props exceed 40 (currently ~35 props)

---

## Quick Reference Checklist

### Before Extraction
- [ ] Complete dependency inventory
- [ ] Create props interface
- [ ] Create component file structure
- [ ] Move helper functions
- [ ] Update parent to use lazy loading

### During Extraction
- [ ] Copy JSX block
- [ ] Add all imports
- [ ] Move helper functions
- [ ] Update all references
- [ ] Pass all props from parent

### After Extraction
- [ ] Verify JSX structure (balanced tags)
- [ ] Fix TypeScript errors
- [ ] Add type annotations
- [ ] Test component renders
- [ ] Test all interactions
- [ ] Test all modals
- [ ] Verify lazy loading works
- [ ] Check bundle size
- [ ] No console errors

---

Good luck! 🚀
