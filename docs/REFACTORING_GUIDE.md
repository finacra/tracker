# Component Refactoring Guide

## Table of Contents
1. [Overview](#overview)
2. [Pre-Extraction Analysis](#pre-extraction-analysis)
3. [Dependency Discovery Process](#dependency-discovery-process)
4. [Step-by-Step Extraction Workflow](#step-by-step-extraction-workflow)
5. [Common Pitfalls & Solutions](#common-pitfalls--solutions)
6. [TypeScript Best Practices](#typescript-best-practices)
7. [JSX Structure Validation](#jsx-structure-validation)
8. [Testing & Validation](#testing--validation)
9. [Post-Extraction Checklist](#post-extraction-checklist)
10. [Alternative Approaches](#alternative-approaches)

---

## Overview

This guide provides a systematic approach to refactoring large React components by extracting sub-components. It's based on real-world experience and lessons learned from refactoring a 2,200+ line component.

### When to Refactor

- Component exceeds 500-800 lines
- Component has multiple distinct UI sections
- Component has performance issues (slow renders, large bundle size)
- Component is difficult to maintain or test
- Component has high coupling with parent (50+ props)

### Goals of Refactoring

- ✅ Improve maintainability
- ✅ Enable code splitting and lazy loading
- ✅ Reduce bundle size
- ✅ Improve performance
- ✅ Make components more testable
- ✅ Reduce cognitive load

---

## Pre-Extraction Analysis

### 1. Identify Component Boundaries

**Before starting, clearly define what you're extracting:**

```typescript
// Example: Extracting a "TrackerTab" component
// Start: Line 7608 - {activeTab === 'tracker' && (
// End: Line 9809 - )}
```

**Questions to answer:**
- What is the exact start and end of the JSX block?
- Are there any conditional renders that affect boundaries?
- Are there any shared modals/components that should stay in parent?
- **Which modals belong to this tab vs. other tabs?** (Check state ownership)
- **Are there any tracker-specific modals mixed in?** (Common mistake)

### 2. Create a Dependency Inventory

**Create a checklist before extraction:**

```markdown
## Dependency Inventory Template

### State Variables
- [ ] List all useState variables used
- [ ] List all useMemo values used
- [ ] List all useCallback functions used
- [ ] List all useRef values used

### Functions
- [ ] List all function calls (both defined and imported)
- [ ] List all event handlers
- [ ] List all utility functions
- [ ] List all helper functions defined inline

### Imports
- [ ] List all imports needed
- [ ] Check for server actions
- [ ] Check for utility functions
- [ ] Check for hooks

### Props from Parent
- [ ] List all variables accessed from parent scope
- [ ] List all functions called from parent
- [ ] List all state setters needed

### Constants & Arrays
- [ ] List all constants defined inline
- [ ] List all arrays defined inline (months, quarters, etc.)
- [ ] List all configuration objects
```

---

## Dependency Discovery Process

### Step 1: Static Analysis

**Use grep/search to find all dependencies:**

```bash
# Find all variable usages
grep -n "variableName" path/to/component.tsx

# Find all function calls
grep -n "functionName(" path/to/component.tsx

# Find all imports
grep -n "^import" path/to/component.tsx

# Find all useState/useMemo/useCallback
grep -n "useState\|useMemo\|useCallback" path/to/component.tsx
```

### Step 2: Manual Code Review

**Read through the entire section to be extracted:**

1. **Start from the beginning** of the JSX block
2. **Note every variable** that's referenced
3. **Note every function** that's called
4. **Note every import** that might be needed
5. **Note every inline definition** (functions, arrays, constants)

### Step 3: Create Dependency Map

**Document all dependencies in a structured format:**

```typescript
// Example Dependency Map
const dependencies = {
  state: [
    'trackerView',
    'isLoadingRequirements',
    'selectedTrackerFY',
    // ... all state variables
  ],
  setters: [
    'setTrackerView',
    'setSelectedTrackerFY',
    'setRequirementForm',
    // ... all state setters
  ],
  functions: [
    'handleStatusChange',
    'refreshRequirements',
    'generateICSFile',
    // ... all functions
  ],
  imports: [
    'getRegulatoryRequirements',
    'updateRequirementStatus',
    'formatCurrency',
    // ... all imports
  ],
  computed: [
    'filteredRequirements',
    'groupedByCategory',
    'displayRequirements',
    // ... all useMemo values
  ],
  constants: [
    'months',
    'quarters',
    'financialYears',
    // ... all constants/arrays
  ],
  props: [
    'user',
    'currentCompany',
    'countryCode',
    // ... all props from parent
  ]
}
```

### Step 4: Identify Missing Dependencies

**Common missing dependencies to check:**

- ✅ Functions defined in parent but used in child
- ✅ Constants/arrays defined inline in parent
- ✅ State variables accessed but not passed as props
- ✅ Utility functions imported in parent but needed in child
- ✅ Context values (if using Context API)
- ✅ Custom hooks used in parent
- ✅ **Modal ownership** - Which modals belong to this tab vs. other tabs?
- ✅ **Data structure consistency** - Do state types match between parent and child?
- ✅ **Tracker-specific code** - Are there any tracker modals/state mixed in?

**Modal Ownership Analysis:**
```typescript
// For each modal in the JSX block:
// 1. List all state variables it uses
// 2. Check if those variables belong to this tab or another
// 3. Example:
//    Modal: "Document Upload Modal from Tracker"
//    Uses: documentUploadModal, regulatoryRequirements, selectedRequirements
//    These are tracker state → Modal belongs in TrackerTab, NOT DocumentsTab
```

---

## Step-by-Step Extraction Workflow

### Phase 1: Preparation (Do NOT extract yet)

#### 1.1 Create the New Component File

```typescript
// app/data-room/components/NewComponent.tsx
'use client'

import React from 'react'
// We'll add imports as we discover them

interface NewComponentProps {
  // We'll add props as we discover them
  [key: string]: any
}

export default function NewComponent({
  ...props
}: NewComponentProps) {
  // Component will go here
  return null // Placeholder
}
```

#### 1.1.1 File Creation Best Practice (250+ Lines)

**⚠️ CRITICAL: For large files (250+ lines), use incremental creation:**

1. **Create empty file first** - Create the file with minimal skeleton:
   ```typescript
   // app/data-room/components/LargeComponent.tsx
   'use client'
   
   export default function LargeComponent() {
     return null
   }
   ```

2. **Save in small chunks** - Add code incrementally (50-100 lines at a time):
   - First: Imports and interface
   - Second: State declarations
   - Third: Helper functions (one at a time)
   - Fourth: JSX sections (one section at a time)
   - Save after each chunk

3. **Why this matters:**
   - Prevents tool timeouts
   - Prevents losing entire file if process ends prematurely
   - Allows validation at each step
   - Easier to debug issues

**Example workflow for 500-line component:**
```
1. Create file with skeleton → Save
2. Add imports (20 lines) → Save
3. Add interface (30 lines) → Save
4. Add state (50 lines) → Save
5. Add first helper function (40 lines) → Save
6. Add second helper function (40 lines) → Save
7. Add first JSX section (100 lines) → Save
8. Add second JSX section (100 lines) → Save
9. Continue...
```

**Never write 250+ lines in a single operation!**

#### 1.2 Create Props Interface

**Based on your dependency map, create the interface:**

```typescript
interface NewComponentProps {
  // State
  stateVar1: string
  setStateVar1: (value: string) => void
  
  // Functions
  handleAction: (id: string) => Promise<void>
  
  // Data
  dataArray: any[]
  
  // Computed values
  filteredData: any[]
  
  // ... all dependencies from your map
}
```

#### 1.3 Update Parent to Use New Component

```typescript
// In parent component
import NewComponent from './components/NewComponent'

// In JSX
{activeTab === 'target' && (
  <Suspense fallback={<LoadingSpinner />}>
    <NewComponent
      stateVar1={stateVar1}
      setStateVar1={setStateVar1}
      handleAction={handleAction}
      // ... pass all props
    />
  </Suspense>
)}
```

### Phase 2: Extraction

#### 2.1 Copy JSX Block

**Copy the exact JSX block from parent to child:**

```typescript
// In NewComponent.tsx
export default function NewComponent({
  ...allProps
}: NewComponentProps) {
  return (
    <div>
      {/* Paste the exact JSX here */}
    </div>
  )
}
```

#### 2.2 Add All Imports

**Add all necessary imports to the new component:**

```typescript
import React from 'react'
import { action1, action2 } from '@/app/actions'
import { utility1, utility2 } from '@/lib/utils'
import { hook1 } from '@/hooks'
// ... all imports from dependency map
```

#### 2.3 Move Inline Definitions

**Move functions/constants defined inline:**

```typescript
// If parent has:
const months = ['Jan', 'Feb', ...]

// Move to child component:
export default function NewComponent({...}) {
  const months = ['Jan', 'Feb', ...] // Define here
  // OR pass as prop if used elsewhere
}
```

#### 2.4 Update All References

**Replace parent-scope references with props:**

```typescript
// Before (in parent):
{someVariable}

// After (in child):
{props.someVariable}
// OR if destructured:
{someVariable} // if in destructured props
```

### Phase 3: Validation

#### 3.0 Parent Structure Validation (DO THIS FIRST!)

**⚠️ CRITICAL: After removing large JSX blocks, validate parent structure IMMEDIATELY**

```bash
# After removing JSX from parent:
# 1. Count opening and closing divs in parent
grep -c "<div" parent.tsx
grep -c "</div>" parent.tsx
# Should be equal

# 2. Check for orphaned closing tags
# 3. Verify all containers are properly closed
# 4. Check for missing wrapper divs

# Common issues:
# - Missing closing div for main content container
# - Orphaned closing tags from removed JSX
# - Unclosed conditionals
```

**Why this matters:**
- Removing 3,400+ lines can break parent structure
- Parent structure issues cause cascading errors
- Fix parent FIRST, then move to child component

#### 3.1 JSX Structure Check (Child Component)

**Verify balanced tags:**

```bash
# Count opening and closing divs
grep -c "<div" component.tsx
grep -c "</div>" component.tsx
# Should be equal

# Check for balanced JSX
# Look for:
# - Matching opening/closing tags
# - Proper nesting
# - No orphaned tags
```

#### 3.2 TypeScript Check

**⚠️ Do comprehensive type audit, not iterative fixes:**

```bash
# Find ALL potential implicit any issues:
grep -n "\.map(" component.tsx | grep -v ":"
grep -n "\.filter(" component.tsx | grep -v ":"
grep -n "\.some(" component.tsx | grep -v ":"
grep -n "prev =>" component.tsx

# Fix ALL at once:
# 1. Add type annotations to all callback parameters
# 2. Add type annotations to all map/filter/some callbacks
# 3. Fix all state type definitions
# 4. Verify all props types
# 5. Check for data structure mismatches (e.g., emailData structure)
```

**Run TypeScript compiler:**

```bash
npm run build
# OR
npx tsc --noEmit
```

**Fix all TypeScript errors:**
- Add type annotations to all callback parameters
- Add type annotations to all map/filter callbacks
- Ensure all props are properly typed
- **Fix all types in one pass, not iteratively**

#### 3.3 Runtime Check

**Test the component:**
- Navigate to the page
- Verify component renders
- Test all interactions
- Check console for errors

---

## Real-World Lessons: Documents Tab Refactoring

### Critical Mistakes & Learnings

This section documents actual mistakes and learnings from refactoring a 3,400+ line Documents tab component.

#### ⚠️ Mistake 1: Incomplete Dependency Analysis

**What Happened:**
- Started extraction without complete dependency inventory
- Discovered dependencies reactively as errors appeared
- Missed tracker-specific modals that were included in Documents tab JSX

**Impact:** High - Had to remove ~700 lines of tracker-specific code after extraction

**Lesson:**
```markdown
ALWAYS do complete dependency analysis BEFORE extraction:
1. Read entire JSX block to be extracted
2. List ALL modals and identify ownership (which tab do they belong to?)
3. Check which state variables each modal uses
4. Identify shared vs. tab-specific modals
5. Create complete dependency map
```

**Modal Ownership Analysis:**
```typescript
// For each modal, ask:
// 1. Which state variables does it use?
// 2. Do those state variables belong to this tab or another?
// 3. Example:
//    - Document Upload Modal from Tracker uses:
//      - documentUploadModal (tracker state) ❌
//      - regulatoryRequirements (tracker state) ❌
//      → This modal belongs in TrackerTab, NOT DocumentsTab
```

#### ⚠️ Mistake 2: JSX Structure Validation Too Late

**What Happened:**
- Extracted JSX without validating structure
- Discovered 11+ missing closing divs only after build errors
- Had to fix structure issues reactively

**Impact:** High - Multiple build iterations, wasted time

**Lesson:**
```markdown
VALIDATION PRIORITY ORDER (DO NOT SKIP):
1. JSX Structure (balanced tags) ← DO THIS FIRST
2. TypeScript Types
3. Runtime Functionality
```

**Immediate Validation Checklist:**
```bash
# Immediately after extraction:
1. Count opening/closing divs (should match)
2. Validate JSX nesting
3. Check for orphaned tags
4. Verify all conditionals are closed
5. Fix structure BEFORE moving to TypeScript errors
```

#### ⚠️ Mistake 3: Parent Structure Not Validated After Extraction

**What Happened:**
- Removed 3,400+ lines of JSX from parent
- Didn't immediately check if parent structure was still valid
- Discovered missing closing div for "Main Content" container only after build error

**Impact:** High - This was the "impatient move" that caused cascading errors

**The Impatient Move:**
```typescript
// ❌ What I did (WRONG):
1. Extracted DocumentsTab component
2. Replaced JSX in parent with <DocumentsTab />
3. Moved on to fixing DocumentsTab issues
4. Only discovered parent had missing closing divs after build error

// ✅ What I should have done:
1. Extracted DocumentsTab component
2. Replaced JSX in parent with <DocumentsTab />
3. IMMEDIATELY validate parent structure (count divs, check nesting)
4. Fix parent structure issues FIRST
5. THEN move to DocumentsTab issues
```

**Lesson:**
```markdown
AFTER removing large JSX blocks:
1. Immediately validate parent structure
2. Count all opening/closing tags
3. Verify all containers are properly closed
4. Fix parent issues BEFORE moving forward
5. Don't assume parent structure is fine
```

#### ⚠️ Mistake 4: TypeScript Fixes Done Iteratively

**What Happened:**
- Fixed TypeScript errors one at a time as they appeared
- Multiple build iterations (periodType → form → pattern → p → frequency → emailData)
- Could have been done in one comprehensive pass

**Impact:** Medium - Wasted time, multiple build cycles

**Lesson:**
```typescript
// ❌ Iterative approach (slow):
npm run build → Fix periodType error
npm run build → Fix form error
npm run build → Fix pattern error
// ... repeat 6+ times

// ✅ Comprehensive approach (fast):
1. Search for ALL implicit any patterns:
   - .map( without type annotations
   - .filter( without type annotations
   - .some( without type annotations
   - setState(prev => without type annotations
2. Fix ALL at once
3. Check all state type definitions
4. Verify all props types
5. Build once
```

**Comprehensive Type Audit Script:**
```bash
# Find all potential implicit any issues:
grep -n "\.map(" component.tsx | grep -v ":"
grep -n "\.filter(" component.tsx | grep -v ":"
grep -n "\.some(" component.tsx | grep -v ":"
grep -n "prev =>" component.tsx
```

#### ⚠️ Mistake 5: Tracker-Specific Modals Left in DocumentsTab

**What Happened:**
- Included "Document Upload Modal from Tracker", "Bulk Action Modal", "Compliance Score Modal" in DocumentsTab
- These referenced undefined variables (documentUploadModal, regulatoryRequirements, etc.)
- Had to remove ~700 lines of tracker-specific code later

**Impact:** Medium - Wasted extraction effort, had to remove code

**Lesson:**
```typescript
// During dependency analysis, identify modal ownership:
const modalOwnership = {
  // Documents Tab Modals (use documents state):
  'Export Modal': ['vaultDocuments', 'isExportModalOpen'],
  'Send Documents Modal': ['vaultDocuments', 'selectedDocumentsToSend'],
  'Upload Modal': ['uploadFormData', 'isUploadModalOpen'],
  'Storage Breakdown Modal': ['isStorageBreakdownOpen', 'vaultDocuments'],
  
  // Tracker Tab Modals (use tracker state):
  'Document Upload Modal from Tracker': ['documentUploadModal', 'regulatoryRequirements'], // ❌
  'Bulk Action Modal': ['isBulkActionModalOpen', 'selectedRequirements'], // ❌
  'Compliance Score Modal': ['isComplianceScoreModalOpen', 'regulatoryRequirements'], // ❌
}

// Decision: Only extract modals that use documents state
```

#### ⚠️ Mistake 6: Email Data Structure Mismatch

**What Happened:**
- Original code used `to/cc/bcc` structure
- DocumentsTab expected `recipients/body/includeLinks/includeAttachments`
- Had to update multiple references

**Impact:** Low - Easy to fix but should have been caught earlier

**Lesson:**
```typescript
// Before extraction, verify data structure consistency:
1. What is the actual emailData structure in parent?
2. Does DocumentsTab use the same structure?
3. If different, which one is correct?
4. Update to match BEFORE extraction
```

---

### New Best Practices

#### 1. Modal Ownership Analysis

**Before extraction, for each modal:**
```typescript
// Ask these questions:
1. Which state variables does this modal use?
2. Do those state variables belong to this tab or another?
3. If they belong to another tab, the modal should stay in parent or move to that tab
4. Document modal ownership in dependency map
```

#### 2. JSX Structure Validation Priority

**Always validate in this order:**
```
Priority 1: JSX Structure (balanced tags) ← DO FIRST
Priority 2: TypeScript Types
Priority 3: Runtime Functionality
```

**Immediate validation after extraction:**
```bash
# Count tags
grep -c "<div" component.tsx
grep -c "</div>" component.tsx
# Should be equal

# Check for common issues:
- Orphaned closing tags
- Missing container divs
- Unclosed conditionals
- Unbalanced nesting
```

#### 3. Parent Validation After Extraction

**After removing large JSX blocks:**
```markdown
1. IMMEDIATELY validate parent structure
2. Count all opening/closing tags
3. Verify all containers are properly closed
4. Check for orphaned closing tags
5. Fix parent issues BEFORE moving forward
6. Don't assume parent structure is fine
```

#### 4. Comprehensive Type Audit

**Instead of fixing types iteratively:**
```typescript
// Do comprehensive audit:
1. Search for ALL implicit any patterns
2. List all callback parameters without types
3. List all state type mismatches
4. Fix ALL at once
5. Build once
```

#### 5. Complete Dependency Analysis

**Before extraction, create complete inventory:**
```markdown
- [ ] Read entire block to be extracted
- [ ] List every variable referenced
- [ ] List every function called
- [ ] List every import needed
- [ ] Identify modal ownership
- [ ] Check for shared vs. local state
- [ ] Verify data structure consistency
- [ ] Create complete dependency map
```

---

### The Impatient Move (What NOT to Do)

**The biggest mistake:** Removing large JSX blocks without validating parent structure.

**Why it's impatient:**
- Assumes parent structure is fine
- Doesn't verify after large removal
- Causes cascading errors
- Wastes time fixing issues reactively

**The fix:**
```markdown
ALWAYS validate parent structure immediately after:
- Removing large JSX blocks (>500 lines)
- Extracting components
- Making structural changes
```

---

## Real-World Lessons: Reports Tab Refactoring

### What Went Better This Time

This section documents improvements and new learnings from refactoring a 1,800+ line Reports tab component that used an IIFE pattern.

#### ✅ Improvement 1: IIFE Pattern Made Boundaries Clear

**What Happened:**
- Reports tab used IIFE pattern: `{activeTab === 'reports' && (() => { ... })()}`
- Clear start/end boundaries made extraction easier
- All code was self-contained within the IIFE

**Lesson:**
```markdown
IIFE patterns can actually HELP extraction if:
1. Boundaries are clearly defined (start/end markers)
2. All code is self-contained
3. Helper functions are clearly separated from JSX

Extraction strategy for IIFE:
1. Extract helper functions first
2. Extract statistics calculations second
3. Extract JSX third
4. Remove IIFE wrapper last
```

**Best Practice:**
```typescript
// Step 1: Extract helpers
const parseDateForReports = (dateStr: string) => { ... }
const calculateDelay = (dueDateStr: string, status: string) => { ... }

// Step 2: Extract calculations
const statistics = useMemo(() => { ... }, [deps])

// Step 3: Extract JSX
return <div>...</div>

// Step 4: Remove IIFE wrapper in parent
// Before: {activeTab === 'reports' && (() => { ... })()}
// After: {activeTab === 'reports' && <ReportsTab {...props} />}
```

#### ✅ Improvement 2: Using Scripts for Large Block Removal

**What Happened:**
- Had to remove ~1,800 lines of IIFE code from parent
- Used PowerShell script to precisely remove the block
- Avoided manual deletion errors

**Lesson:**
```powershell
# For very large removals (>1,000 lines), use scripts:
$content = Get-Content "file.tsx" -Raw
$startMarker = "        {/* Comment marker */}"
$endMarker = "        {activeTab === 'next' && ("
$startIndex = $content.IndexOf($startMarker)
$endIndex = $content.IndexOf($endMarker)
# Remove block precisely
```

**When to Use Scripts:**
- Removing blocks >1,000 lines
- Multiple similar removals
- Need precise boundary control
- Want to avoid manual errors

#### ✅ Improvement 3: Following the Guide Prevented Mistakes

**What Happened:**
- Applied lessons from Documents tab refactoring
- No tracker-specific code mixed in
- No modal ownership issues
- Build succeeded on first try

**Lesson:**
```markdown
Documentation from previous refactorings is VALUABLE:
1. Read the guide before starting
2. Follow the checklist
3. Apply lessons learned
4. Document new learnings for next time
```

#### ✅ Improvement 4: Well-Structured Calculations Were Easy to Extract

**What Happened:**
- Statistics calculations were already wrapped in useMemo
- Helper functions were clearly defined
- PDF generation was self-contained

**Lesson:**
```typescript
// Well-structured code is easier to extract:
const statistics = useMemo(() => {
  // All calculations here
  return { total, completed, overdue, ... }
}, [displayRequirements])

// vs. scattered calculations throughout JSX
```

**Best Practice:**
- Use useMemo/useCallback for complex calculations
- Keep helper functions at component top
- Group related logic together
- Makes extraction straightforward

### What We'd Do Differently

#### 🔄 Improvement Opportunity 1: Read Entire Block First

**What We Did:**
- Started extracting before reading the full IIFE block
- Discovered helper functions as we went

**Better Approach:**
```markdown
1. Read the ENTIRE block to be extracted (lines X-Y)
2. List ALL helper functions
3. List ALL statistics calculations
4. List ALL JSX sections
5. Create complete dependency map
6. THEN start extraction
```

**Pre-Extraction Checklist:**
```markdown
- [ ] Read entire block (all 1,800+ lines)
- [ ] List all helper functions (parseDateForReports, calculateDelay, etc.)
- [ ] List all statistics calculations (useMemo blocks)
- [ ] List all export functions (CSV, PDF)
- [ ] List all JSX sections
- [ ] Identify dependencies for each section
- [ ] Create complete dependency map
- [ ] THEN start extraction
```

#### 🔄 Improvement Opportunity 2: Extract in Phases

**What We Did:**
- Extracted everything at once (helpers + calculations + JSX)

**Better Approach for Large Blocks:**
```markdown
Phase 1: Extract helper functions
  - Move parseDateForReports, calculateDelay, etc.
  - Test build
  - Fix any issues

Phase 2: Extract calculations
  - Move useMemo blocks
  - Test build
  - Fix any issues

Phase 3: Extract JSX
  - Move return statement
  - Test build
  - Fix any issues

Phase 4: Remove original code
  - Remove IIFE from parent
  - Test build
  - Validate structure
```

**Benefits:**
- Smaller, incremental changes
- Easier to debug
- Can test at each phase
- Less overwhelming

#### 🔄 Improvement Opportunity 3: Create Dependency Matrix Beforehand

**What We Did:**
- Identified dependencies reactively during extraction

**Better Approach:**
```typescript
// Create BEFORE extraction:
const ReportsTabDependencies = {
  state: {
    'isGeneratingEnhancedPDF': { owner: 'parent', type: 'boolean' },
    'pdfGenerationProgress': { owner: 'parent', type: 'object' },
    'isComplianceScoreModalOpen': { owner: 'parent', type: 'boolean' },
  },
  functions: {
    'calculateDelayMemoized': { owner: 'parent', type: 'callback' },
    'calculatePenaltyMemoized': { owner: 'parent', type: 'callback' },
    'normalizeDate': { owner: 'parent', type: 'function' },
    'formatDate': { owner: 'parent', type: 'function' },
  },
  data: {
    'displayRequirements': { owner: 'parent', type: 'computed' },
    'currentCompany': { owner: 'parent', type: 'object' },
    'countryCode': { owner: 'parent', type: 'string' },
    'countryConfig': { owner: 'parent', type: 'object' },
    'user': { owner: 'parent', type: 'object' },
  },
  helpers: {
    'parseDateForReports': { owner: 'local', action: 'move' },
    'calculateDelay': { owner: 'local', action: 'move' },
    'calculatePenalty': { owner: 'local', action: 'move' },
    'exportToCSV': { owner: 'local', action: 'move' },
  },
  calculations: {
    'statistics': { owner: 'local', action: 'move', uses: ['displayRequirements'] },
    'totalPenalty': { owner: 'local', action: 'move', uses: ['displayRequirements', 'countryConfig'] },
    'overdueCompliances': { owner: 'local', action: 'move', uses: ['displayRequirements'] },
  },
  exports: {
    'exportComplianceReport': { owner: 'local', action: 'move' },
    'exportOverdueReport': { owner: 'local', action: 'move' },
    'exportPDFReport': { owner: 'local', action: 'move', size: 'large' },
  }
}
```

#### 🔄 Improvement Opportunity 4: Validate Parent Structure Immediately

**What We Did:**
- Validated structure after completing extraction

**Better Approach:**
```markdown
Immediate Validation Sequence:
1. Remove IIFE block from parent
2. IMMEDIATELY count divs in parent (should match)
3. Fix parent structure issues FIRST
4. THEN validate component structure
5. THEN fix TypeScript errors
```

**Validation Script:**
```powershell
# Immediately after removing large block:
$content = Get-Content "parent.tsx" -Raw
$openDivs = ([regex]::Matches($content, '<div')).Count
$closeDivs = ([regex]::Matches($content, '</div>')).Count
Write-Host "Open: $openDivs, Close: $closeDivs, Diff: $($openDivs - $closeDivs)"
# Should be 0 difference
```

### New Insights from Reports Tab

#### 💡 Insight 1: IIFE Patterns Can Be Extraction-Friendly

**Finding:**
- IIFE patterns make boundaries very clear
- Self-contained code is easier to extract
- Wrapper removal is straightforward

**Lesson:**
```typescript
// IIFE pattern structure:
{activeTab === 'reports' && (() => {
  // Helper functions
  const helper1 = () => { ... }
  
  // Calculations
  const stats = useMemo(() => { ... })
  
  // JSX
  return <div>...</div>
})()}

// Makes extraction clear:
// 1. Extract everything inside IIFE
// 2. Remove IIFE wrapper
// 3. Replace with component
```

#### 💡 Insight 2: Large Self-Contained Functions Are Good Candidates

**Finding:**
- `exportPDFReport` was ~1,200 lines but completely self-contained
- No external dependencies beyond props
- Easy to move as a single unit

**Lesson:**
```typescript
// Large functions that are self-contained:
- exportPDFReport (1,200 lines) ✅ Easy to extract
- PDF generation logic ✅ Self-contained
- Statistics calculations ✅ Well-structured

// vs. functions with many external dependencies:
- Functions that access parent state directly ❌ Harder
- Functions that call many parent functions ❌ Harder
```

#### 💡 Insight 3: Build Success on First Try Is Achievable

**Finding:**
- Following the guide led to successful build on first attempt
- No cascading errors
- No structural issues

**Lesson:**
```markdown
Success factors:
1. Complete dependency analysis
2. Following established patterns
3. Systematic extraction
4. Immediate validation
5. Comprehensive type checking

Result: Build success on first try ✅
```

### Recommendations for Future Refactorings

#### 1. Create Tab-Specific Refactoring Checklist

```markdown
## [Tab Name] Refactoring Checklist

### Pre-Extraction
- [ ] Read entire block (lines X-Y)
- [ ] Identify pattern (IIFE, inline, conditional)
- [ ] List all helper functions
- [ ] List all calculations
- [ ] List all export functions
- [ ] Create dependency matrix
- [ ] Plan extraction phases

### Extraction Phases
- [ ] Phase 1: Extract helpers (test build)
- [ ] Phase 2: Extract calculations (test build)
- [ ] Phase 3: Extract JSX (test build)
- [ ] Phase 4: Remove original (test build)

### Validation
- [ ] Validate parent structure immediately
- [ ] Validate component structure
- [ ] Comprehensive TypeScript audit
- [ ] Test build
- [ ] Test functionality
```

#### 2. Use Dependency Matrix Template

```typescript
// Template for dependency analysis:
const TabDependencies = {
  state: {
    // owner: 'parent' | 'local' | 'shared'
    // type: 'boolean' | 'string' | 'object' | 'array'
  },
  functions: {
    // owner: 'parent' | 'local'
    // type: 'callback' | 'function' | 'async'
  },
  data: {
    // owner: 'parent' | 'computed'
    // type: 'array' | 'object' | 'primitive'
  },
  helpers: {
    // action: 'move' | 'keep' | 'share'
  },
  calculations: {
    // uses: ['dependency1', 'dependency2']
  }
}
```

#### 3. Phased Extraction for Large Blocks

```markdown
For blocks >2,000 lines:
- Phase 1: Helpers (small, testable)
- Phase 2: Calculations (medium, testable)
- Phase 3: JSX (large, testable)
- Phase 4: Cleanup (remove original)

Each phase:
1. Extract
2. Test build
3. Fix issues
4. Move to next phase
```

---

## Common Pitfalls & Solutions

### Pitfall 1: Missing Props

**Symptom:**
```
Type error: Cannot find name 'variableName'
```

**Solution:**
1. Add to props interface
2. Add to component parameters
3. Pass from parent

**Prevention:**
- Complete dependency analysis before extraction
- Use TypeScript strict mode
- Build after each major change

### Pitfall 2: Unbalanced JSX

**Symptom:**
```
Parsing ecmascript source code failed
Unterminated regexp literal
```

**Solution:**
1. Count opening/closing tags
2. Verify nesting structure
3. Check for missing closing tags
4. Use JSX formatter/linter

**Prevention:**
- Use a JSX validator
- Extract in smaller chunks
- Verify structure before moving on

### Pitfall 3: Missing Imports

**Symptom:**
```
Cannot find module '@/path/to/module'
```

**Solution:**
1. Check parent component imports
2. Add all necessary imports to child
3. Verify import paths

**Prevention:**
- Document all imports during dependency analysis
- Copy imports from parent initially
- Remove unused imports after

### Pitfall 4: Inline Function Definitions

**Symptom:**
```
Cannot find name 'functionName'
```

**Solution:**
1. Move function to child component
2. OR pass as prop from parent
3. OR move to shared utility file

**Prevention:**
- Identify all inline functions during analysis
- Decide where they belong before extraction

### Pitfall 5: TypeScript Implicit Any

**Symptom:**
```
Parameter 'param' implicitly has an 'any' type
```

**Solution:**
```typescript
// Before
.map(item => item.value)

// After
.map((item: ItemType) => item.value)
```

**Prevention:**
- Enable TypeScript strict mode
- Type all callback parameters
- Use proper interfaces

### Pitfall 6: State Dependencies

**Symptom:**
```
Cannot access 'variable' before initialization
```

**Solution:**
1. Ensure state is defined before use
2. Check hook order (Rules of Hooks)
3. Move state definitions if needed

**Prevention:**
- Understand React Hooks rules
- Define all state at top of component
- Use useMemo/useCallback appropriately

### Pitfall 7: Tracker-Specific Code in Wrong Component

**Symptom:**
```
Cannot find name 'documentUploadModal'
Cannot find name 'regulatoryRequirements'
Cannot find name 'selectedRequirements'
```

**Cause:**
- Included modals/state from another tab (e.g., tracker modals in documents tab)
- Didn't identify modal ownership during dependency analysis

**Solution:**
1. Identify which state each modal uses
2. Check if that state belongs to this tab or another
3. Remove modals that belong to other tabs
4. Move modals to correct tab component

**Prevention:**
- **During dependency analysis, identify modal ownership**
- For each modal, list all state variables it uses
- Check if those variables belong to this tab
- Document modal ownership in dependency map

### Pitfall 8: IIFE Pattern Extraction Order

**Symptom:**
```
Cannot find name 'helperFunction'
Unexpected token ')'
Parsing error: Unexpected token
```

**Cause:**
- Extracting JSX before helper functions in IIFE patterns
- Removing IIFE wrapper before extracting all code
- Not following proper extraction sequence

**Solution:**
```typescript
// ❌ Wrong order:
1. Extract JSX first
2. Try to extract helpers (but they're still in parent)
3. Remove IIFE wrapper
4. Build fails

// ✅ Correct order:
1. Extract helper functions first
2. Extract calculations second
3. Extract JSX third
4. Remove IIFE wrapper last
5. Replace with component
```

**Best Practice:**
```markdown
For IIFE patterns: {activeTab === 'tab' && (() => { ... })()}

Extraction sequence:
1. Read entire IIFE block
2. List all helpers inside IIFE
3. Extract helpers to component
4. Extract calculations to component
5. Extract JSX to component
6. Remove IIFE wrapper from parent
7. Replace with lazy-loaded component
```

**Prevention:**
- Identify pattern type (IIFE, inline, conditional) before extraction
- Create extraction plan based on pattern
- Follow pattern-specific extraction sequence
- Test build after each phase

---

## TypeScript Best Practices

### 1. Always Type Callback Parameters

```typescript
// ❌ Bad
.map(item => item.value)
.filter(cat => cat.active)
setState(prev => ({ ...prev, value: newValue }))

// ✅ Good
.map((item: ItemType) => item.value)
.filter((cat: CategoryType) => cat.active)
setState((prev: StateType) => ({ ...prev, value: newValue }))
```

### 2. Define Proper Interfaces

```typescript
// ❌ Bad
interface Props {
  [key: string]: any
}

// ✅ Good
interface Props {
  id: string
  name: string
  onAction: (id: string) => Promise<void>
  data: DataType[]
  // ... specific types
}
```

### 3. Use Type Guards

```typescript
// ✅ Good
if (typeof value === 'string') {
  // TypeScript knows value is string here
}
```

### 4. Avoid Implicit Any

```typescript
// ❌ Bad
function process(data) { ... }

// ✅ Good
function process(data: ProcessDataType): ProcessedResult { ... }
```

---

## JSX Structure Validation

### Manual Validation Checklist

- [ ] Count all opening `<div>` tags
- [ ] Count all closing `</div>` tags
- [ ] Verify they match
- [ ] Check for proper nesting
- [ ] Verify all conditional renders are closed
- [ ] Check for unclosed JSX expressions `{...}`
- [ ] Verify all template literals are closed
- [ ] Check for balanced parentheses in expressions

### Automated Validation

```bash
# Use a linter
npm run lint

# Use a formatter
npm run format

# Use TypeScript compiler
npm run build
```

### Common JSX Issues

1. **Unclosed Tags:**
   ```jsx
   // ❌ Bad
   <div>
     <span>Text
   </div>
   
   // ✅ Good
   <div>
     <span>Text</span>
   </div>
   ```

2. **Unbalanced Conditionals:**
   ```jsx
   // ❌ Bad
   {condition && (
     <div>
       Content
   
   // ✅ Good
   {condition && (
     <div>
       Content
     </div>
   )}
   ```

3. **Unclosed Template Literals:**
   ```jsx
   // ❌ Bad
   className={`text-${color
   
   // ✅ Good
   className={`text-${color}`}
   ```

---

## Testing & Validation

### Build Validation

```bash
# Always run build after extraction
npm run build

# Check for:
# - TypeScript errors
# - Syntax errors
# - Import errors
# - Missing dependencies
```

### Runtime Validation

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Navigate to component:**
   - Open the page in browser
   - Check browser console for errors
   - Verify component renders

3. **Test interactions:**
   - Click all buttons
   - Test all forms
   - Verify all modals work
   - Test all filters/search

4. **Check performance:**
   - Verify lazy loading works
   - Check bundle size
   - Monitor render times

### TypeScript Validation

```bash
# Run TypeScript compiler
npx tsc --noEmit

# Should show:
# - No errors
# - No warnings (ideally)
```

---

## Post-Extraction Checklist

### Code Quality

- [ ] All TypeScript errors resolved
- [ ] All props properly typed
- [ ] All imports are correct
- [ ] No unused imports
- [ ] No unused variables
- [ ] Code is properly formatted

### Functionality

- [ ] Component renders correctly
- [ ] All interactions work
- [ ] All modals/forms work
- [ ] All filters/search work
- [ ] All data displays correctly
- [ ] No console errors

### Performance

- [ ] Component lazy loads correctly
- [ ] No unnecessary re-renders
- [ ] Bundle size is acceptable
- [ ] Performance is improved (if that was the goal)

### Maintainability

- [ ] Component is self-contained
- [ ] Props interface is clear
- [ ] Code is well-organized
- [ ] Comments are added where needed
- [ ] Component is testable

---

## Windows-Specific Issues: EBUSY File Locking

### The Problem

On Windows, you may encounter `EBUSY: resource busy or locked` errors during refactoring, especially with large files like `app/data-room/page.tsx`. This happens because:

1. **Tailwind CSS scans files** - During compilation, Tailwind reads all files in `content` paths to find class names
2. **Dev server keeps files open** - Turbopack/Next.js keeps files in memory for hot reloading
3. **Editor has file open** - Cursor/VS Code keeps file handles open
4. **Windows file locking** - Windows is more aggressive than Unix systems about preventing concurrent file access

### Why It Happens After Every Refactor

- Large file edits trigger Tailwind to re-scan
- Multiple processes (dev server, editor, Tailwind) try to access the same file
- Windows locks the file → EBUSY error

### Prevention Strategy

**Before making large edits:**

1. **Close the file in your editor** - Close `app/data-room/page.tsx` in Cursor/VS Code
2. **Stop the dev server** - Press Ctrl+C in the terminal running `npm run dev`
3. **Wait 2-3 seconds** - Let file handles release
4. **Make your edits** - Edit the file
5. **Restart dev server** - Run `npm run dev` again

**Alternative: Use build instead of dev for validation**

```bash
# Instead of relying on dev server during refactoring
npm run build  # Validates without file locking issues
```

### Quick Fix When It Happens

```powershell
# Kill all node processes
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# Wait a moment
Start-Sleep -Seconds 2

# Touch the file to release locks
$file = "app\data-room\page.tsx"
$content = [System.IO.File]::ReadAllText((Resolve-Path $file).Path)
[System.IO.File]::WriteAllText((Resolve-Path $file).Path, $content, [System.Text.Encoding]::UTF8)

# Restart dev server
npm run dev
```

### Long-Term Solution

Consider using `npm run build` for validation during refactoring instead of `npm run dev`. The build process handles file locking better than the dev server with hot reloading.

---

## Alternative Approaches

### When Component Has Too Many Props (50+)

**Consider these alternatives:**

#### 1. Context API

```typescript
// Create a context for shared state
const TrackerContext = createContext<TrackerContextType>()

// Use in parent
<TrackerContext.Provider value={allState}>
  <TrackerTab />
</TrackerContext.Provider>

// Use in child
const { state1, state2, setState1 } = useContext(TrackerContext)
```

#### 2. Custom Hooks

```typescript
// Extract logic to custom hook
function useTrackerState() {
  const [state1, setState1] = useState()
  const [state2, setState2] = useState()
  // ... all state logic
  
  return { state1, state2, setState1, setState2, ... }
}

// Use in component
const tracker = useTrackerState()
```

#### 3. State Management Library

```typescript
// Using Zustand, Redux, etc.
const useTrackerStore = create((set) => ({
  state1: '',
  setState1: (value) => set({ state1: value }),
  // ... all state
}))
```

#### 4. Smaller Sub-Components

```typescript
// Instead of one large component, extract smaller pieces:
<TrackerTab>
  <TrackerHeader />
  <TrackerFilters />
  <TrackerList />
  <TrackerModals />
</TrackerTab>
```

### When Component Has Complex Dependencies

**Consider:**

1. **Dependency Injection:**
   ```typescript
   // Pass dependencies as props
   <Component
     services={{
       api: apiService,
       storage: storageService,
     }}
   />
   ```

2. **Higher-Order Components:**
   ```typescript
   // Wrap with HOC that provides dependencies
   export default withTrackerDependencies(TrackerTab)
   ```

3. **Render Props:**
   ```typescript
   <TrackerProvider>
     {(tracker) => <TrackerTab {...tracker} />}
   </TrackerProvider>
   ```

---

## Tools & Commands

### Useful Commands

```bash
# Find all usages of a variable
grep -rn "variableName" app/

# Count lines in file
wc -l path/to/file.tsx

# Find all imports
grep -n "^import" path/to/file.tsx

# Find all function calls
grep -n "functionName(" path/to/file.tsx

# Count opening/closing tags
grep -c "<div" path/to/file.tsx
grep -c "</div>" path/to/file.tsx

# TypeScript check
npx tsc --noEmit

# Build check
npm run build

# Lint check
npm run lint
```

### Recommended Tools

- **TypeScript**: For type safety
- **ESLint**: For code quality
- **Prettier**: For code formatting
- **React DevTools**: For debugging
- **Bundle Analyzer**: For bundle size analysis

---

## Example: Complete Extraction Workflow

### Step 1: Identify Boundaries

```typescript
// Parent component: app/data-room/page.tsx
// Lines 7608-9809 contain the tracker tab JSX
```

### Step 2: Create Dependency Map

```typescript
const dependencies = {
  state: ['trackerView', 'isLoadingRequirements', ...],
  setters: ['setTrackerView', 'setSelectedTrackerFY', ...],
  functions: ['handleStatusChange', 'refreshRequirements', ...],
  imports: ['getRegulatoryRequirements', 'formatCurrency', ...],
  // ... complete list
}
```

### Step 3: Create Component File

```typescript
// app/data-room/components/TrackerTab.tsx
'use client'

import React from 'react'
// Add all imports from dependency map

interface TrackerTabProps {
  // Add all props from dependency map
}

export default function TrackerTab({
  // Destructure all props
}: TrackerTabProps) {
  // Define inline constants/functions
  const months = [...]
  
  return (
    // Paste JSX here
  )
}
```

### Step 4: Update Parent

```typescript
// In parent component
import { lazy, Suspense } from 'react'
const TrackerTab = lazy(() => import('./components/TrackerTab'))

// In JSX
{activeTab === 'tracker' && (
  <Suspense fallback={<LoadingSpinner />}>
    <TrackerTab
      // Pass all props from dependency map
      {...allProps}
    />
  </Suspense>
)}
```

### Step 5: Validate

```bash
# Run build
npm run build

# Fix all errors
# - Add missing props
# - Fix TypeScript errors
# - Fix JSX structure
# - Add missing imports

# Test in browser
npm run dev
```

---

## Key Takeaways

1. **Always do dependency analysis FIRST** - Don't extract until you know all dependencies
2. **Use TypeScript strict mode** - It will catch many issues early
3. **Validate JSX structure** - Count tags, verify nesting
4. **Test incrementally** - Extract → Build → Fix → Repeat
5. **Consider alternatives** - If props > 50, consider Context/State Management
6. **Document as you go** - Keep track of what you're doing
7. **Don't rush** - Take time to do it right the first time

### Critical Lessons from Real Refactoring

8. **Validate parent structure IMMEDIATELY after extraction** - Don't assume it's fine
9. **Identify modal ownership during dependency analysis** - Check which state each modal uses
10. **Fix JSX structure BEFORE TypeScript errors** - Structure issues cascade
11. **Do comprehensive type audit, not iterative fixes** - Fix all types at once
12. **Read the entire block before extraction** - Don't discover dependencies reactively
13. **IIFE patterns can help extraction** - Clear boundaries make extraction easier
14. **Use scripts for large block removal** - Prevents manual errors on 1000+ line removals
15. **Extract in phases for very large blocks** - Helpers → Calculations → JSX → Cleanup
16. **Create dependency matrix BEFORE extraction** - Systematic analysis prevents reactive fixes
17. **Well-structured code extracts easily** - useMemo/useCallback patterns are extraction-friendly
18. **Create file first, save incrementally for 250+ line files** - Prevents tool timeouts and data loss

---

## Quick Reference Checklist

### Before Extraction
- [ ] Read the ENTIRE block to be extracted (all lines)
- [ ] Identified exact component boundaries
- [ ] Identified pattern (IIFE, inline, conditional)
- [ ] Created complete dependency map/matrix
- [ ] Listed all state variables (with ownership)
- [ ] Listed all helper functions
- [ ] Listed all calculations (useMemo/useCallback)
- [ ] Listed all functions
- [ ] Listed all imports
- [ ] Listed all inline definitions
- [ ] Created props interface
- [ ] Planned extraction phases (for large blocks)
- [ ] Planned where inline code will go

### During Extraction
- [ ] **Created file first (empty skeleton if 250+ lines)**
- [ ] **Saved incrementally (50-100 line chunks for large files)**
- [ ] Created new component file
- [ ] Added all imports
- [ ] Phase 1: Extracted helper functions (if large block)
- [ ] Phase 2: Extracted calculations (if large block)
- [ ] Phase 3: Extracted JSX block
- [ ] Moved inline definitions
- [ ] Updated all references
- [ ] Added all props to interface
- [ ] Passed all props from parent
- [ ] Removed IIFE wrapper (if applicable)
- [ ] Used scripts for large block removal (if >1000 lines)

### After Extraction
- [ ] **IMMEDIATELY validated parent structure** (count tags, check nesting)
- [ ] Fixed parent structure issues FIRST
- [ ] Verified JSX structure in new component (balanced tags)
- [ ] Fixed all TypeScript errors (comprehensive audit, not iterative)
- [ ] Added type annotations to all callbacks
- [ ] Verified modal ownership (removed modals that belong to other tabs)
- [ ] Tested component renders
- [ ] Tested all interactions
- [ ] Verified lazy loading works
- [ ] Checked bundle size
- [ ] No console errors

---

## Conclusion

Refactoring large components is a complex task that requires careful planning and systematic execution. By following this guide, you can avoid common pitfalls and ensure a smooth refactoring process.

**Remember:**
- Preparation is 80% of the work
- TypeScript is your friend - use it
- Test incrementally
- Don't be afraid to refactor the refactoring if needed

Good luck! 🚀
