# Compliance Intelligence Roadmap
## From Static Templates to Autonomous AI-Powered Compliance

**Document Version:** 1.0
**Date:** March 2026
**Status:** Active Planning

---

## The Core Idea

Instead of a CA manually creating compliance templates per client, the system:

1. Reads the company's DNA (NIC code, company type, state, listing status, incorporation date)
2. Queries Perplexity in real-time to fetch all applicable compliances with sources
3. Generates a live, cited compliance calendar
4. Monitors for regulatory changes weekly and auto-updates
5. CA only reviews, approves, and marks filed — never creates from scratch

The CA goes from **compliance author → compliance reviewer**.

---

## Stage 1: Real-Time Compliance Intelligence Generation

### 1.1 Company DNA Profile

Every Indian company, once onboarded, has a compliance fingerprint built from:

```
NIC Code        → Industry-specific acts (FSSAI, RBI, SEBI, Drugs & Cosmetics, etc.)
NIC Section     → Broad sector (Manufacturing, Services, Finance, etc.)
Company Type    → ROC filing obligations (PLC vs PTC vs LLP vs OPC vs Section 8)
Listing Status  → SEBI LODR obligations (Listed only)
State           → Professional Tax slabs, MSME, Shops & Establishment Act
Incorp Date     → FY alignment, when annual filings are due
GST Status      → GSTR obligations (once we fetch from GSTN)
Turnover        → E-invoicing threshold, tax audit trigger
Headcount       → PF/ESI applicability threshold
```

### 1.2 The Perplexity Intelligence Call

**Triggered on:** Company creation (onboarding) + first login + manual refresh

**Prompt architecture:**

```typescript
const buildCompliancePrompt = (company: CompanyProfile) => `
You are a senior Indian compliance expert (CA/CS qualified).

Generate a COMPLETE list of all mandatory compliance filings and registrations for:

Company Type: ${company.type} (${company.typeName})
NIC Code: ${company.nicCode} — ${company.nicDescription}
NIC Division: ${company.nicDivision} — ${company.nicDivisionName}
NIC Section: ${company.nicSection} — ${company.nicSectionName}
State of Incorporation: ${company.stateName}
Listed on exchange: ${company.isListed ? 'Yes' : 'No'}
Incorporated: ${company.incorporationDate}
Financial Year: April–March

Cover ALL of the following domains (include only what applies):

1. MCA/ROC Filings (AOC-4, MGT-7, MGT-14, DIR-3 KYC, ADT-1, INC-20A, etc.)
2. GST (GSTR-1, GSTR-3B, GSTR-9, GSTR-9C, e-invoicing if applicable)
3. Income Tax (Advance Tax, TDS 24Q/26Q/27Q, ITR, Tax Audit)
4. EPFO/PF (monthly ECR, annual returns)
5. ESIC (monthly contribution, half-yearly return)
6. Professional Tax (${company.stateName} specific)
7. SEBI/Stock Exchange (if listed: LODR, shareholding pattern, board meeting disclosures)
8. Industry-specific (based on NIC ${company.nicCode}): FSSAI, RBI, IRDAI, DPIIT,
   Drugs & Cosmetics, Factories Act, Mines Act, etc. — only what applies
9. Labour Laws: POSH, Maternity Benefit, Payment of Wages, Equal Remuneration
10. Shops & Establishment Act (${company.stateName})
11. MSME registration (if applicable)
12. Startup India / DPIIT recognition (if applicable based on age + type)

For each compliance item return:

{
  "id": "unique-slug",
  "name": "GSTR-3B Monthly Return",
  "act": "Central Goods and Services Tax Act, 2017",
  "section": "Section 39",
  "authority": "GSTN",
  "category": "GST",
  "frequency": "monthly",
  "dueDate": "20th of following month",
  "dueDateFormula": "day:20,offset:+1month",
  "penaltyOnMiss": "₹50/day (₹20/day for nil return), max ₹10,000",
  "applicabilityReason": "All GST-registered businesses",
  "documentsRequired": ["Sales register", "Purchase register", "Credit/debit notes"],
  "sourceUrl": "https://cbic-gst.gov.in/...",
  "confidenceScore": 0.97
}

Return a JSON array. Be exhaustive. Include all items even if you are 90%+ confident
they apply. Do not miss any industry-specific regulations for NIC ${company.nicCode}.
`
```

### 1.3 Response Processing Pipeline

```
Perplexity response (JSON array)
         │
         ▼
  Validation layer
  - Schema check
  - Duplicate detection
  - Confidence threshold filter (>0.85)
         │
         ▼
  Deadline engine
  - Parse dueDateFormula
  - Compute actual dates from incorp date + current FY
  - Generate instances for next 12 months
         │
         ▼
  DB storage (requirements table)
  - status: 'pending'
  - source: 'ai_generated'
  - confidenceScore stored
  - sourceUrl stored (citation)
  - needsCAReview: true (if confidence < 0.95)
         │
         ▼
  CA review queue
  - "18 compliances generated for [Company]. Review before activating."
  - CA can: Approve all / Edit individual / Remove / Add manually
         │
         ▼
  Compliance calendar live
```

### 1.4 Deadline Formula Engine

```typescript
// Examples of formula strings we parse:
// "day:20,offset:+1month"       → 20th of next month
// "day:15,offset:+1month"       → 15th of next month (TDS)
// "months_after_fy_end:6"       → 30 September (AOC-4)
// "months_after_fy_end:9"       → 31 December (MGT-7 for listed)
// "months_after_incorp:30days"  → INC-20A (30 days from incorp)
// "quarterly:jul15,oct15,jan15,mar15" → Advance tax

function computeDeadlines(
  rule: ComplianceRule,
  company: { incorporationDate: Date, financialYearEnd: Date }
): Date[]
```

### 1.5 CA Review Interface

The generated compliances are NOT activated until a CA/owner reviews:

- **One-click approve all** — for standard, high-confidence items
- **Line-by-line review** — each item shows: name, authority, due date, source URL, confidence
- **Edit mode** — CA can change frequency, due date, add notes
- **Flag** — mark as "not applicable" with reason stored (so AI learns)
- **Add manual** — CA adds something AI missed (rare, but possible)

Once approved, the compliance calendar is live and the Sentinel begins monitoring.

### 1.6 Regulatory Change Detection (Weekly Cron)

```typescript
// Runs every Sunday night for each active company
const changeDetectionPrompt = `
Between ${lastCheckedDate} and today, have there been any new notifications,
circulars, amendments, or due date extensions from MCA, CBDT, GSTN, SEBI,
EPFO, or ESIC that affect a ${company.type} company with NIC code ${company.nicCode}
in ${company.stateName}?

If yes, list each change:
{
  "changeType": "new_filing | due_date_extension | exemption | amendment",
  "affectedComplianceId": "gstr-3b-monthly",
  "description": "CBDT extended ITR filing deadline to Nov 30...",
  "effectiveDate": "2025-10-15",
  "sourceUrl": "https://...",
  "actionRequired": "Update due date to 2025-11-30"
}

If no changes, return [].
`

// Outcome:
// → New filing detected → add to tracker, alert CA
// → Due date extended → update deadline, notify user
// → Exemption issued → flag relevant item, CA reviews
```

---

## Stage 2: Document Intelligence

Once the compliance calendar is live, the next layer is understanding documents.

### 2.1 Notice & Document Ingestion

When a user uploads any document to the vault:

```
Document uploaded
       │
       ▼
  Classification (Perplexity + Claude)
  - Category: GST Notice / Income Tax / MCA / SEBI / Labour / Other
  - Sub-type: Show Cause / Demand / Clarification Request / Order / Reminder
  - Entity extraction: Company name, GSTIN/PAN, period, assessment year
  - Reference numbers: Notice ref, DIN, ARN, case number
  - Key amounts: Tax demand, interest, penalty
  - Response deadline: Extracted from notice text
       │
       ▼
  Mapping to compliance tracker
  - Match notice to existing compliance item (e.g., GST notice → GSTR-3B item)
  - Auto-link in tracker: "Notice received" status update
  - If no matching item → create new tracker entry
       │
       ▼
  Response intelligence (Perplexity + Claude)
  - "What does Section 73 GST notice mean?"
  - "What documents are needed to respond?"
  - "What is the standard ground of reply?"
  - Draft response letter generated (template + specifics)
       │
       ▼
  CA review
  - Draft shown to CA with all citations
  - CA edits, approves, downloads
  - Response filed date recorded in tracker
```

### 2.2 Document Intelligence Prompt (Notice Analysis)

```typescript
const analyzeNoticePrompt = (documentText: string, company: CompanyProfile) => `
Analyze this compliance notice for an Indian company and extract structured data.

Company: ${company.name} (${company.type})
NIC: ${company.nicCode}
State: ${company.stateName}

Notice text:
"""
${documentText}
"""

Extract and return:
{
  "noticeType": "GST Show Cause Notice",
  "issuingAuthority": "GST Department, Telangana",
  "relevantAct": "CGST Act 2017",
  "relevantSection": "Section 73",
  "referenceNumber": "...",
  "assessmentPeriod": "April 2023 - March 2024",
  "demandedAmount": 450000,
  "interestAmount": 45000,
  "penaltyAmount": 45000,
  "responseDeadline": "2025-04-15",
  "groundsOfNotice": "Mismatch between GSTR-1 and GSTR-3B",
  "documentsToAttach": ["Reconciliation statement", "Books of accounts", "Bank statements"],
  "standardDefense": "Explain the mismatch with reconciliation...",
  "urgency": "high",
  "draftResponseOutline": "..."
}
`
```

### 2.3 Drafted Response Generation

Claude generates a formal legal response letter using:
- Extracted notice details
- Company's compliance history from tracker
- Perplexity-fetched relevant case laws and CBDT/GSTN circulars
- Standard legal language for Indian compliance responses

CA edits and approves. We store the final response in vault linked to the notice.

---

## Stage 3: Proactive Regulatory Intelligence Feed

A company-specific regulatory news feed, like a Bloomberg Terminal for compliance.

### 3.1 The Feed

Each company gets a personalized feed showing:

```
📋 MCA Circular 2025-04-01
   "Due date for AOC-4 extended to Dec 31"
   → Affects: Your AOC-4 filing (updated automatically)

⚠️ GSTN Advisory 2025-03-15
   "New HSN code mandatory for textile sector from April 1"
   → Affects you (NIC 13 — Textiles)
   → Action required: Update HSN codes before April 1

🔴 FSSAI Notification
   "Annual return filing opened for FY 2024-25"
   → Added to your compliance calendar
   → Due: May 31, 2025
```

### 3.2 Architecture

```
Perplexity monitors:
- MCA21 circulars
- CBDT press releases
- GSTN advisories
- SEBI circulars
- EPFO/ESIC notifications
- State government gazettes (relevant state)
- Industry-specific regulators (FSSAI, RBI, IRDAI, etc.)

Filtered by company's NIC + type + state
→ Pushed as notifications
→ Auto-updates compliance calendar where applicable
→ CA approves changes before they take effect
```

---

## Stage 4: Filing Automation

Once compliances are tracked and notices handled, we automate the actual filing.

### 4.1 GST Filing (GSTR-1 & GSTR-3B)

```
Compliance item: "GSTR-3B — April 2025"
Status: Due on May 20, 2025
       │
       ▼
  User clicks "Prepare Filing"
       │
       ▼
  System pre-fills from:
  - Sales data (if connected to Tally/Zoho/uploaded invoices)
  - Purchase data
  - ITC reconciliation from GSTR-2B (auto-fetched)
       │
       ▼
  Validation engine
  - GSTIN format check
  - HSN code validation
  - ITC eligibility check
  - Mismatch flags between GSTR-1 and GSTR-3B
       │
       ▼
  CA Review (approval gate)
  - "GSTR-3B for April 2025 ready. Tax liability: ₹2,34,500. Approve?"
  - CA reviews line items, edits if needed, clicks Approve
       │
       ▼
  Submit to GSTN portal (OAuth 2.0)
       │
       ▼
  ARN received → stored in vault → tracker item marked "Filed"
  → Receipt attached to compliance item
```

### 4.2 MCA Filings

Same pattern for:
- AOC-4 (Annual accounts)
- MGT-7 / MGT-7A (Annual return)
- DIR-3 KYC (Director KYC)
- ADT-1 (Auditor appointment)

Pre-fill from company data, CA approves, submit via MCA21 APIs.

### 4.3 TDS Returns

- Q1/Q2/Q3/Q4 26Q, 24Q, 27Q
- Pre-fill from payroll data / vendor payments
- Validate PANs
- CA approves → submit via TRACES

### 4.4 Approval Tiers

```
Tier 1 (Auto): Low-risk, data-complete, high confidence
  → Submitted with CA notification (can recall within 1 hour)

Tier 2 (CA Review): Standard filings
  → CA reviews in-app, clicks Approve → submitted

Tier 3 (CA + Management): High-value or sensitive filings
  → Two-signature approval required (CA + Director/CFO)
```

---

## Stage 5: Knowledge Bot (Regulatory Q&A)

A Perplexity-powered Q&A embedded inside the tracker and vault.

### 5.1 What it answers

```
"What is the penalty for late filing of MGT-7?"
→ ₹100 per day of default (no maximum cap from 2018 amendment). Source: Section 92(5) Companies Act 2013.

"Do we need FSSAI registration? Our NIC code is 10201 (rice milling)."
→ Yes. Rice milling falls under Food Business Operators requiring FSSAI State License
if turnover >₹12L. Source: Food Safety and Standards Act 2006, Schedule 2.

"Our GST notice mentions Section 74 — what's the difference from Section 73?"
→ Section 73: Non-fraud cases. Section 74: Fraud/willful misstatement.
Section 74 has higher penalties (100% of tax vs 10-25% for 73). [Full explanation...]
```

### 5.2 Embedded Contexts

- **In compliance tracker**: Contextual help button on each item ("What does this require?")
- **In document vault**: "Explain this notice" button
- **In notice response flow**: "Suggest defense arguments" button
- **Standalone chat**: Free-form regulatory questions

### 5.3 Architecture

```typescript
const knowledgeBotQuery = async (
  question: string,
  context: { company: CompanyProfile, complianceItem?: ComplianceItem, notice?: Document }
) => {
  // Perplexity for real-time web search with citations
  const perplexityAnswer = await perplexity.query({
    query: question,
    context: buildContext(context),
    searchDomains: ['mca.gov.in', 'cbic.gov.in', 'gstn.gov.in', 'sebi.gov.in', 'incometaxindia.gov.in']
  })

  // Claude for synthesis, structuring, and response formatting
  const structuredResponse = await claude.complete({
    systemPrompt: 'You are an Indian compliance expert. Use the search results to answer accurately.',
    userMessage: perplexityAnswer.rawResults + '\n\nQuestion: ' + question
  })

  return {
    answer: structuredResponse,
    citations: perplexityAnswer.citations,
    confidence: perplexityAnswer.confidence
  }
}
```

---

## Stage 6: Reconciliation & Financial Intelligence

The final layer — connecting compliance to the books.

### 6.1 Bank Feed Integration

```
Account Aggregator (AA Framework — RBI compliant)
  → Daily transaction sync
  → Categorized automatically (vendor payment, tax payment, salary, etc.)
  → Matched against compliance calendar (TDS paid? Advance tax paid?)
```

### 6.2 Tax Payment Verification

```
Compliance item: "Advance Tax Q2 — Sep 15, 2025"
  → System checks bank feed for "income tax" payment around Sep 15
  → Matches challan amount
  → Auto-marks compliance item as "Paid"
  → Flags if not paid by Sep 14 → alert CA
```

### 6.3 Auto-Reconciliation

```
GSTR-2B (auto-fetched from GSTN)
  ↔ Purchase register (uploaded or synced from Tally/Zoho)
  → Matched line by line
  → Mismatches flagged for CA review
  → ITC claim optimized

26AS / AIS (auto-fetched from Income Tax portal)
  ↔ Books of accounts
  → TDS receivable reconciled
  → Advance tax vs actual tax computed
```

### 6.4 CA's Reconciliation View

Instead of doing this manually in Excel, CA sees:
- Side-by-side GSTR-2B vs purchase register
- One-click accept matched items
- Exception queue for mismatches
- Auto-generated reconciliation statement for filing

---

## Full Stack Summary

```
LAYER 0: Company DNA
  NIC code + company type + state + listing + incorp date

LAYER 1: Real-time Compliance Intelligence (Perplexity)
  → Auto-generate compliance calendar on onboarding
  → Weekly regulatory change detection
  → CA reviews, not creates

LAYER 2: Document Intelligence (Perplexity + Claude)
  → Notice classification + field extraction
  → Mapping to compliance tracker
  → Draft response generation
  → CA edits and approves

LAYER 3: Proactive Regulatory Feed (Perplexity)
  → Company-specific regulatory news
  → Auto-updates calendar when rules change
  → Pushes only relevant alerts

LAYER 4: Filing Automation (Portal APIs)
  → GSTN, MCA21, TRACES integrations
  → Pre-fill from company data
  → CA approval gate → submit
  → ARN stored in vault

LAYER 5: Knowledge Bot (Perplexity + Claude)
  → Regulatory Q&A with citations
  → Embedded in tracker, vault, everywhere
  → Notice interpretation + defense arguments

LAYER 6: Reconciliation (AA Framework + Portal APIs)
  → Bank feed sync
  → GSTR-2B / 26AS auto-fetch
  → Auto-match, exception queue
  → CA only handles exceptions
```

---

## Implementation Sequence

### Phase A — Foundation (Now → April 7)
- [x] NIC code database (done)
- [x] CIN parser for NIC extraction (done)
- [ ] Perplexity API account + key setup
- [ ] Build compliance prompt template
- [ ] Build deadline formula engine
- [ ] CA review interface for generated compliances
- [ ] Wire to company onboarding (post-CIN verification)

### Phase B — Intelligence Layer (April 8–30)
- [ ] Weekly regulatory change detection cron
- [ ] Confidence scoring + CA review queue
- [ ] Compliance Sentinel risk scoring (overdue, at-risk, upcoming)
- [ ] Email + in-app alerts

### Phase C — Document Intelligence (May 1–20)
- [ ] Notice upload → classification pipeline
- [ ] Field extraction and tracker mapping
- [ ] Draft response generation
- [ ] CA response review + approval workflow

### Phase D — Filing Automation (May 21 – June 15)
- [ ] GSTN OAuth integration
- [ ] GSTR-1 + GSTR-3B pre-fill
- [ ] CA approval gate
- [ ] MCA21 basic filings

### Phase E — Knowledge Bot (June 15–30)
- [ ] Perplexity Q&A API
- [ ] Embedded contextual help in tracker + vault
- [ ] Standalone chat interface

### Phase F — Reconciliation (Phase 3, post-July)
- [ ] AA framework integration (RBI-compliant)
- [ ] GSTR-2B auto-fetch
- [ ] 26AS / AIS auto-fetch
- [ ] Auto-matching engine

---

## What the CA Does After All This

| Task | Before | After |
|---|---|---|
| Build compliance calendar | 2-4 hours per client | 5 min review |
| Monitor regulatory changes | Read MCA/CBDT bulletins daily | Get pushed alerts, review weekly |
| Handle notice | 3-5 hours research + drafting | 30 min edit + approve AI draft |
| GST filing | 2-3 hours data gathering + filing | 10 min review + approve |
| MCA filing | 1-2 hours | 15 min review + approve |
| Reconciliation | 4-8 hours in Excel | Review exception queue (30 min) |
| Answer client compliance queries | 30-60 min per query | AI answers, CA validates in 5 min |

**Net result:** A CA who manages 20 clients today can manage 80-100. A 4x leverage.
The firm grows revenue without proportionally growing headcount.

---

## Key API Dependencies

| Service | Purpose | Status |
|---|---|---|
| Perplexity API | Real-time compliance intelligence | Need to set up |
| Anthropic Claude API | Response generation, synthesis | Available |
| GSTN Sandbox API | GST filing | Apply for access |
| MCA21 API | ROC filings | Apply for access |
| Account Aggregator | Bank feeds | Apply (FIP/FIU license) |
| TRACES API | TDS filing | Apply for access |
| MicroVista KYC API | CIN/DIN verification | In use (debugging) |
