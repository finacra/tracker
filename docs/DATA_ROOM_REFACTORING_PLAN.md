# Data Room Refactoring Plan

## Current State Analysis

### File Structure
```
app/data-room/
├── page.tsx                    (10,827 lines) ⚠️ VERY LARGE
├── actions.ts                  (3,265+ lines) ⚠️ LARGE
├── actions-enrichment.ts       (38 lines) ✅ OK
└── components/
    └── TrackerTab.tsx          (2,299 lines) ✅ Already extracted
```

### Main Page (`page.tsx`) - 10,827 Lines

**Status:** Still monolithic despite TrackerTab extraction

**Tabs Breakdown:**

| Tab | Start Line | End Line | Approx. Lines | Priority | Status |
|-----|-----------|---------|--------------|----------|--------|
| **Overview** | 3809 | 4030 | ~221 | 🟢 Low | Inline |
| **Reports** | 4031 | 5854 | ~1,823 | 🔴 **HIGH** | Inline (IIFE) |
| **Notices** | 5856 | 6854 | ~998 | 🟡 Medium | Inline |
| **GST** | 6855 | 7706 | ~851 | 🟡 Medium | Inline |
| **Tracker** | 7608 | 7705 | ~98 | ✅ **DONE** | Extracted |
| **DSC-DIN** | 7707 | 8148 | ~441 | 🟢 Low | Inline |
| **Documents** | 8149 | 11590 | ~3,441 | 🔴 **HIGHEST** | Inline |

**Shared Code:**
- State management (~3,000+ lines)
- Utility functions
- Modals (multiple modals scattered throughout)
- Helper functions

---

## Refactoring Priorities

### 🔴 Priority 1: Documents Tab (~3,441 lines)
**Why:** Largest remaining tab, complex document management logic

**Estimated Impact:**
- Reduces main file by ~3,400 lines
- Enables lazy loading
- Improves performance significantly

**Complexity:** High
- Document upload logic
- Folder structure management
- Export functionality
- Email sending
- Multiple modals

**Dependencies to Identify:**
- `vaultDocuments` state
- `isLoadingVaultDocuments` state
- `documentTemplates` state
- `hiddenTemplates` state
- `fetchVaultDocuments` function
- `uploadDocument` action
- `getCompanyDocuments` action
- `getDocumentTemplates` action
- `deleteDocument` action
- `getDownloadUrl` action
- `sendDocumentsEmail` action
- Export modal state
- Send modal state
- Upload modal state

---

### 🔴 Priority 2: Reports Tab (~1,823 lines)
**Why:** Second largest, uses IIFE pattern (complex)

**Estimated Impact:**
- Reduces main file by ~1,800 lines
- Simplifies code structure (removes IIFE)
- Enables lazy loading

**Complexity:** Medium-High
- PDF generation logic
- Statistics calculations
- Date parsing helpers
- Compliance score calculations
- Multiple report types

**Dependencies to Identify:**
- `displayRequirements` (computed)
- `regulatoryRequirements` state
- `calculateDelayMemoized` function
- `calculatePenaltyMemoized` function
- `normalizeDate` function
- `formatDate` function
- `jsPDF` import
- PDF generation state
- Report download tracking

**Special Note:** Uses IIFE pattern `{activeTab === 'reports' && (() => { ... })()}`
- This pattern should be removed during extraction
- Helper functions should be moved to component or utilities

---

### 🟡 Priority 3: Notices Tab (~998 lines)
**Why:** Medium size, manageable complexity

**Estimated Impact:**
- Reduces main file by ~1,000 lines
- Enables lazy loading

**Complexity:** Medium
- Notice management
- Filtering logic
- Status tracking
- Add/Edit modals

**Dependencies to Identify:**
- `noticesFilter` state
- `noticesTypeFilter` state
- `isAddNoticeModalOpen` state
- Notice-related actions (if any)
- Compliance categories

---

### 🟡 Priority 4: GST Tab (~851 lines)
**Why:** Medium size, country-specific (India only)

**Estimated Impact:**
- Reduces main file by ~850 lines
- Enables lazy loading
- Better country-specific code isolation

**Complexity:** Medium
- GST portal integration
- OTP verification flow
- Multi-step form
- Credential management

**Dependencies to Identify:**
- `gstStep` state
- `gstCredentials` state
- `gstOTP` state
- `countryCode` (must be 'IN')
- GST-related actions (if any)

**Special Note:** Only shows when `countryCode === 'IN'`
- Should handle this condition in component or parent

---

### 🟢 Priority 5: DSC-DIN Tab (~441 lines)
**Why:** Smaller, but still worth extracting

**Estimated Impact:**
- Reduces main file by ~440 lines
- Enables lazy loading

**Complexity:** Low-Medium
- Director management
- File uploads (DSC/DIN)
- Portal credentials
- Expiry tracking

**Dependencies to Identify:**
- `directorDscDinData` state
- `entityDetails.directors`
- File upload logic
- Portal credential management

---

### 🟢 Priority 6: Overview Tab (~221 lines)
**Why:** Smallest tab, lowest priority

**Estimated Impact:**
- Reduces main file by ~220 lines
- Minimal performance impact

**Complexity:** Low
- Entity details display
- Basic company information
- Simple layout

**Dependencies to Identify:**
- `entityDetails` state
- `isLoading` state
- `currentCompany`
- Router for navigation

**Note:** Could potentially be merged with another tab or kept inline if it's simple enough

---

## Actions File Analysis

### `actions.ts` (~3,265 lines)

**Current Functions:**
1. `getUserRole` - User role management
2. `canUserView/Edit/Manage` - Permission checks
3. `getRegulatoryRequirements` - Fetch requirements
4. `updateRequirement` - Update requirement
5. `updateRequirementStatus` - Update status
6. `createRequirement` - Create requirement
7. `deleteRequirement` - Delete requirement
8. `getCompanyUserRoles` - Team management
9. `addTeamMember` - Add team member
10. `createTeamInvitation` - Create invitation
11. `acceptTeamInvitation` - Accept invitation
12. `removeTeamMember` - Remove member
13. `updateTeamMemberRole` - Update role
14. `generateRecurringCompliances` - Generate recurring
15. `getComplianceTemplates` - Get templates
16. `createComplianceTemplate` - Create template
17. `updateComplianceTemplate` - Update template
18. `deleteComplianceTemplate` - Delete template
19. `getTemplateDetails` - Get template details
20. `applyAllTemplates` - Apply templates
21. `getNotifications` - Get notifications
22. `markNotificationsRead` - Mark read
23. `markAllNotificationsRead` - Mark all read
24. `getCompanyFinancials` - Get financials
25. `upsertCompanyFinancials` - Upsert financials
26. `updateRequirementBaseAmount` - Update base amount
27. `bulkCreateComplianceTemplates` - Bulk create

**Refactoring Opportunities:**

1. **Split by Domain:**
   ```
   actions/
   ├── requirements.ts      (CRUD for requirements)
   ├── templates.ts        (Template management)
   ├── team.ts             (Team/invitation management)
   ├── permissions.ts       (Role/permission checks)
   ├── notifications.ts    (Notification management)
   ├── financials.ts      (Financial data)
   └── index.ts            (Re-exports)
   ```

2. **Benefits:**
   - Better organization
   - Easier to find functions
   - Reduced file size
   - Better maintainability

---

## Recommended Refactoring Sequence

### Phase 1: High Impact, High Value
1. ✅ **Tracker Tab** - DONE (2,299 lines extracted)
2. 🔴 **Documents Tab** - NEXT (3,441 lines)
3. 🔴 **Reports Tab** - AFTER (1,823 lines)

**Total Reduction:** ~7,563 lines (70% of current size)

### Phase 2: Medium Impact
4. 🟡 **Notices Tab** (~998 lines)
5. 🟡 **GST Tab** (~851 lines)

**Total Reduction:** ~1,849 lines

### Phase 3: Low Impact, Cleanup
6. 🟢 **DSC-DIN Tab** (~441 lines)
7. 🟢 **Overview Tab** (~221 lines)

**Total Reduction:** ~662 lines

### Phase 4: Actions Refactoring
8. Split `actions.ts` into domain-specific files

---

## Detailed Refactoring Plan

### 1. Documents Tab Extraction

**File:** `app/data-room/components/DocumentsTab.tsx`

**Estimated Size:** ~3,400 lines

**Key Features:**
- Document folder structure
- File upload/download
- Document templates
- Export functionality
- Email sending
- Hidden templates management

**Props Needed:**
- `vaultDocuments`
- `setVaultDocuments`
- `isLoadingVaultDocuments`
- `setIsLoadingVaultDocuments`
- `documentTemplates`
- `setDocumentTemplates`
- `hiddenTemplates`
- `setHiddenTemplates`
- `fetchVaultDocuments`
- `currentCompany`
- `canEdit`
- `canManage`
- `isExportModalOpen`
- `setIsExportModalOpen`
- `isSendModalOpen`
- `setIsSendModalOpen`
- `uploadDocument`
- `getCompanyDocuments`
- `getDocumentTemplates`
- `getDownloadUrl`
- `deleteDocument`
- `sendDocumentsEmail`
- `trackVaultFileExport`
- `trackVaultFileUpload`
- `showToast`
- ... (many more)

**Complexity Factors:**
- Multiple modals
- Complex folder structure
- File upload with progress
- Export with zip creation
- Email integration

---

### 2. Reports Tab Extraction

**File:** `app/data-room/components/ReportsTab.tsx`

**Estimated Size:** ~1,800 lines

**Key Features:**
- Compliance statistics
- PDF report generation
- Multiple report types
- Date range filtering
- Compliance score calculation

**Props Needed:**
- `displayRequirements`
- `regulatoryRequirements`
- `calculateDelayMemoized`
- `calculatePenaltyMemoized`
- `normalizeDate`
- `formatDate`
- `currentCompany`
- `countryCode`
- `countryConfig`
- `jsPDF` (or move PDF generation to utility)
- `trackReportDownload`
- `showToast`
- ... (more)

**Special Considerations:**
- Remove IIFE pattern
- Move helper functions to component or utilities
- PDF generation logic is complex

---

### 3. Notices Tab Extraction

**File:** `app/data-room/components/NoticesTab.tsx`

**Estimated Size:** ~1,000 lines

**Key Features:**
- Notice management
- Status filtering
- Type filtering
- Add/Edit notices
- Statistics display

**Props Needed:**
- `noticesFilter`
- `setNoticesFilter`
- `noticesTypeFilter`
- `setNoticesTypeFilter`
- `isAddNoticeModalOpen`
- `setIsAddNoticeModalOpen`
- `complianceCategories`
- `currentCompany`
- `canEdit`
- ... (more)

---

### 4. GST Tab Extraction

**File:** `app/data-room/components/GSTTab.tsx`

**Estimated Size:** ~850 lines

**Key Features:**
- GST portal connection
- OTP verification
- Multi-step flow
- Credential management

**Props Needed:**
- `gstStep`
- `setGstStep`
- `gstCredentials`
- `setGstCredentials`
- `gstOTP`
- `setGstOTP`
- `countryCode` (must be 'IN')
- `currentCompany`
- ... (more)

**Special Note:**
- Only renders when `countryCode === 'IN'`
- Consider conditional rendering in parent or component

---

### 5. DSC-DIN Tab Extraction

**File:** `app/data-room/components/DSCDINTab.tsx`

**Estimated Size:** ~440 lines

**Key Features:**
- Director management
- DSC file upload
- DIN file upload
- Portal credentials
- Expiry tracking

**Props Needed:**
- `directorDscDinData`
- `setDirectorDscDinData`
- `entityDetails.directors`
- `currentCompany`
- `canEdit`
- File upload actions
- ... (more)

---

### 6. Overview Tab Extraction

**File:** `app/data-room/components/OverviewTab.tsx`

**Estimated Size:** ~220 lines

**Key Features:**
- Entity details display
- Company information
- Basic stats

**Props Needed:**
- `entityDetails`
- `isLoading`
- `currentCompany`
- `router`
- ... (minimal)

**Note:** Smallest tab, consider keeping inline if it's simple enough

---

## Shared Code Refactoring

### Modals

**Current State:** Modals are scattered throughout the main file

**Recommended Approach:**
1. Extract each modal to its own component
2. Create a modals directory:
   ```
   components/
   ├── modals/
   │   ├── ComplianceDetailsModal.tsx
   │   ├── DocumentUploadModal.tsx
   │   ├── ExportModal.tsx
   │   ├── SendDocumentsModal.tsx
   │   ├── AddNoticeModal.tsx
   │   ├── GSTConnectModal.tsx
   │   └── ...
   ```

### Utility Functions

**Functions to Extract:**
- `generateICSFile` - Already in TrackerTab, should be shared
- Date parsing helpers (multiple versions)
- Calculation helpers
- Format helpers

**Recommended Location:**
```
lib/utils/
├── ics-generator.ts
├── date-helpers.ts
├── compliance-calculations.ts
└── ...
```

### State Management

**Current Issues:**
- 50+ state variables in main component
- High coupling between tabs
- Props drilling

**Recommended Solutions:**

1. **Context API for Shared State:**
   ```typescript
   // Create DataRoomContext
   const DataRoomContext = createContext<DataRoomContextType>()
   
   // Provide in parent
   <DataRoomContext.Provider value={allSharedState}>
     <TabComponents />
   </DataRoomContext.Provider>
   ```

2. **Custom Hooks:**
   ```typescript
   // Extract state logic to hooks
   function useDataRoomState() {
     // All state management
     return { state, setters, functions }
   }
   ```

3. **State Management Library:**
   - Consider Zustand or Redux for complex state
   - Especially if state is shared across many components

---

## Actions File Refactoring

### Proposed Structure

```
app/data-room/actions/
├── index.ts                 (Re-exports all)
├── requirements.ts          (CRUD operations)
├── templates.ts            (Template management)
├── team.ts                 (Team/invitations)
├── permissions.ts          (Role checks)
├── notifications.ts        (Notifications)
├── financials.ts         (Financial data)
└── types.ts               (Shared types)
```

### Migration Strategy

1. **Create new structure** (keep old file)
2. **Move functions one by one** (test after each)
3. **Update imports** in components
4. **Remove old file** once all migrated
5. **Update index.ts** for clean imports

---

## Expected Outcomes

### After Phase 1 (Documents + Reports)
- Main file: ~5,400 lines (from 10,827)
- Reduction: ~50%
- Performance: Significant improvement
- Maintainability: Much better

### After Phase 2 (All Tabs)
- Main file: ~3,500 lines (from 10,827)
- Reduction: ~68%
- Performance: Excellent
- Maintainability: Excellent

### After Phase 3 (Actions Split)
- Actions: Multiple small files (~200-500 lines each)
- Better organization
- Easier to find functions
- Better testability

---

## Implementation Guidelines

### Follow the Refactoring Guide

Use `docs/REFACTORING_GUIDE.md` for:
- Dependency analysis process
- Step-by-step extraction workflow
- Common pitfalls and solutions
- TypeScript best practices

### Key Principles

1. **Always do dependency analysis FIRST**
2. **Extract one tab at a time**
3. **Test after each extraction**
4. **Use lazy loading for all tabs**
5. **Maintain type safety**
6. **Keep shared code accessible**

---

## Risk Assessment

### High Risk Areas

1. **Documents Tab:**
   - Complex file operations
   - Multiple modals
   - State dependencies
   - **Mitigation:** Thorough dependency analysis, incremental extraction

2. **Reports Tab:**
   - PDF generation complexity
   - IIFE pattern removal
   - Calculation logic
   - **Mitigation:** Test PDF generation thoroughly, move helpers carefully

3. **Shared State:**
   - Many interdependencies
   - Risk of breaking existing functionality
   - **Mitigation:** Use Context API or state management library

### Low Risk Areas

1. **Overview Tab:** Simple, low complexity
2. **DSC-DIN Tab:** Isolated functionality
3. **GST Tab:** Country-specific, isolated

---

## Success Metrics

### Code Quality
- [ ] Main file < 4,000 lines
- [ ] Each tab component < 3,500 lines
- [ ] No component > 50 props (use Context if needed)
- [ ] All TypeScript errors resolved
- [ ] All tests passing

### Performance
- [ ] Tab switching < 500ms
- [ ] Initial page load improved
- [ ] Bundle size reduced
- [ ] Lazy loading working

### Maintainability
- [ ] Each tab is self-contained
- [ ] Clear separation of concerns
- [ ] Easy to find and modify code
- [ ] Reduced cognitive load

---

## Next Steps

1. **Review this plan** with the team
2. **Prioritize** based on business needs
3. **Start with Documents Tab** (highest impact)
4. **Follow the refactoring guide** step-by-step
5. **Test thoroughly** after each extraction
6. **Document** any new patterns or learnings

---

## Notes

- **Tracker Tab** extraction taught us valuable lessons
- Use the **REFACTORING_GUIDE.md** to avoid previous mistakes
- **Take time** to do dependency analysis properly
- **Test incrementally** - don't extract everything at once
- **Consider Context API** if props exceed 30-40

Good luck! 🚀
