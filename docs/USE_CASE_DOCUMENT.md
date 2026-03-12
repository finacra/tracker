# Finacra AI - Comprehensive Use Case Document

**Version:** 1.0  
**Date:** 2025  
**Audience:** Investors, Stakeholders, Product Team

---

## Table of Contents

1. [Introduction](#introduction)
2. [Authentication & User Management](#authentication--user-management)
3. [Company Onboarding](#company-onboarding)
4. [Subscription Management](#subscription-management)
5. [Data Room - Compliance Management](#data-room---compliance-management)
6. [Team Management](#team-management)
7. [Admin Features](#admin-features)
8. [Notifications System](#notifications-system)
9. [System Architecture](#system-architecture)

---

## Introduction

Finacra AI is a comprehensive financial compliance management platform that helps companies manage regulatory requirements, track compliance deadlines, store documents, and collaborate with team members. The platform serves companies across multiple countries with region-specific compliance rules.

### Feature Status

**Fully Implemented Features:**
- Authentication & User Management
- Company Onboarding & Registration
- Subscription Management & Payments
- Compliance Tracker (Requirements Management)
- Document Vault (Upload, Organize, Export)
- Team Management & Invitations
- Reports Generation
- Overview Dashboard
- Admin Panel
- Notifications System

**Prototype Features (Coming Soon):**
- 🚧 **GST Compliance Tab**: UI prototype with mock data, no backend integration
- 🚧 **Regulatory Notices Tab**: UI prototype with local state, no database persistence
- 🚧 **DSC-DIN Management Tab**: UI prototype with local state, no file upload/persistence

### Key Value Propositions

- **Automated Compliance Tracking**: Automatically generates compliance requirements based on company profile
- **Multi-Company Management**: Users can manage multiple companies from a single account
- **Team Collaboration**: Role-based access control for team members
- **Document Management**: Secure vault for storing compliance documents
- **Real-time Notifications**: Stay informed about upcoming deadlines and compliance updates
- **Regulatory Intelligence**: Country-specific compliance rules and templates

---

## Authentication & User Management

### UC-001: User Registration

**Actor:** New User  
**Goal:** Create an account to access the platform  
**Precondition:** User has a valid email address  
**Main Flow:**

1. User navigates to `/home` or `/login`
2. User clicks "Sign Up" or "Create Account"
3. User enters email and password OR clicks "Sign in with Google"
4. System validates email format and password strength
5. System creates user account in authentication system
6. System creates corresponding `app_users` record
7. System redirects user to subscription selection page (`/subscribe`)

**Alternative Flows:**

- **A1:** User signs up with Google OAuth
  - User clicks "Sign in with Google"
  - System redirects to Google OAuth
  - User authorizes access
  - System receives OAuth callback
  - System creates/updates user account
  - System redirects to subscription page

- **A2:** Email already exists
  - System displays error: "Email already registered"
  - User can proceed to login page

**Postcondition:** User account created, user redirected to subscription page

---

### UC-002: User Login

**Actor:** Registered User  
**Goal:** Access the platform with existing credentials  
**Precondition:** User has a registered account  
**Main Flow:**

1. User navigates to `/login`
2. User enters email and password OR clicks "Sign in with Google"
3. System validates credentials
4. System creates authentication session
5. System tracks login event (KPI tracking)
6. System determines user's destination:
   - If user has accessible companies → `/data-room`
   - If user has active subscription but no companies → `/onboarding`
   - If user has no subscription → `/subscribe`
7. System redirects user to appropriate destination

**Alternative Flows:**

- **A1:** Invalid credentials
  - System displays error: "Invalid email or password"
  - User can retry or reset password

- **A2:** User forgot password
  - User clicks "Forgot Password"
  - User enters email
  - System sends password reset email
  - User clicks link in email
  - User sets new password
  - System redirects to login page

- **A3:** User has pending team invitation
  - System detects invitation token in URL
  - System redirects to `/invite/accept?token=...`
  - User accepts invitation after login

**Postcondition:** User authenticated, session created, redirected to appropriate page

---

### UC-003: Password Reset

**Actor:** Registered User  
**Goal:** Reset forgotten password  
**Precondition:** User has registered account  
**Main Flow:**

1. User navigates to `/login`
2. User clicks "Forgot Password"
3. User enters registered email address
4. System validates email exists
5. System generates password reset token
6. System sends reset email with secure link
7. User clicks link in email
8. System redirects to `/auth/reset-password`
9. User enters new password
10. System validates password strength
11. System updates password
12. System redirects to login page

**Alternative Flows:**

- **A1:** Email not found
  - System displays generic message (security best practice)
  - No email sent

- **A2:** Reset link expired
  - System displays error: "Reset link has expired"
  - User can request new reset link

**Postcondition:** Password updated, user can login with new password

---

### UC-004: Session Management

**Actor:** Authenticated User  
**Goal:** Maintain secure session across browser sessions  
**Precondition:** User is logged in  
**Main Flow:**

1. System creates session on successful login
2. System stores session token securely
3. System validates session on each request
4. System refreshes session automatically
5. System tracks session activity for analytics

**Alternative Flows:**

- **A1:** Session expired
  - System detects expired session
  - System redirects to login page
  - System preserves intended destination for post-login redirect

- **A2:** User logs out
  - User clicks "Logout"
  - System invalidates session
  - System clears local storage
  - System redirects to `/home`

**Postcondition:** User session maintained or terminated based on action

---

## Company Onboarding

### UC-005: Company Registration

**Actor:** Authenticated User with Active Subscription  
**Goal:** Register a new company in the system  
**Precondition:** User is logged in, has active subscription or trial  
**Main Flow:**

1. User navigates to `/onboarding`
2. System checks subscription status:
   - If no subscription → redirect to `/subscribe`
   - If subscription expired → redirect to `/owner-subscription-expired`
   - If subscription active → proceed
3. User enters company details:
   - Company Name
   - Company Type (Private Limited, LLP, etc.)
   - CIN Number (Corporate Identity Number)
   - PAN Number (optional)
   - Country Code
   - Date of Incorporation
   - Address details
   - Industry categories
4. User optionally verifies CIN:
   - User enters CIN number
   - User clicks "Verify CIN"
   - System calls CIN verification API
   - System auto-fills company details from API response
   - System displays verification status
5. User adds directors:
   - User enters DIN (Director Identification Number) or adds manually
   - System verifies DIN via API (if available for country)
   - System auto-fills director details
   - User can add multiple directors
6. User uploads required documents:
   - Incorporation Certificate
   - PAN Card
   - Other supporting documents
7. User submits form
8. System validates all required fields
9. System creates company record in database
10. System creates company membership with 'admin' role for creator
11. System creates director records
12. System uploads documents to secure storage
13. System generates compliance requirements based on:
    - Company type
    - Industry categories
    - Country/region
    - Incorporation date
14. System creates trial subscription for company (if applicable)
15. System redirects to `/data-room?company={companyId}`

**Alternative Flows:**

- **A1:** CIN verification fails
  - System displays error message
  - User can proceed with manual entry
  - System marks company as "requires manual verification"

- **A2:** DIN verification fails
  - System displays warning
  - User can add director manually
  - System marks director as "unverified"

- **A3:** Document upload fails
  - System displays error for specific document
  - User can retry upload
  - Company creation proceeds without failed documents

- **A4:** User exceeds company limit
  - System checks subscription tier limits
  - System displays error: "Company limit reached for your subscription tier"
  - User can upgrade subscription or contact support

- **A5:** Country not fully supported
  - System displays manual verification notice
  - User can still proceed with registration
  - System flags company for manual review

**Postcondition:** Company created, compliance requirements generated, user can access Data Room

---

### UC-006: CIN/DIN Verification

**Actor:** User during Company Onboarding  
**Goal:** Automatically verify and populate company/director information  
**Precondition:** User is on onboarding page, country supports API verification  
**Main Flow:**

1. User enters CIN or DIN number
2. User clicks "Verify" button
3. System calls external verification API (country-specific)
4. System receives verification response
5. System auto-fills form fields:
   - Company name, type, address (for CIN)
   - Director name, DOB, designation (for DIN)
6. System displays verification status (verified/unverified)
7. User can proceed with verified data or edit manually

**Alternative Flows:**

- **A1:** API unavailable for country
  - System displays: "Manual verification required for this country"
  - User enters information manually

- **A2:** Verification fails
  - System displays error message
  - User can retry or proceed manually

- **A3:** Partial data returned
  - System fills available fields
  - User completes remaining fields manually

**Postcondition:** Company/director information verified and populated (or marked for manual entry)

---

### UC-007: Entity Detection & Industry Mapping

**Actor:** System (Automatic)  
**Goal:** Automatically detect company entity type and map to compliance categories  
**Precondition:** User has entered company details  
**Main Flow:**

1. System analyzes company information:
   - Company type
   - Industry selection
   - Country code
   - Registration details
2. System detects entity subtype (if applicable)
3. System maps industry to compliance categories
4. System calculates confidence score
5. System suggests compliance requirements based on mapping
6. System displays detected information to user
7. User can review and adjust before submission

**Alternative Flows:**

- **A1:** Low confidence score
  - System flags for manual review
  - User can manually select categories

- **A2:** Multiple industry categories
  - System maps to all relevant compliance categories
  - System generates requirements for all categories

**Postcondition:** Company entity type detected, compliance categories mapped

---

## Subscription Management

### UC-008: View Subscription Plans

**Actor:** Unauthenticated or Authenticated User  
**Goal:** View available subscription tiers and pricing  
**Precondition:** None  
**Main Flow:**

1. User navigates to `/subscribe` or `/pricing`
2. System displays subscription tiers:
   - **Starter**: Basic features, limited companies
   - **Professional**: Advanced features, more companies
   - **Enterprise**: Full features, unlimited companies
3. System displays pricing for each billing cycle:
   - Monthly
   - Quarterly
   - Half-yearly
   - Annual (with discount)
4. System displays feature comparison table
5. User can select tier and billing cycle
6. User clicks "Subscribe" button

**Alternative Flows:**

- **A1:** User not logged in
  - System redirects to login page
  - System preserves selected plan for post-login redirect

- **A2:** User already has active subscription
  - System displays current subscription details
  - System offers upgrade/downgrade options

**Postcondition:** User informed about subscription options, ready to subscribe

---

### UC-009: Subscribe to Plan

**Actor:** Authenticated User  
**Goal:** Purchase a subscription plan  
**Precondition:** User is logged in  
**Main Flow:**

1. User selects subscription tier and billing cycle
2. User clicks "Subscribe" or "Pay Now"
3. System creates payment order via Razorpay
4. System generates unique order ID
5. System redirects to Razorpay payment gateway
6. User completes payment:
   - Enters payment details (card/UPI/netbanking)
   - Authorizes payment
7. Razorpay processes payment
8. Razorpay sends webhook to system
9. System verifies payment signature
10. System creates subscription record:
    - Links to user account
    - Sets tier and billing cycle
    - Sets start and end dates
    - Marks status as 'active'
11. System creates payment record
12. System sends confirmation email
13. System redirects user to `/onboarding` or `/data-room`

**Alternative Flows:**

- **A1:** Payment fails
  - Razorpay displays error
  - User can retry payment
  - System maintains pending order

- **A2:** Payment pending
  - System creates subscription with 'pending' status
  - System monitors payment status via webhook
  - System activates subscription when payment confirms

- **A3:** Webhook verification fails
  - System logs error
  - System flags payment for manual review
  - Admin can manually verify and activate

- **A4:** User cancels payment
  - User closes payment window
  - System maintains order for retry
  - User can return to subscription page

**Postcondition:** Subscription created and activated, user can create companies

---

### UC-010: Trial Subscription

**Actor:** System (Automatic) or Admin  
**Goal:** Provide trial access to new companies  
**Precondition:** User creates first company or admin grants trial  
**Main Flow:**

1. User creates first company (see UC-005)
2. System checks user subscription status
3. If user has no active subscription:
   - System creates trial subscription
   - Sets trial period (e.g., 14 days)
   - Sets status as 'trial'
   - Links to company (if company-level) or user (if user-level)
4. System grants access to platform features
5. System tracks trial usage
6. System sends trial start notification
7. System sends reminder emails before trial expires

**Alternative Flows:**

- **A1:** User already has subscription
  - System uses existing subscription
  - No trial created

- **A2:** Admin grants trial
  - Admin navigates to admin panel
  - Admin selects company/user
  - Admin clicks "Grant Trial"
  - Admin sets trial duration
  - System creates trial subscription

- **A3:** Trial expires
  - System marks subscription as 'expired'
  - System restricts access to data room
  - System redirects to subscription page
  - User can subscribe to continue

**Postcondition:** Trial subscription active, user has limited-time access

---

### UC-011: Subscription Renewal

**Actor:** System (Automatic) or User  
**Goal:** Renew expiring subscription  
**Precondition:** User has active subscription with recurring billing  
**Main Flow:**

1. System detects subscription approaching renewal date
2. System sends renewal reminder email (7 days before)
3. System attempts automatic renewal via Razorpay (if enabled):
   - System creates new payment order
   - Razorpay processes recurring payment
   - System receives webhook confirmation
   - System extends subscription end date
   - System creates new payment record
4. System sends renewal confirmation email

**Alternative Flows:**

- **A1:** Automatic renewal fails
  - Payment fails or card expired
  - System sends payment failure notification
  - User must manually renew
  - System maintains subscription until end date

- **A2:** User cancels auto-renewal
  - User disables auto-renewal in settings
  - System marks subscription to cancel at period end
  - Subscription expires at end date
  - User can manually renew before expiration

- **A3:** User manually renews
  - User navigates to subscription page
  - User selects same or different plan
  - User completes payment (see UC-009)
  - System extends subscription

**Postcondition:** Subscription renewed, access continued

---

### UC-012: Subscription Upgrade/Downgrade

**Actor:** Authenticated User  
**Goal:** Change subscription tier  
**Precondition:** User has active subscription  
**Main Flow:**

1. User navigates to subscription settings
2. User views current subscription tier
3. User selects new tier (upgrade or downgrade)
4. System calculates prorated amount:
   - For upgrade: User pays difference for remaining period
   - For downgrade: Credit applied to next billing cycle
5. System processes payment (if upgrade)
6. System updates subscription tier
7. System adjusts company limits immediately
8. System sends confirmation email

**Alternative Flows:**

- **A1:** Downgrade would exceed company limit
  - System displays warning
  - User must remove companies or upgrade
  - System prevents downgrade until resolved

- **A2:** Upgrade requires immediate payment
  - System processes payment
  - If payment fails, upgrade cancelled
  - User can retry

**Postcondition:** Subscription tier updated, limits adjusted

---

### UC-013: Subscription Cancellation

**Actor:** Authenticated User or System  
**Goal:** Cancel active subscription  
**Precondition:** User has active subscription  
**Main Flow:**

1. User navigates to subscription settings
2. User clicks "Cancel Subscription"
3. System displays cancellation options:
   - Cancel immediately
   - Cancel at period end
4. User selects option
5. System updates subscription:
   - If immediate: Status → 'cancelled', access revoked
   - If at period end: `cancel_at_period_end` → true
6. System sends cancellation confirmation
7. System allows access until period end (if selected)

**Alternative Flows:**

- **A1:** User wants to reactivate
  - User can resubscribe before period ends
  - System reactivates subscription

- **A2:** Subscription expires
  - System automatically cancels
  - System restricts access
  - User can resubscribe

**Postcondition:** Subscription cancelled, access revoked at selected time

---

## Data Room - Compliance Management

The Data Room is the core feature of Finacra AI, providing comprehensive compliance management across multiple tabs.

### UC-014: Access Data Room

**Actor:** Authenticated User with Company Access  
**Goal:** View compliance dashboard for a company  
**Precondition:** User is logged in, has access to at least one company  
**Main Flow:**

1. User navigates to `/data-room`
2. System checks user authentication
3. System fetches user's accessible companies (via `GetAccessibleCompanyIds`)
4. System displays company selector dropdown
5. If user has multiple companies:
   - User selects company from dropdown
   - System updates URL: `/data-room?company={companyId}`
6. If user has single company:
   - System auto-selects company
7. System verifies user has access to selected company
8. System loads company compliance data:
   - Fetches requirements (via `GetCompanyRequirements`)
   - Fetches company details
   - Fetches directors
   - Fetches documents
9. System displays Data Room with default tab (Overview)
10. User can navigate between tabs:
    - Overview
    - Reports
    - Notices
    - GST
    - Tracker
    - DSC-DIN
    - Documents

**Alternative Flows:**

- **A1:** User has no company access
  - System redirects to `/onboarding` (if has subscription)
  - System redirects to `/subscribe` (if no subscription)

- **A2:** User subscription expired
  - System redirects to `/owner-subscription-expired`
  - System displays expiration message

- **A3:** User lacks permission for company
  - System displays: "Access Denied"
  - System redirects to company selector

- **A4:** Company not found
  - System displays error
  - System redirects to company selector

**Postcondition:** Data Room loaded, user can view and manage compliance

---

### UC-015: View Compliance Overview

**Actor:** Authenticated User  
**Goal:** See high-level compliance status and metrics  
**Precondition:** User is viewing Data Room for a company  
**Main Flow:**

1. User navigates to Overview tab (default)
2. System displays compliance score:
   - Calculated as: (Completed Requirements / Total Requirements) × 100
   - Color-coded: Green (>80%), Yellow (50-80%), Red (<50%)
3. System displays key metrics:
   - Total requirements
   - Completed requirements
   - Pending requirements
   - Overdue requirements
   - Upcoming deadlines (next 30 days)
4. System displays requirement breakdown by category:
   - Tax & Compliance
   - Regulatory Filings
   - Statutory Requirements
   - Industry-specific
5. System displays recent activity:
   - Recently completed requirements
   - Recently uploaded documents
   - Recent status changes
6. User can click on any metric to drill down to Tracker tab

**Alternative Flows:**

- **A1:** No requirements generated yet
  - System displays: "No compliance requirements found"
  - System provides link to generate requirements

- **A2:** All requirements completed
  - System displays: "100% Compliance - All requirements met!"
  - System shows completion date

**Postcondition:** User has overview of company compliance status

---

### UC-016: View Compliance Requirements (Tracker Tab)

**Actor:** Authenticated User  
**Goal:** View and manage individual compliance requirements  
**Precondition:** User is viewing Data Room  
**Main Flow:**

1. User navigates to "Tracker" tab
2. System fetches all compliance requirements for company
3. System displays requirements in table/grid view with:
   - Requirement name/description
   - Category
   - Status (Pending, In Progress, Completed, Overdue)
   - Due date
   - Completion date (if completed)
   - Filed by (user who completed)
   - Attached documents
4. User can filter requirements by:
   - Category (dropdown)
   - Status (checkboxes)
   - Search by keyword
5. User can sort by:
   - Due date (ascending/descending)
   - Status
   - Category
   - Completion date
6. User can view requirement details:
   - Clicks on requirement row
   - System displays detailed view with:
     - Full description
     - Regulatory reference
     - Filing frequency
     - Required documents
     - Status history
     - Notes

**Alternative Flows:**

- **A1:** No requirements match filters
  - System displays: "No requirements found matching your filters"
  - User can clear filters

- **A2:** User has editor/admin role
  - System displays action buttons:
    - "Mark Complete"
    - "Upload Document"
    - "Add Note"
    - "Change Status"

**Postcondition:** User views filtered and sorted compliance requirements

---

### UC-017: Update Requirement Status

**Actor:** Authenticated User with Editor/Admin Role  
**Goal:** Update the status of a compliance requirement  
**Precondition:** User is viewing Tracker tab, has edit permissions  
**Main Flow:**

1. User selects requirement from Tracker tab
2. User clicks "Change Status" or status dropdown
3. System displays status options:
   - Pending
   - In Progress
   - Completed
   - Overdue
4. User selects new status
5. If status is "Completed":
   - System prompts for completion date
   - System prompts for status reason/notes
   - System records `filed_by` (current user)
6. User confirms status change
7. System updates requirement record
8. System updates compliance score
9. System creates audit trail entry
10. System tracks status change (KPI: Tracker Usage)
11. System sends notification to company admins (if configured)
12. System refreshes requirement list

**Alternative Flows:**

- **A1:** User has viewer role
  - System displays: "You don't have permission to change status"
  - Action disabled

- **A2:** Requirement already completed
  - System warns: "This requirement is already marked as completed"
  - User can still change status if needed

- **A3:** Status change to "Overdue"
  - System automatically sets if due date passed
  - System highlights in red
  - System sends overdue notification

**Postcondition:** Requirement status updated, compliance score recalculated

---

### UC-018: Upload Compliance Document

**Actor:** Authenticated User with Editor/Admin Role  
**Goal:** Attach document to a compliance requirement  
**Precondition:** User is viewing requirement details  
**Main Flow:**

1. User selects requirement in Tracker tab
2. User clicks "Upload Document" or "Attach Document"
3. System displays upload modal
4. User selects file:
   - Drag and drop OR
   - Click to browse
5. System validates file:
   - File type (PDF, DOC, XLS, images)
   - File size (max limit)
6. System displays file preview
7. User enters document name (auto-filled from requirement)
8. User clicks "Upload"
9. System uploads file to secure storage (Supabase Storage)
10. System creates document record linked to requirement
11. System updates requirement to show attached document
12. System tracks document upload (KPI: Document Upload)
13. System sends notification to team members
14. System displays success message

**Alternative Flows:**

- **A1:** File validation fails
  - System displays error: "Invalid file type or size exceeded"
  - User can select different file

- **A2:** Upload fails
  - System displays error message
  - User can retry upload
  - System maintains form data

- **A3:** Multiple documents for same requirement
  - System allows multiple uploads
  - System displays list of all attached documents
  - User can delete individual documents

**Postcondition:** Document uploaded and linked to requirement

---

### UC-019: Export Compliance Calendar

**Actor:** Authenticated User  
**Goal:** Export compliance deadlines to calendar application  
**Precondition:** User is viewing Data Room  
**Main Flow:**

1. User navigates to Overview or Tracker tab
2. User clicks "Export Calendar" or "Download ICS"
3. System generates ICS (iCalendar) file containing:
   - All compliance requirements with due dates
   - Requirement name as event title
   - Due date as event date
   - Category as event category
   - Description with regulatory details
4. System triggers file download
5. User imports ICS file into calendar application:
   - Google Calendar
   - Outlook
   - Apple Calendar
   - Other ICS-compatible apps
6. Calendar displays all compliance deadlines as events

**Alternative Flows:**

- **A1:** No requirements with due dates
  - System displays: "No calendar events to export"
  - Export button disabled

- **A2:** User wants to filter calendar
  - User can filter by category before export
  - System exports only filtered requirements

**Postcondition:** Compliance calendar exported, user can view deadlines in calendar app

---

### UC-020: Generate Compliance Reports

**Actor:** Authenticated User  
**Goal:** Generate and download compliance reports  
**Precondition:** User is viewing Reports tab  
**Main Flow:**

1. User navigates to "Reports" tab
2. System displays report types:
   - Compliance Status Report
   - Due Date Report
   - Category-wise Report
   - Audit Trail Report
   - Custom Report
3. User selects report type
4. User configures report parameters:
   - Date range
   - Categories to include
   - Status filters
   - Format (PDF, Excel, CSV)
5. User clicks "Generate Report"
6. System fetches data based on parameters
7. System generates report:
   - Formats data according to report type
   - Applies company branding
   - Includes compliance score
   - Includes charts/graphs (for PDF)
8. System tracks report generation (KPI: Report Generation Efficiency)
9. System triggers file download
10. User receives report file

**Alternative Flows:**

- **A1:** No data matches parameters
  - System displays: "No data available for selected parameters"
  - User can adjust filters

- **A2:** Large dataset
  - System shows progress indicator
  - System processes in background
  - System sends email when ready (for very large reports)

- **A3:** User wants scheduled reports
  - User can set up recurring report generation
  - System sends reports via email on schedule

**Postcondition:** Compliance report generated and downloaded

---

### UC-021: View Regulatory Notices

**Status:** 🚧 **Coming Soon** (Prototype - UI Only)

**Actor:** Authenticated User  
**Goal:** View regulatory notices and updates relevant to company  
**Precondition:** User is viewing Data Room  
**Main Flow:**

1. User navigates to "Notices" tab
2. **Note:** Currently uses demo/mock data stored in local component state
3. System displays notices in chronological order:
   - Notice title
   - Publication date
   - Regulatory body
   - Category
   - Summary
   - Full text (expandable)
4. User can filter notices by:
   - Date range
   - Regulatory body
   - Category
   - Status (Pending/Responded/Resolved)
5. User can add new notices manually:
   - Click "Add Notice"
   - Fill in notice details
   - Notice stored in local state (not persisted)
6. User can mark notices as:
   - Pending
   - Responded
   - Resolved
7. System highlights unread notices
8. User clicks notice to view full details

**Alternative Flows:**

- **A1:** No notices available
  - System displays: "No regulatory notices found"
  - User can add notices manually

- **A2:** Notice requires action
  - System highlights notice
  - User can update status and add responses

**Current Limitations:**
- Notices are stored in local component state (not persisted to database)
- No backend API integration
- No automatic notice fetching from regulatory bodies
- Data is lost on page refresh

**Postcondition:** User views and manages notices (currently demo data only)

---

### UC-022: Manage GST Compliance

**Status:** 🚧 **Coming Soon** (Prototype - UI Only)

**Actor:** Authenticated User  
**Goal:** Track and manage GST (Goods and Services Tax) compliance  
**Precondition:** User is viewing Data Room, company is in India (country code: 'IN')  
**Main Flow:**

1. User navigates to "GST" tab
2. **Note:** Currently shows prototype UI with mock data
3. System displays GST connection flow:
   - Step 1: Connect GST Account
     - User enters GSTIN (15-digit)
     - User enters GST portal username
   - Step 2: Verify OTP
     - User enters 6-digit OTP (simulated)
     - System simulates authentication
   - Step 3: GST Dashboard (mock data)
     - Registration status
     - GSTIN display
     - Cash balance (IGST, CGST, SGST)
     - ITC balance
     - GSTR-1 and GSTR-3B filing status
     - Filing history
4. User can view mock filing details:
   - Clicks on specific return
   - System displays mock data:
     - Due date
     - Filing status
     - Filed date
     - Tax amounts
     - Invoice counts

**Alternative Flows:**

- **A1:** Company not in India
  - Tab is hidden (only shows for country code 'IN')

- **A2:** Connection fails
  - System displays error message
  - User can retry connection

**Current Limitations:**
- No actual GST portal integration
- Uses mock/demo data for dashboard
- OTP verification is simulated (not real)
- No backend API for GST data fetching
- Data is not persisted
- No real-time GST return data

**Postcondition:** User views GST dashboard with mock data (prototype only)

---

### UC-023: Manage DSC-DIN (Digital Signature Certificate - Director Identification Number)

**Status:** 🚧 **Coming Soon** (Prototype - UI Only)

**Actor:** Authenticated User  
**Goal:** Track and manage director DSC and DIN information  
**Precondition:** User is viewing Data Room, company has directors  
**Main Flow:**

1. User navigates to "DSC-DIN" tab
2. **Note:** Currently uses local component state (not persisted to database)
3. System displays list of directors from company entity details:
   - Director name
   - DIN number (if available)
   - Designation
4. For each director, user can manage:
   - **DSC File Upload:**
     - Select DSC certificate file
     - File stored in local state (not uploaded to server)
   - **DIN File Upload:**
     - Select DIN document file
     - File stored in local state (not uploaded to server)
   - **Portal Credentials:**
     - Enter portal email
     - Enter portal password
     - Stored in local state only
   - **Expiry Date:**
     - Set DSC expiry date
     - Default: September 30 of next year
   - **Reminder Settings:**
     - Enable/disable expiry reminders
5. System displays expiry warnings:
   - Highlights expiring soon (within 30 days)
   - Highlights expired certificates
6. User can view director details:
   - Clicks on director
   - System displays:
     - Full director information
     - DSC/DIN file status
     - Expiry information
     - Portal credentials (if set)

**Alternative Flows:**

- **A1:** No directors added
  - System displays: "No directors found"
  - System provides link to add directors in company settings

- **A2:** DSC expired
  - System highlights expired DSC in red
  - System displays expiry warning

- **A3:** File upload attempted
  - Files are selected but not actually uploaded
  - Data stored in local component state only

**Current Limitations:**
- DSC/DIN files are not actually uploaded to server
- Data stored in local component state (lost on page refresh)
- No backend API for DSC/DIN file storage
- No database persistence
- Portal credentials not securely stored
- Expiry reminders not implemented
- No export functionality

**Postcondition:** User manages director DSC and DIN information (prototype UI only, data not persisted)

---

### UC-024: Manage Document Vault

**Actor:** Authenticated User  
**Goal:** Store and organize compliance documents in secure vault  
**Precondition:** User is viewing Data Room  
**Main Flow:**

1. User navigates to "Documents" tab
2. System displays document vault with:
   - Folder structure
   - Document list
   - Search functionality
3. User can navigate folders:
   - Clicks folder to open
   - Uses breadcrumb navigation
   - Creates new folders
4. User can upload documents:
   - Clicks "Upload" button
   - Selects file(s)
   - Chooses destination folder
   - Enters document name and description
   - System uploads to secure storage
5. User can view documents:
   - Clicks document name
   - System displays preview (if supported)
   - User can download original file
6. User can organize documents:
   - Move to different folder
   - Rename
   - Delete (with confirmation)
   - Add tags/notes
7. User can search documents:
   - Enters search term
   - System searches name, description, content
   - System displays matching documents
8. User can export documents:
   - Selects multiple documents
   - Clicks "Export"
   - System creates ZIP file
   - System triggers download

**Alternative Flows:**

- **A1:** Storage limit reached
  - System displays: "Storage limit reached for your subscription tier"
  - User can upgrade or delete old documents

- **A2:** Document template available
  - System suggests document templates
   - User can use template to create new document
   - System pre-fills with company information

- **A3:** Password-protected export
   - User can set password for exported ZIP
   - System encrypts ZIP file
   - User shares password separately

**Postcondition:** Documents organized and stored in vault

---

### UC-025: Send Documents via Email

**Actor:** Authenticated User with Editor/Admin Role  
**Goal:** Share compliance documents with external parties  
**Precondition:** User is viewing Documents tab  
**Main Flow:**

1. User selects documents from vault
2. User clicks "Send via Email"
3. System displays email composition form:
   - Recipient email(s)
   - Subject (auto-filled)
   - Message body
   - Document list (selected documents)
4. User enters recipient email addresses
5. User customizes email message
6. User clicks "Send"
7. System generates secure download links for documents
8. System sends email with links
9. System tracks email send (KPI tracking)
10. System displays confirmation

**Alternative Flows:**

- **A1:** Large file size
  - System warns: "Files are large, consider using download links"
  - System offers to send links instead of attachments

- **A2:** Email delivery fails
  - System displays error
  - User can retry
  - System logs failed attempts

**Postcondition:** Documents shared via email

---

### UC-026: Apply Compliance Templates

**Actor:** Admin User  
**Goal:** Apply pre-configured compliance templates to company  
**Precondition:** User is admin, viewing Data Room  
**Main Flow:**

1. Admin navigates to admin panel
2. Admin views compliance templates
3. Admin selects template(s) to apply
4. Admin selects target company(ies)
5. Admin clicks "Apply Template"
6. System generates requirements from template:
   - Creates requirement records
   - Sets categories
   - Sets due dates based on company dates
   - Links to regulatory references
7. System applies template to selected companies
8. System displays success message with count of requirements created
9. Companies now have new requirements in Data Room

**Alternative Flows:**

- **A1:** Template already applied
  - System detects duplicate requirements
   - System skips duplicates or asks for confirmation

- **A2:** Bulk apply to multiple companies
  - Admin selects multiple companies
   - System applies template to all
   - System shows progress indicator

**Postcondition:** Compliance requirements generated from templates

---

## Team Management

### UC-027: View Team Members

**Actor:** Authenticated User  
**Goal:** View team members for a company  
**Precondition:** User has access to company  
**Main Flow:**

1. User navigates to `/team` or clicks "Team" in navigation
2. System fetches user's accessible companies
3. User selects company from dropdown
4. System fetches team members (company user roles) for selected company
5. System displays team members in table with:
   - User name/email
   - Role (Admin, Editor, Viewer)
   - Invitation status (Active, Pending)
   - Joined date
   - Last active
6. User can see their own role highlighted
7. User can filter by role

**Alternative Flows:**

- **A1:** User has no companies
  - System displays: "No companies found"
  - System redirects to onboarding

- **A2:** User is viewer
  - System displays team list (read-only)
  - Add/remove actions disabled

**Postcondition:** User views team members for company

---

### UC-028: Invite Team Member

**Actor:** Authenticated User with Admin/Editor Role  
**Goal:** Invite a new user to join company team  
**Precondition:** User has manage permissions for company  
**Main Flow:**

1. User navigates to Team page
2. User clicks "Invite Team Member"
3. System displays invitation form:
   - Email address (required)
   - Name (optional)
   - Role selection (Viewer, Editor, Admin)
4. User enters invitee email
5. User selects role
6. User clicks "Send Invitation"
7. System validates email format
8. System checks if user already has access:
   - If yes: System adds role directly (see UC-029)
   - If no: System creates team invitation record
9. System generates invitation token
10. System creates invitation link
11. System sends invitation email:
    - For existing users: Direct accept link
    - For new users: Sign-up link with invitation token
12. System tracks invitation (KPI: Team Adoption)
13. System displays success message
14. Invitation appears in team list as "Pending"

**Alternative Flows:**

- **A1:** Email already has access
  - System displays: "User already has access"
  - System offers to change role instead

- **A2:** Invalid email format
  - System displays validation error
  - User can correct email

- **A3:** User exceeds team limit
  - System checks subscription tier limits
  - System displays: "Team member limit reached"
  - User can upgrade subscription

- **A4:** Email delivery fails
  - System creates invitation record
  - System displays: "Invitation created but email failed"
  - User can copy invitation link manually

**Postcondition:** Team invitation sent, pending acceptance

---

### UC-029: Accept Team Invitation

**Actor:** Invited User  
**Goal:** Accept invitation to join company team  
**Precondition:** User received invitation email  
**Main Flow:**

1. User clicks invitation link in email
2. System validates invitation token
3. If user not logged in:
   - System redirects to login page
   - System preserves invitation token
   - After login, system redirects to accept page
4. System displays invitation details:
   - Company name
   - Inviter name/email
   - Assigned role
5. User clicks "Accept Invitation"
6. System creates company membership record:
   - Links user to company
   - Assigns role from invitation
   - Marks invitation as accepted
7. System grants access to company Data Room
8. System sends confirmation email to inviter
9. System tracks invitation acceptance (KPI: Team Adoption)
10. System redirects user to `/data-room?company={companyId}`

**Alternative Flows:**

- **A1:** Invitation expired
   - System displays: "Invitation has expired"
   - System offers to request new invitation

- **A2:** Invitation already accepted
   - System displays: "Invitation already accepted"
   - System redirects to Data Room

- **A3:** User already has access
   - System updates role if different
   - System displays: "Access updated"

- **A4:** Invalid token
   - System displays error
   - User can contact company admin

**Postcondition:** User added to company team, has access to Data Room

---

### UC-030: Add Existing User to Team

**Actor:** Authenticated User with Admin/Editor Role  
**Goal:** Add user who already has account to company team  
**Precondition:** User has manage permissions, target user has account  
**Main Flow:**

1. User navigates to Team page
2. User clicks "Add Team Member"
3. User enters email address of existing user
4. User selects role
5. User clicks "Add"
6. System searches for user by email
7. If user found:
   - System creates company membership directly
   - System assigns role
   - System sends notification email
   - System tracks addition (KPI: Team Adoption)
8. System displays success message
9. User appears in team list immediately

**Alternative Flows:**

- **A1:** User not found
   - System displays: "User not found. They need to sign up first."
   - System offers to send invitation instead

- **A2:** User already has access
   - System displays: "User already has access"
   - System offers to change role

**Postcondition:** User added to team, has immediate access

---

### UC-031: Remove Team Member

**Actor:** Authenticated User with Admin Role  
**Goal:** Remove user from company team  
**Precondition:** User is admin, target user is not company owner  
**Main Flow:**

1. User navigates to Team page
2. User finds team member in list
3. User clicks "Remove" or "Delete" button
4. System displays confirmation dialog:
   - Shows user name/email
   - Warns about access revocation
5. User confirms removal
6. System removes company membership record
7. System revokes user access to company
8. System sends notification email to removed user
9. System tracks removal (KPI: Team Adoption)
10. System refreshes team list

**Alternative Flows:**

- **A1:** User is company owner
   - System prevents removal
   - System displays: "Cannot remove company owner"

- **A2:** User is only admin
   - System warns: "This is the only admin. Assign another admin first."
   - System prevents removal

- **A3:** User tries to remove themselves
   - System allows if not owner
   - System revokes own access
   - System redirects to company selector

**Postcondition:** User removed from team, access revoked

---

### UC-032: Change Team Member Role

**Actor:** Authenticated User with Admin Role  
**Goal:** Update role of existing team member  
**Precondition:** User is admin  
**Main Flow:**

1. User navigates to Team page
2. User finds team member in list
3. User clicks role dropdown or "Change Role"
4. System displays role options:
   - Viewer (read-only)
   - Editor (can edit requirements, upload documents)
   - Admin (full access including team management)
5. User selects new role
6. System updates company membership record
7. System updates user permissions immediately
8. System sends notification email to user
9. System tracks role change (KPI: Team Adoption)
10. System refreshes team list

**Alternative Flows:**

- **A1:** User is company owner
   - System prevents role change
   - System displays: "Company owner role cannot be changed"

- **A2:** User is only admin and changing to non-admin
   - System warns: "This is the only admin. Assign another admin first."
   - System prevents role change

**Postcondition:** Team member role updated, permissions changed

---

## Admin Features

### UC-033: Access Admin Panel

**Actor:** Superadmin User  
**Goal:** Access administrative features  
**Precondition:** User has superadmin role  
**Main Flow:**

1. User navigates to `/admin`
2. System checks superadmin status
3. If user is superadmin:
   - System displays admin panel
   - System shows admin tabs:
     - Compliance Templates
     - User Management
     - All Users
     - Transactions
     - Financials
     - Tracking System
     - Document Vault Management
4. User can navigate between admin sections

**Alternative Flows:**

- **A1:** User is not superadmin
   - System displays: "Access Denied"
   - System redirects to `/data-room`

- **A2:** Superadmin status check fails
   - System logs error
   - System denies access for security

**Postcondition:** Admin panel accessible, user can manage system

---

### UC-034: Manage Compliance Templates

**Actor:** Superadmin User  
**Goal:** Create and manage compliance requirement templates  
**Precondition:** User is in admin panel  
**Main Flow:**

1. User navigates to "Compliance Templates" tab in admin panel
2. System displays list of existing templates
3. User can create new template:
   - Clicks "Create Template"
   - Enters template details:
     - Template name
     - Description
     - Applicable company types
     - Applicable industries
     - Country/region
     - Requirements (list of compliance items)
   - For each requirement:
     - Requirement name
     - Category
     - Filing frequency
     - Due date calculation rules
     - Regulatory reference
   - User saves template
4. User can edit existing template:
   - Clicks "Edit" on template
   - Modifies template details
   - Saves changes
5. User can delete template:
   - Clicks "Delete"
   - Confirms deletion
   - System removes template
6. User can apply template to companies:
   - Selects template
   - Selects target companies
   - Clicks "Apply Template"
   - System generates requirements (see UC-026)

**Alternative Flows:**

- **A1:** Template in use by companies
   - System warns before deletion
   - System shows which companies use template
   - User can still delete (requirements remain)

- **A2:** Bulk template operations
   - User can import templates from CSV
   - User can export templates
   - User can duplicate templates

**Postcondition:** Compliance templates managed, can be applied to companies

---

### UC-035: Manage Users and Subscriptions

**Actor:** Superadmin User  
**Goal:** View and manage user accounts and subscriptions  
**Precondition:** User is in admin panel  
**Main Flow:**

1. User navigates to "User Management" or "Subscriptions" tab
2. System displays list of users with:
   - User email
   - Subscription status
   - Subscription tier
   - Companies owned
   - Last active date
3. User can filter by:
   - Subscription status
   - Subscription tier
   - Company count
4. User can view user details:
   - Clicks on user
   - System displays:
     - Full user profile
     - Subscription history
     - Payment history
     - Companies list
     - Team memberships
5. User can manage subscriptions:
   - Grant trial extension
   - Revoke subscription
   - Change subscription tier
   - View payment details
6. User can view all users (separate tab):
   - All registered users
   - Authentication provider
   - Account status
   - Registration date

**Alternative Flows:**

- **A1:** User has no subscription
   - System displays: "No active subscription"
   - Admin can grant trial

- **A2:** Bulk operations
   - Admin can export user list
   - Admin can filter and export subsets

**Postcondition:** User accounts and subscriptions managed

---

### UC-036: View Transaction History

**Actor:** Superadmin User  
**Goal:** View payment transactions and revenue  
**Precondition:** User is in admin panel  
**Main Flow:**

1. User navigates to "Transactions" tab
2. System displays transaction list with:
   - Transaction ID
   - User email
   - Company name
   - Amount
   - Payment method
   - Status (Completed, Failed, Pending)
   - Date
   - Razorpay order ID
3. User can filter transactions by:
   - Date range
   - Status
   - Payment method
   - Subscription tier
4. User can view transaction details:
   - Clicks on transaction
   - System displays:
     - Full payment details
     - Razorpay payment ID
     - Receipt link
     - Subscription linked
     - Error details (if failed)
5. User can export transaction data:
   - Clicks "Export"
   - System generates CSV/Excel file
   - System triggers download

**Alternative Flows:**

- **A1:** Failed transactions
   - System highlights failed transactions
   - Admin can investigate and manually process

- **A2:** Refund processing
   - Admin can view refund requests
   - Admin can process refunds via Razorpay

**Postcondition:** Transaction data viewed and analyzed

---

### UC-037: View Financial Analytics

**Actor:** Superadmin User  
**Goal:** Analyze revenue and financial metrics  
**Precondition:** User is in admin panel  
**Main Flow:**

1. User navigates to "Financials" tab
2. System displays financial dashboard with:
   - Total revenue (all time, monthly, yearly)
   - Revenue by subscription tier
   - Revenue by billing cycle
   - Active subscriptions count
   - Churn rate
   - Average revenue per user (ARPU)
   - Customer lifetime value (CLV)
3. System displays charts:
   - Revenue trend over time
   - Subscription distribution
   - Payment method distribution
4. User can filter by date range
5. User can view break-even analysis:
   - Fixed costs
   - Variable costs
   - Required customers for profitability
6. User can export financial reports

**Alternative Flows:**

- **A1:** No transaction data
   - System displays: "No financial data available"
   - Charts show empty state

**Postcondition:** Financial metrics analyzed

---

### UC-038: Manage Document Vault Templates

**Actor:** Superadmin User  
**Goal:** Create and manage document templates for companies  
**Precondition:** User is in admin panel  
**Main Flow:**

1. User navigates to "Document Vault" tab in admin panel
2. System displays folder structure and document templates
3. User can create document templates:
   - Clicks "Create Template"
   - Enters template details:
     - Template name
     - Description
     - File type
     - Applicable company types
     - Template file (upload)
   - User saves template
4. User can organize templates in folders
5. User can edit/delete templates
6. Templates are available to companies in their Documents tab

**Alternative Flows:**

- **A1:** Template in use
   - System warns before deletion
   - System shows usage count

**Postcondition:** Document templates managed, available to companies

---

### UC-039: View KPI Tracking System

**Actor:** Superadmin User  
**Goal:** View and analyze platform KPIs  
**Precondition:** User is in admin panel  
**Main Flow:**

1. User navigates to "Tracking System" tab
2. System displays KPI dashboard with:
   - List of all tracked KPIs (33 total)
   - Aggregated metrics per KPI
   - Category filters
3. User can filter KPIs by:
   - Category (General, Compliance Tracker, Reports, etc.)
   - KPI name
   - Company
   - Date range (Last 7/30/90 days, All time)
4. User can view detailed metrics:
   - Clicks "View Details" on KPI
   - System displays:
     - Individual tracking records
     - User who triggered event
     - Company context
     - Timestamp
     - Additional metadata
5. System displays aggregations:
   - Total records
   - Average value
   - Min/Max values
   - Unique users/companies
   - Last recorded date
6. User can chat with KPI data (AI-powered):
   - Enters natural language query
   - System analyzes KPI data
   - System provides insights and answers
7. User can export KPI data

**Alternative Flows:**

- **A1:** No KPI data
   - System displays: "No tracking data available"
   - System shows which KPIs are not being tracked

- **A2:** AI chat unavailable
   - System falls back to standard filtering
   - User can still view raw data

**Postcondition:** KPI metrics viewed and analyzed

---

## Notifications System

### UC-040: Receive Compliance Notifications

**Actor:** Authenticated User  
**Goal:** Stay informed about compliance deadlines and updates  
**Precondition:** User has company access  
**Main Flow:**

1. System monitors compliance requirements
2. System detects upcoming deadlines:
   - 30 days before due date
   - 7 days before due date
   - On due date
   - After due date (overdue)
3. System creates notification record
4. System sends notification via:
   - In-app notification (bell icon)
   - Email (if enabled in preferences)
   - SMS (if configured)
5. User views notification:
   - Clicks notification bell
   - System displays notification list
   - User clicks notification
   - System navigates to relevant requirement
6. User can mark notification as read
7. User can dismiss notification

**Alternative Flows:**

- **A1:** User has email notifications disabled
   - System only sends in-app notification

- **A2:** Multiple notifications
   - System groups similar notifications
   - System shows count badge

- **A3:** Notification for team update
   - System notifies when team member added/removed
   - System notifies when role changed

**Postcondition:** User informed about compliance events

---

### UC-041: Manage Notification Preferences

**Actor:** Authenticated User  
**Goal:** Configure notification and email preferences  
**Precondition:** User is logged in  
**Main Flow:**

1. User navigates to `/settings/email-preferences` or clicks "Email Preferences" in settings
2. System loads current notification preferences
3. System displays preference options:
   - **Status Changes**: Toggle email notifications for requirement status changes
   - **Reminders**: Toggle email notifications for compliance reminders
   - **Team Updates**: Toggle email notifications for team member changes
   - **Unsubscribe All**: Master toggle to disable all email notifications
   - **Digest Frequency**: Choose how often to receive digest emails
     - Instant (real-time)
     - Daily (once per day)
     - Weekly (once per week)
     - None (no digest emails)
4. User adjusts preferences using toggles and dropdowns
5. User clicks "Save Preferences"
6. System validates preferences
7. System saves preferences to database
8. System updates notification sending logic
9. System displays success message
10. System applies preferences immediately to future notifications

**Alternative Flows:**

- **A1:** User unsubscribes from all
  - System automatically unchecks all individual toggles
  - System sets digest frequency to 'none'
  - User receives no email notifications

- **A2:** User re-enables individual notification
  - System automatically unchecks "Unsubscribe All"
  - User receives that specific notification type

- **A3:** Preferences load fails
  - System displays default preferences
  - User can still save preferences
  - System creates new preference record

**Postcondition:** Notification preferences saved and applied

---

### UC-042: Edit Company Information

**Actor:** Authenticated User with Admin/Editor Role  
**Goal:** Update company details and information  
**Precondition:** User has edit permissions for company  
**Main Flow:**

1. User navigates to `/manage-company?company={companyId}` or clicks "Edit Company" in Data Room
2. System loads current company information:
   - Company name, type, registration details
   - Address and contact information
   - Industry categories
   - Directors list
   - Ex-directors
3. User edits company details:
   - Updates company name (if allowed)
   - Updates address, city, state, PIN code
   - Updates contact information (phone, email, landline)
   - Updates industry categories
   - Updates PAN number
4. User can manage directors:
   - Adds new director (with DIN verification if available)
   - Edits existing director information
   - Removes director
   - Verifies DIN for directors
5. User can update ex-directors list
6. User clicks "Save Changes"
7. System validates updated information
8. System updates company record in database
9. System updates director records
10. System tracks company edit (KPI: Numbers of times "Edit Company")
11. System sends notification to team members about changes
12. System displays success message
13. System redirects to Data Room

**Alternative Flows:**

- **A1:** User has viewer role
  - System displays form in read-only mode
  - Save button disabled
  - System displays: "You don't have permission to edit company"

- **A2:** CIN number change attempted
  - System prevents CIN modification (read-only)
  - System displays: "CIN number cannot be changed"

- **A3:** DIN verification fails
  - System displays warning for specific director
  - User can proceed with manual entry
  - Director marked as unverified

- **A4:** Validation errors
  - System displays field-specific errors
  - User can correct and resubmit

**Postcondition:** Company information updated, changes reflected in Data Room

---

## System Architecture

### Technology Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: Supabase Auth (with Passport.js support)
- **Database**: PostgreSQL (via Supabase)
- **Storage**: Supabase Storage
- **Payment Processing**: Razorpay
- **Architecture Pattern**: Clean Architecture with Use Cases

### Key Architectural Components

1. **Use Case Layer** (`application/use-cases/`)
   - `GetAccessibleCompanyIds`: Retrieves companies user can access
   - `GetCompanyRequirements`: Fetches compliance requirements
   - `GetRootDestination`: Determines post-login navigation
   - `GetCompanyRole`: Checks user permissions
   - Notification use cases

2. **Domain Models** (`domain/models/`)
   - `AppUser`: User entity
   - `Company`: Company entity
   - `Requirement`: Compliance requirement entity
   - `Subscription`: Subscription entity

3. **Infrastructure Layer** (`infrastructure/`)
   - Database repositories
   - Auth adapters (Supabase/Passport)
   - External API clients (CIN/DIN verification)

4. **Application Interfaces** (`application/interfaces/`)
   - Repository interfaces (Dependency Inversion)
   - Service interfaces
   - Adapter interfaces

### Security Features

- **Row Level Security (RLS)**: Database-level access control
- **Role-Based Access Control (RBAC)**: Viewer, Editor, Admin, Superadmin roles
- **Input Validation**: Server-side validation for all inputs
- **Secure File Storage**: Encrypted document storage
- **Payment Security**: Razorpay PCI-compliant payment processing
- **Session Management**: Secure token-based authentication

### Scalability Features

- **Multi-Company Support**: Users can manage multiple companies
- **Multi-Country Support**: Region-specific compliance rules
- **Lazy Loading**: Code splitting for performance
- **Caching**: Strategic caching for frequently accessed data
- **Background Processing**: Async operations for non-critical tasks

---

## Conclusion

Finacra AI provides a comprehensive compliance management platform that automates regulatory requirement tracking, document management, and team collaboration. The system supports companies across multiple countries with region-specific compliance rules, role-based access control, and comprehensive subscription management.

### Key Differentiators

1. **Automated Compliance Generation**: Requirements automatically generated based on company profile
2. **Multi-Company Management**: Single account manages multiple companies
3. **Real-time Tracking**: Live compliance score and deadline tracking
4. **Document Vault**: Secure, organized document storage with templates
5. **Team Collaboration**: Role-based access with invitation system
6. **Regulatory Intelligence**: Country and industry-specific compliance knowledge
7. **Comprehensive Reporting**: Multiple report types with export capabilities
8. **KPI Tracking**: 33 tracked metrics for platform analytics

### Business Value

- **Time Savings**: Automates compliance requirement identification and tracking
- **Risk Reduction**: Prevents missed deadlines and compliance violations
- **Cost Efficiency**: Reduces need for dedicated compliance staff
- **Scalability**: Grows with company needs through tiered subscriptions
- **Collaboration**: Enables team-wide compliance management
- **Audit Trail**: Complete history of compliance activities

### Future Enhancements (Potential)

- AI-powered compliance recommendations
- Automated filing integration
- Mobile application
- API for third-party integrations
- Advanced analytics and predictive compliance
- Multi-language support
- Regulatory change alerts

---

**Document End**

*This use case document provides a comprehensive overview of all user-facing features in Finacra AI. For technical implementation details, refer to the codebase documentation and architecture diagrams.*