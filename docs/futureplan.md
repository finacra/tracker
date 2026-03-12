# FINACRA · TECHNICAL DEEP DIVE

# AI Agents & Their Role in Finacra
How autonomous AI agents replace manual effort across compliance, accounts, risk and reporting — for CAs, entrepreneurs, VCs and accelerators.

* **8** AI Agents in the platform
* **60%** Cost Reduction vs manual staffing
* **24/7** Autonomous operation
* **<2min** Human Review per filing cycle

*finacra.com*

---

## What Is an AI Agent?
*And why are they different from chatbots or simple automation?*

### The Definition
An AI Agent is a software system that perceives its environment, makes decisions, executes multi-step tasks, and learns from outcomes — all without requiring a human to initiate each step.

Unlike a chatbot (which responds to prompts) or an RPA bot (which follows rigid scripts), an AI Agent adapts, reasons, and acts autonomously to achieve a defined goal.

| 💬 Chatbot | ⚙️ RPA Bot | 🤖 AI Agent |
| :--- | :--- | :--- |
| · Responds to prompts | · Follows fixed scripts | **· Perceives & reasons** |
| · No action capability | · Breaks on UI changes | **· Executes autonomously** |
| · Single-turn only | · No reasoning | **· Adapts to change** |
| · Human drives everything | · Brittle, high maintenance | **· Learns from outcomes** |

### How a Finacra AI Agent Works

1. **PERCEIVE** (👁️) → Reads data sources: bank feeds, GST portal, MCA, uploaded docs, emails
2. **REASON** (❓) → LLM + rules engine decides what action is needed and in what sequence
3. **ACT** (⚡) → Executes: fills forms, files returns, sends alerts, drafts documents
4. **VERIFY** (✅) → Checks its own output for errors; flags for human approval if uncertain
5. **LEARN** (🔄) → Logs outcomes; improves accuracy on next cycle through fine-tuning

---

## The Finacra Agent Ecosystem
*8 specialised agents, each owning a distinct domain — working together on a shared data layer*

**FINACRA CORE DATA LAYER**
All agents share one unified data layer — bank feeds, GST portal, MCA, Tally/Zoho, uploaded documents — ensuring no duplication and full auditability.

**The 8 Agents:**
1. Compliance Bot
2. Filing Agent
3. Reconciliation Agent
4. Risk Sentinel
5. Audit Agent
6. Due Diligence AI
7. Reporting Agent
8. Knowledge Bot

---

## 01 ComplianceBot
*Autonomous regulatory filing & deadline management*

### What It Does
* **Compliance Calendar Engine**: Builds a master calendar for every registered entity — GST-1, GST-3B, GSTR-9, TDS, Advance Tax, MCA Annual Return, PT, PF, IEC renewal — auto-populated by incorporation date, business type and jurisdiction.
* **Regulatory Change Monitor**: Scrapes CBIC, MCA21, Income Tax portal and state tax authority notifications in real time. When a due date shifts or a new form is introduced, it auto-updates the calendar and alerts the CA or CFO.
* **Notice Response Drafts**: When a GST or IT notice is uploaded, ComplianceBot reads it, classifies the notice type, maps it to applicable provisions, and drafts a response within minutes — ready for CA review.
* **Cross-Client Filing Queue**: For CA firms managing 50+ clients: auto-sorts the day's filing queue by deadline urgency, pre-fills returns from synced data, and pushes each to the CA's approval inbox.

### Filing Flow (end-to-end)
* **Data Sync**: Bank + Tally feeds pull automatically
* **Pre-fill**: Agent builds draft return from raw data
* **Validation**: Cross-checks GSTIN, HSN codes, amounts
* **CA Review**: One-screen approval — 90 sec avg
* **E-File**: Submits to portal, stores ARN/acknowledgment

### Impact Metrics
* **200+** compliance items tracked per client/year
* **2 min** average CA review time per filing
* **99.4%** filing accuracy rate
* **₹0** penalty rate for compliant clients

**Built for**: CA Firms · SMEs · Accelerator Cohorts · Any business with recurring compliance obligations

---

## Filing Agent & Reconciliation Agent

### 02 Filing Agent
Handles direct submission to government portals — GST, MCA, IT, TDS — using secure, authorised API integrations. The agent authenticates, populates, validates and submits — storing every acknowledgment and ARN for audit.

**Portals Supported**
* ✓ GSTN (GST-1, 3B, 9, 9C, IFF)
* ✓ MCA21 (AOC-4, MGT-7, DIR-3 KYC)
* ✓ TRACES (TDS Returns — 24Q, 26Q)
* ✓ Income Tax Portal (ITR-1 through ITR-7)
* ✓ State PT / Professional Tax portals

**Security Architecture**
* ✓ OAuth 2.0 token-based auth per portal
* ✓ No password storage — read-only credentials
* ✓ Every submission signed with digital signature
* ✓ Immutable audit log in tamper-proof store
* ✓ Role-based approval before any submission

### 03 Reconciliation Agent
Matches every bank transaction to a book entry — automatically, overnight. Flags unmatched items. Identifies duplicate payments, missing invoices and ghost transactions. Closes the monthly books without human intervention for 85%+ of entries.

**How Auto-Reconciliation Works**
1. **Bank Feed Sync**: Transactions pulled daily via secure API
2. **Rule Matching**: Date ± 3 days, amount tolerance, party name fuzzy match
3. **GL Posting**: Matched entries auto-posted to correct ledger heads
4. **Exception Flagging**: Unmatched items queued for human review with context
5. **Reconciliation Lock**: Approved period locked — tamper-proof for audit

**Impact Metrics:**
* **85%+** entries auto-matched
* **−92%** manual reconciliation time
* **D+1** books always current

---

## 04 Risk Sentinel
*24/7 portfolio & entity risk monitoring — surfaces threats before they become crises*

### Compliance Risk
* Filing overdue by 7+ days
* Mismatch between GSTR-2B and purchase register
* Director disqualification flags on MCA
* Pending statutory payments (PF/ESI/PT)
* Unresponded IT / GST notices

### Financial Risk
* Cash runway < 60 days
* Debtor ageing > 90 days (>25% of AR)
* Gross margin declining > 10% MoM
* Unusual expense category spikes
* Related-party transactions flagged

### Operational Risk
* Bank account balance < 30-day payroll
* Single-customer revenue concentration > 40%
* Key vendor payment delays
* Recurring bounced cheques / failed payments
* Inventory write-downs exceeding threshold

### Alert & Response Modes
* 📱 **Push Alert**: In-app + SMS for critical breach
* ✉️ **Email Digest**: Daily risk summary report
* ⤴️ **Auto-Escalate**: CA / CFO notified if unacknowledged 4h
* 📋 **Action Ticket**: Creates remediation task automatically
* 📊 **Risk Score**: Entity score updated in portfolio view

---

## Audit Agent & Due Diligence AI

### 05 Audit Agent
Prepares audit-ready evidence packages automatically — transaction testing, journal entry analysis, and anomaly detection — dramatically cutting statutory audit time and cost.

* **Transaction Testing**: Samples transactions per ISA 530 standards. Flags high-risk items: round figures, weekend transactions, entries near period-end, backdated postings.
* **Journal Entry Analysis**: Scans all manual journal entries for unusual characteristics — odd timing, overrides, approver gaps. Highlights entries that bypass normal workflow.
* **Evidence Assembly**: Auto-collects invoices, contracts, bank statements and approvals into a structured evidence folder mapped to each audit assertion.
* **Auditor Interface**: Exports a structured query-response file compatible with auditor tools (CAATs). Reduces auditor PBC (Prepared By Client) turnaround from weeks to hours.

### 06 Due Diligence AI
Compresses 3–6 week VC due diligence processes into hours. Reads financials, contracts, cap tables and public filings simultaneously — producing a structured anomaly-flagged report.

**What DueDiligenceAI reads & analyses:**
* ◆ 3 years P&L, BS, Cash Flow analysis
* ◆ Revenue recognition review
* ◆ Related-party transaction mapping
* ◆ Unit economics calculation
* ◆ Burn rate & runway modelling
* ◆ Cap table dilution analysis
* ◆ MCA filing history & status
* ◆ Director KYC & disqualification check
* ◆ Contract clause red-flag extraction
* ◆ Customer concentration analysis
* ◆ Pending litigation & notice scan
* ◆ Benchmarking vs sector peers

**Output: Structured DD Report**
Executive summary · Anomaly flags · Open questions for management · Financial model · Risk rating · Suggested negotiation points

---

## Reporting Agent & Knowledge Bot

### 07 Reporting Agent
Generates investor-ready, board-ready and regulator-ready reports on schedule — without a finance team manually compiling data. Every report is accurate, consistent and delivered automatically.

* **Monthly - Board Pack**: P&L, BS, Cash Flow + commentary + 3 KPI charts + variance vs budget
* **Monthly - MIS Report**: Management information dashboard for CFOs — departmental P&L, headcount, cost ratios
* **Monthly - Investor Update**: Startup-style update: MRR, burn, runway, key wins, asks — sent to VC distribution list
* **Quarterly - LP Report**: Fund utilisation, portfolio performance, compliance status across cohort
* **Ad-hoc - DPIIT / Govt Report**: Structured government compliance report formats — DPIIT, SEBI, RBI depending on entity type
* **Annual - Audit Financials**: Audit-ready P&L and Balance Sheet in IGAAP / Ind AS format with disclosure notes

*All reports are white-labelled with the CA firm or company's branding.*

### 08 Knowledge Bot
An NLP-powered assistant trained on the entire corpus of Indian tax law, GST circulars, SEBI regulations, MCA notifications and ICAI guidance — answering complex regulatory questions instantly.

**Sample Questions Answered:**

> **Q: Is reverse charge applicable on freight charges from an unregistered transporter?**
> A: Yes. Under Notification 13/2017-CT(Rate), GTA services where the recipient is a registered person attract RCM. The recipient must pay GST at 5% (no ITC) or 12% (with ITC).

> **Q: What is the time limit to claim ITC under GST for FY 2024–25?**
> A: ITC for FY 2024–25 must be claimed by the earlier of: (a) the due date of September 2025 return, or (b) the date of filing the annual return. Sec 16(4) CGST Act.

> **Q: Can a private limited company pay dividend without completing the audit?**
> A: No. Under Sec 123 of the Companies Act 2013, dividends can only be declared out of profits after the preparation and approval of financial statements for that year.

*Trained on: CGST/IGST/SGST Acts · All CBIC Circulars · MCA Notifications · SEBI Regulations · ICAI Guidance Notes · 2,000+ CA precedents*

---

## Human-in-the-Loop: Control, Trust & Safety
*AI handles the work. Humans make the final call. Always.*

### TIER 1 — FULLY AUTONOMOUS
Actions the agent executes without any human input — because the risk of error is minimal and the cost of a mistake is recoverable.
**Examples:**
* Bank transaction categorisation
* Compliance calendar updates
* Regulatory alert generation
* Report scheduling & delivery
* Document collection reminders

### TIER 2 — REVIEW & APPROVE
Agent prepares the complete work product. A designated human reviews a summary and clicks approve. Typical review time: 2–5 minutes.
**Examples:**
* GST / TDS return submissions
* Bank reconciliation exception resolution
* Notice response drafts
* MIS and board pack generation
* Risk alert acknowledgement

### TIER 3 — AGENT ASSISTS, HUMAN DECIDES
For high-stakes or novel situations, the agent provides analysis, options and a recommendation — but the human makes the final decision.
**Examples:**
* Responding to IT assessment orders
* Approving a related-party transaction
* Signing off on statutory audit adjustments
* Investment / DD final recommendation
* Cap table changes or rights waivers

### Trust & Safety Architecture
* 🔒 **Immutable Audit Log**: Every agent action logged, timestamped, tamper-proof
* ⚖️ **Role-Based Access**: Granular permissions — who approves what
* 🧠 **Explainable AI**: Every decision shows reasoning chain
* 🛑 **Hard Stop Rules**: Agent halts on ambiguity — never guesses
* 📊 **Accuracy Monitoring**: Accuracy tracked; retraining triggered on drift

---

## Impact: Manpower Replacement & ROI by Segment
*The real business case — what AI agents replace, and what that's worth*

### CA Firm (20 clients)
* **Before**: 2 back-office staff + 1 compliance manager
* **After**: ComplianceBot + Filing Agent handle 80% of their work
* **Impact**: **₹18–30L/year in staff cost** (Firm takes on 30+ new clients without hiring)
* **Agents used**: ComplianceBot, Filing Agent, Reconciliation Agent, Reporting Agent

### SME / Startup
* **Before**: Part-time accountant + CA retainer + consultant
* **After**: All three replaced by Finacra's agent suite
* **Impact**: **₹15–25L/year vs equivalent human team** (CFO-grade reporting for ₹4,999/month)
* **Agents used**: ComplianceBot, Reconciliation Agent, Risk Sentinel, Reporting Agent

### VC Fund (20 cos)
* **Before**: 2 analysts doing portfolio monitoring + DD
* **After**: Risk Sentinel + DueDiligenceAI take over both roles
* **Impact**: **₹40–80L/year in analyst cost** (DD cycle: 3–6 weeks → 6–12 hours)
* **Agents used**: Risk Sentinel, Due Diligence AI, Audit Agent, Reporting Agent

### Accelerator (40 cos)
* **Before**: 2 program managers on admin + 1 reporting analyst
* **After**: Full cohort managed by Finacra agents
* **Impact**: **₹25–40L/year** (Program team freed for mentorship & fundraising)
* **Agents used**: ComplianceBot, Reporting Agent, Risk Sentinel, Knowledge Bot

---

## Technical Architecture — How the Agents Are Built

* **Layer 4 — INTERFACE**
  Web dashboard · Mobile app · CA client portal · VC fund view · Accelerator command centre · API for enterprise integration

* **Layer 3 — AGENT LAYER**
  8 specialised agents orchestrated by a central AgentOS · LLM core (fine-tuned on Indian regulatory corpus) · Rules engine for compliance logic · Task queue & retry logic · Human-in-the-loop gate

* **Layer 2 — DATA LAYER**
  Unified financial data graph · Real-time bank feed connectors (AA framework) · Portal integrations (GSTN, MCA21, TRACES, IT) · Document ingestion pipeline (OCR + NLP) · Tally / Zoho / QuickBooks sync

* **Layer 1 — INFRASTRUCTURE**
  ISO 27001 certified cloud · End-to-end AES-256 encryption · SOC 2 Type II · Multi-region failover · Immutable audit ledger · RBI-compliant data residency (India only)

**Core Technologies:**
* LLM (fine-tuned GPT-class)
* LangGraph Agent Orchestration
* Vector DB (regulatory corpus)
* Account Aggregator (RBI AA)
* Apache Kafka (event streaming)
* dbt (data transformation)
* PostgreSQL + TimescaleDB
* React / React Native UI

---

## Agent Roadmap


* → **ComplianceBot** (GST/MCA/IT calendar + filings)
* → **Filing Agent** (GSTN, MCA, TRACES portals)
* → **Reconciliation Agent** (bank feeds, Tally)
* → **Knowledge Bot** (GST/IT/Companies Act corpus)


* → **Reporting Agent** (board packs, MIS, investor updates)
* → **Risk Sentinel** (compliance + financial risk scoring)
* → **Audit Agent** (transaction testing, evidence assembly)
* → **Due Diligence AI** (VC-grade financial DD)


* → **FXAgent** (cross-border compliance & hedging alerts)
* → **PayrollAgent** (salary processing, PF/ESI, Form 16)
* → **TaxPlanningAgent** (proactive tax optimisation advisory)
* → **ContractAgent** (end-to-end contract lifecycle management)

### The Vision
Finacra's AI agents don't just automate tasks. 
They replace the need for large back-office teams entirely — for CAs, founders, VCs and accelerators.
Every repetitive, rule-based financial task becomes an agent's responsibility.
Humans focus on judgment, relationships and growth.

**60% cost reduction.**
**10× throughput.**
**24/7 operation.**

*finacra.com | AI Agents Deep Dive · Confidential*