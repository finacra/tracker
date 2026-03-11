# Manual QA Test Checklist

## Test Environment
- **User**: excellencecircle91@gmail.com (Superadmin)
- **URL**: http://localhost:3000
- **Browser**: (Your browser)
- **Date**: $(date)

---

## 1. Authentication & Navigation ✅

### 1.1 Verify Login Status
- [ ] User is logged in as excellencecircle91@gmail.com
- [ ] Header shows user email/name
- [ ] No authentication errors in console

### 1.2 Navigation
- [ ] Navigate to `/data-room` - Should load successfully
- [ ] Navigate to `/admin` - Should load successfully (superadmin access)
- [ ] Navigate to `/team` - Should load successfully
- [ ] Navigate to `/onboarding` - Should load successfully
- [ ] Test browser back/forward buttons
- [ ] Test page refresh on each route

---

## 2. Tracker Tab - Compliance Requirements (See TRACKER_QA_TEST_CHECKLIST.md)

**⚠️ IMPORTANT**: The Tracker tab has its own comprehensive test checklist. See `docs/TRACKER_QA_TEST_CHECKLIST.md` for detailed Tracker testing.

### Quick Tracker Test Checklist:
- [ ] Navigate to Tracker tab
- [ ] View requirements list
- [ ] Create new requirement
- [ ] Update requirement status
- [ ] Edit requirement
- [ ] Delete requirement
- [ ] Switch companies (critical for UUID testing)
- [ ] Test filters and search
- [ ] Test calendar view
- [ ] Verify no UUID casting errors

---

## 3. Data Room - Core Functionality

### 3.1 Company Selection
- [ ] Company selector dropdown appears
- [ ] Can select different companies
- [ ] Company details load after selection
- [ ] No errors when switching companies
- [ ] URL updates with company parameter

### 3.2 Company Details Display
- [ ] Company name displays correctly
- [ ] Company type displays correctly
- [ ] Incorporation date displays (or "N/A" if null)
- [ ] Tax ID displays
- [ ] Registration ID displays
- [ ] Address displays (or empty if null)
- [ ] Phone number displays
- [ ] Industry categories display

### 3.3 Tabs Navigation
- [ ] Overview tab loads
- [ ] Documents tab loads
- [ ] Tracker tab loads
- [ ] Reports tab loads
- [ ] Notices tab loads
- [ ] GST tab loads
- [ ] DSC/DIN tab loads
- [ ] Can switch between tabs without errors

---

## 4. Document Management - CRUD Operations

### 4.1 CREATE - Single Document Upload
- [ ] Click "Upload Document" button
- [ ] Upload modal opens
- [ ] Select a file from system (try: PDF, DOCX, XLSX, JPG, PNG)
- [ ] Fill in document name
- [ ] Select folder/directory
- [ ] Fill optional fields:
  - [ ] Registration date
  - [ ] Expiry date
  - [ ] Frequency
  - [ ] Period type
  - [ ] Financial year
- [ ] Click "Upload"
- [ ] Success message appears
- [ ] Document appears in list immediately
- [ ] No errors in console
- [ ] Document count updates

### 4.2 CREATE - Bulk Document Upload
- [ ] Click "Bulk Upload" button
- [ ] Bulk upload modal opens
- [ ] Select multiple files (3-5 files)
- [ ] Files appear in list
- [ ] Can remove files from list
- [ ] Select folder for all files
- [ ] Click "Upload All"
- [ ] Progress indicator shows
- [ ] Success message appears
- [ ] All documents appear in list
- [ ] No errors in console

### 4.3 READ - View Document
- [ ] Click "View" button on a document
- [ ] Document opens in new tab/window
- [ ] Document displays correctly
- [ ] URL is valid and accessible
- [ ] No "Object not found" errors
- [ ] No RLS policy errors

### 4.4 READ - Preview Document
- [ ] Click "Preview" button on a document
- [ ] Preview modal opens
- [ ] Document preview displays
- [ ] Can close modal
- [ ] Works for PDF files
- [ ] Works for image files
- [ ] Shows appropriate message for unsupported formats

### 4.5 READ - Export/Download Document
- [ ] Click "Export" button on a document
- [ ] Download starts
- [ ] File downloads with correct name
- [ ] File is not corrupted
- [ ] Can open downloaded file
- [ ] No errors in console

### 4.6 READ - Document List & Filtering
- [ ] Documents list displays
- [ ] Can search documents by name
- [ ] Can filter by financial year
- [ ] Can filter by expiry status (all/expiring/expired)
- [ ] Can sort by:
  - [ ] Name (A-Z)
  - [ ] Name (Z-A)
  - [ ] Date (newest)
  - [ ] Date (oldest)
  - [ ] Expiry date
  - [ ] Folder
- [ ] Folder grouping works
- [ ] Version grouping works
- [ ] Can expand/collapse folders
- [ ] Can expand/collapse document versions

### 4.7 UPDATE - Document Metadata (if available)
- [ ] Check if edit functionality exists
- [ ] If yes, test editing document name
- [ ] If yes, test editing dates
- [ ] If yes, test editing folder
- [ ] Changes save correctly
- [ ] UI updates immediately

### 4.8 DELETE - Remove Document
- [ ] Click "Delete" or "Remove" button on a document
- [ ] Confirmation dialog appears
- [ ] Confirm deletion
- [ ] Success message appears
- [ ] Document disappears from list
- [ ] Document count updates
- [ ] No errors in console
- [ ] Document is actually deleted from storage

---

## 5. Company Switching

### 5.1 Switch Between Companies
- [ ] Select Company A from dropdown
- [ ] Data loads for Company A
- [ ] Select Company B from dropdown
- [ ] Data loads for Company B
- [ ] No UUID casting errors in console
- [ ] No "operator does not exist: uuid = text" errors
- [ ] Documents list updates
- [ ] Company details update
- [ ] All tabs work with new company

### 5.2 Multiple Rapid Switches
- [ ] Switch between 3-4 companies rapidly
- [ ] No race conditions
- [ ] Data loads correctly each time
- [ ] No memory leaks
- [ ] No console errors

---

## 6. Admin Panel Features

### 6.1 Admin Access
- [ ] Can access `/admin` page
- [ ] Superadmin status verified
- [ ] All admin tabs visible

### 6.2 Companies Management
- [ ] View all companies list
- [ ] Company details display correctly
- [ ] Can navigate to company data room from admin
- [ ] Company count is accurate

### 6.3 Users Management
- [ ] View all users
- [ ] User details display correctly
- [ ] Subscription information displays
- [ ] Company ownership displays

### 6.4 KPI Tracking
- [ ] Access Tracking System tab
- [ ] View KPI aggregations
- [ ] Filter by category
- [ ] Filter by KPI name
- [ ] Filter by company
- [ ] Filter by date range
- [ ] View detailed metrics
- [ ] No errors in console

### 6.5 Compliance Templates
- [ ] View compliance templates
- [ ] Create new template
- [ ] Edit existing template
- [ ] Delete template
- [ ] Apply templates to companies

### 6.6 Transaction History
- [ ] View transaction history
- [ ] Filter transactions
- [ ] Transaction details display

---

## 7. Team Management

### 7.1 View Team
- [ ] Navigate to `/team` page
- [ ] View owned companies
- [ ] View invited companies
- [ ] Team members list displays

### 7.2 Team Member Operations (if available)
- [ ] Add team member
- [ ] Remove team member
- [ ] Change team member role
- [ ] Invite team member

---

## 8. Error Handling & Edge Cases

### 7.1 Invalid Operations
- [ ] Try to upload file without selecting file
- [ ] Try to upload file without document name
- [ ] Try to delete document without confirmation
- [ ] Try to access non-existent company
- [ ] Verify appropriate error messages

### 7.2 Network Issues
- [ ] Test with slow network (throttle in DevTools)
- [ ] Test with offline mode
- [ ] Verify error handling

### 7.3 Large Files
- [ ] Upload large file (>10MB)
- [ ] Verify upload progress
- [ ] Verify success/failure handling

### 7.4 Special Characters
- [ ] Upload file with special characters in name
- [ ] Create document with special characters
- [ ] Search with special characters

---

## 8. Console & Performance

### 8.1 Console Errors
- [ ] No JavaScript errors in console
- [ ] No TypeScript errors
- [ ] No network errors (except expected 404s)
- [ ] No RLS policy errors
- [ ] No UUID casting errors

### 8.2 Performance
- [ ] Page load time < 3 seconds
- [ ] Document list loads < 2 seconds
- [ ] Upload completes in reasonable time
- [ ] No memory leaks (check DevTools Memory tab)
- [ ] No excessive re-renders

---

## 9. Browser Compatibility

### 9.1 Test in Different Browsers (if possible)
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari (if on Mac)

---

## 10. Mobile Responsiveness (if applicable)

### 10.1 Mobile View
- [ ] Open DevTools mobile view
- [ ] Test on mobile device size
- [ ] All buttons accessible
- [ ] Forms usable
- [ ] Modals display correctly

---

## Test Results Summary

### Critical Issues Found:
(List any blocking issues)

### Minor Issues Found:
(List non-blocking issues)

### Passed Tests:
(Count of passed tests)

### Failed Tests:
(Count of failed tests)

### Notes:
(Any additional observations)

---

## Sign-off

- **Tester**: _______________
- **Date**: _______________
- **Status**: ☐ Pass  ☐ Fail  ☐ Needs Review
