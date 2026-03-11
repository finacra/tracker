# Tracker Tab - QA Test Checklist

## Overview
The Tracker tab manages regulatory compliance requirements (CRUD operations).

## Test Environment
- **User**: excellencecircle91@gmail.com (Superadmin)
- **URL**: http://localhost:3000/data-room
- **Tab**: Tracker

---

## 1. Tracker Tab - Basic Functionality

### 1.1 Tab Access & Loading
- [ ] Navigate to Data Room
- [ ] Click on "Tracker" tab
- [ ] Tab loads without errors
- [ ] Requirements list displays
- [ ] No console errors

### 1.2 View Modes
- [ ] **List View**: Default view shows requirements in list
- [ ] **Calendar View**: Switch to calendar view
- [ ] Calendar displays requirements by date
- [ ] Can switch back to list view
- [ ] View preference persists (if implemented)

### 1.3 Requirements Display
- [ ] Requirements load for selected company
- [ ] Requirements display with correct status
- [ ] Due dates display correctly
- [ ] Categories display correctly
- [ ] Penalty information displays (if applicable)
- [ ] Required documents list displays

---

## 2. CREATE - Add New Requirement

### 2.1 Create Modal
- [ ] Click "Add Requirement" or "+" button
- [ ] Create modal opens
- [ ] All required fields are visible:
  - [ ] Category (dropdown)
  - [ ] Requirement name
  - [ ] Due date
  - [ ] Description (optional)
  - [ ] Penalty (optional)
  - [ ] Financial year (optional)
  - [ ] Compliance type (one-time/monthly/quarterly/annual)
- [ ] Form validation works

### 2.2 Create Requirement
- [ ] Fill in all required fields
- [ ] Select a category
- [ ] Enter requirement name
- [ ] Set due date
- [ ] Fill optional fields:
  - [ ] Description
  - [ ] Penalty amount
  - [ ] Penalty base amount
  - [ ] Financial year
  - [ ] Compliance type
  - [ ] Mark as critical (if available)
- [ ] Click "Save" or "Create"
- [ ] Success message appears
- [ ] Modal closes
- [ ] New requirement appears in list
- [ ] Requirement count updates
- [ ] No errors in console

### 2.3 Create with Different Types
- [ ] Create one-time requirement
- [ ] Create monthly requirement
- [ ] Create quarterly requirement
- [ ] Create annual requirement
- [ ] Verify frequency is saved correctly

---

## 3. READ - View Requirements

### 3.1 Requirement List
- [ ] All requirements display
- [ ] Requirements are grouped by category
- [ ] Requirements show correct status badges
- [ ] Due dates are highlighted (upcoming/overdue)
- [ ] Can expand/collapse categories
- [ ] Can expand/collapse individual requirements

### 3.2 Requirement Details
- [ ] Click on requirement to view details
- [ ] Details modal/section shows:
  - [ ] Full requirement name
  - [ ] Category
  - [ ] Description
  - [ ] Due date
  - [ ] Status
  - [ ] Penalty information
  - [ ] Financial year
  - [ ] Compliance type
  - [ ] Required documents
  - [ ] Legal sections (if available)
  - [ ] Authority information

### 3.3 Filtering & Search
- [ ] **Search**: Type in search box
  - [ ] Search by requirement name
  - [ ] Search by category
  - [ ] Search by description
  - [ ] Results filter in real-time
- [ ] **Category Filter**: Select category
  - [ ] Requirements filter by category
  - [ ] "All" shows all requirements
- [ ] **Financial Year Filter**: Select FY
  - [ ] Requirements filter by financial year
  - [ ] "All" shows all requirements
- [ ] **Status Filter** (if available):
  - [ ] Filter by not_started
  - [ ] Filter by upcoming
  - [ ] Filter by pending
  - [ ] Filter by overdue
  - [ ] Filter by completed
- [ ] **Month Filter** (if available):
  - [ ] Filter by specific month
- [ ] **Quarter Filter** (if available):
  - [ ] Filter by specific quarter
- [ ] **Entity Type Filter** (if available)
- [ ] **Industry Filter** (if available)
- [ ] **Compliance Type Filter** (if available)

### 3.4 Sorting
- [ ] Sort by due date (ascending)
- [ ] Sort by due date (descending)
- [ ] Sort by status
- [ ] Sort by category
- [ ] Sort by requirement name

### 3.5 Calendar View
- [ ] Switch to calendar view
- [ ] Requirements display on correct dates
- [ ] Can navigate between months
- [ ] Can navigate between years
- [ ] Click on date shows requirements for that date
- [ ] Color coding for status (if implemented)
- [ ] Can switch back to list view

---

## 4. UPDATE - Edit Requirements

### 4.1 Edit Modal
- [ ] Click "Edit" button on a requirement
- [ ] Edit modal opens
- [ ] Form is pre-filled with existing data
- [ ] All fields are editable

### 4.2 Update Requirement
- [ ] Change requirement name
- [ ] Change category
- [ ] Change due date
- [ ] Update description
- [ ] Update penalty information
- [ ] Change financial year
- [ ] Change compliance type
- [ ] Click "Save" or "Update"
- [ ] Success message appears
- [ ] Modal closes
- [ ] Updated requirement appears in list
- [ ] Changes are reflected immediately
- [ ] No errors in console

### 4.3 Update Status
- [ ] Change status dropdown on requirement
- [ ] Select new status:
  - [ ] not_started
  - [ ] upcoming
  - [ ] pending
  - [ ] overdue
  - [ ] completed
- [ ] Status updates immediately
- [ ] Status badge updates
- [ ] Notification sent (if implemented)
- [ ] No errors in console

### 4.4 Bulk Status Update
- [ ] Select multiple requirements (checkboxes)
- [ ] Click "Update Status" button
- [ ] Bulk action modal opens
- [ ] Select new status for all
- [ ] Confirm bulk update
- [ ] All selected requirements update
- [ ] Success message appears
- [ ] No errors in console

---

## 5. DELETE - Remove Requirements

### 5.1 Delete Single Requirement
- [ ] Click "Delete" button on a requirement
- [ ] Confirmation dialog appears
- [ ] Confirm deletion
- [ ] Success message appears
- [ ] Requirement disappears from list
- [ ] Requirement count updates
- [ ] No errors in console
- [ ] Requirement is actually deleted from database

### 5.2 Bulk Delete
- [ ] Select multiple requirements (checkboxes)
- [ ] Click "Delete" button
- [ ] Bulk action modal opens
- [ ] Confirmation dialog appears
- [ ] Confirm bulk deletion
- [ ] All selected requirements are deleted
- [ ] Success message appears
- [ ] Requirements disappear from list
- [ ] Requirement count updates
- [ ] No errors in console

### 5.3 Delete with Documents
- [ ] Delete requirement that has linked documents
- [ ] Verify behavior (should documents be deleted too?)
- [ ] Check for orphaned documents

---

## 6. Advanced Features

### 6.1 Document Linking
- [ ] Upload document from tracker context
- [ ] Link document to requirement
- [ ] Document appears in requirement details
- [ ] Can view linked documents
- [ ] Can remove document link

### 6.2 Calendar Sync
- [ ] Click "Sync Calendar" button
- [ ] Calendar file downloads (.ics)
- [ ] Can import into calendar app
- [ ] All requirements appear in calendar
- [ ] Due dates are correct

### 6.3 Compliance Score
- [ ] View compliance score (if available)
- [ ] Score updates based on completed requirements
- [ ] Score calculation is accurate

### 6.4 Hide Compliance
- [ ] Hide a requirement (if feature exists)
- [ ] Hidden requirement doesn't appear in list
- [ ] Can unhide requirement

### 6.5 Notifications
- [ ] Status change triggers notification
- [ ] Overdue requirements trigger notifications
- [ ] Upcoming deadlines trigger notifications
- [ ] Notifications appear in notification center

---

## 7. Company Switching

### 7.1 Switch Company in Tracker
- [ ] Select different company from dropdown
- [ ] Tracker tab updates
- [ ] Requirements load for new company
- [ ] Filters reset (if applicable)
- [ ] No UUID casting errors
- [ ] No RLS errors
- [ ] No console errors

### 7.2 Multiple Company Switching
- [ ] Switch between 3-4 companies rapidly
- [ ] Requirements load correctly each time
- [ ] No race conditions
- [ ] No memory leaks

---

## 8. Error Handling

### 8.1 Invalid Operations
- [ ] Try to create requirement without required fields
- [ ] Try to update requirement with invalid data
- [ ] Try to delete non-existent requirement
- [ ] Verify appropriate error messages

### 8.2 Network Issues
- [ ] Test with slow network
- [ ] Test with offline mode
- [ ] Verify error handling

---

## 9. Performance

### 9.1 Loading Performance
- [ ] Requirements load < 2 seconds
- [ ] Filtering is responsive
- [ ] Search is responsive
- [ ] No lag when switching views

### 9.2 Large Datasets
- [ ] Test with company that has 100+ requirements
- [ ] List still loads quickly
- [ ] Filtering still works
- [ ] Pagination works (if implemented)

---

## 10. Console & Errors

### 10.1 Console Checks
- [ ] No JavaScript errors
- [ ] No TypeScript errors
- [ ] No UUID casting errors
- [ ] No RLS policy errors
- [ ] No network errors (except expected)

### 10.2 Database Operations
- [ ] CREATE operations succeed
- [ ] READ operations succeed
- [ ] UPDATE operations succeed
- [ ] DELETE operations succeed
- [ ] All operations work for Passport users

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
