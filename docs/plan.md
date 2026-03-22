# Finacra AI - Phase 2 Development Plan
## AI Agents & Firm-Specific Dashboards

**Phase Duration:** April 1, 2026 - July 1, 2026 (3 months)  
**Status:** Planning & Development  
**Target:** MVP Launch of Core AI Agents + Firm Dashboards

---

## Executive Summary

Phase 2 focuses on transforming Finacra from a compliance tracking platform into an AI-powered autonomous compliance and financial management system. Based on the March 2026 meeting, this phase has two non-negotiable priorities: **(1) extensive testing and hardening of the compliance tracker and document vault**, and **(2) deploying the Compliance Sentinel and Document Intelligence agents before any other agent work begins** — including e‑invoicing. The e‑invoicing / filing agent follows only after Sentinel and Document Intelligence are stable. This phase also introduces **3 firm-specific dashboards** for CA firms, VCs, and accelerators.

**Key Deliverables (Updated After March 2026 Meeting):**
- ✅ Core Risk & Document AI Agents (MVP): **Compliance Sentinel**, **Document Intelligence** — deployed first, ahead of all other agents
- ✅ Foundation for Additional Agents (Filing / E‑Invoicing deferred until after Sentinel + Doc Intelligence are stable; Reconciliation, Knowledge to follow)
- ✅ 3 Firm Dashboards: CA Firm Portal, VC Fund Dashboard, Accelerator Command Center
- ✅ Core Infrastructure: Agent orchestration framework, portal integrations, data connectors

**Sequencing Mandate (March 2026 Meeting):** Compliance Sentinel and Document Intelligence agents are the **exclusive agent focus for Month 1**. The e‑invoicing / filing agent will not be built until Sentinel and Document Intelligence have been tested and stabilised. This order is non-negotiable for Phase 2.

**Realistic Scope:** We're building MVP versions that demonstrate autonomous capability while maintaining human oversight. The **primary focus for all 3 months is testing, hardening, and operationalising the existing compliance tracker and document vault.** AI agents are layered on top progressively through dot releases. Full-featured agents (including advanced e‑invoicing and reconciliation) will be enhanced in Phase 3 based on user feedback.

---

## Development Timeline

### Month 1: Foundation & Core Sentinel & Doc Intelligence (April 1 - April 30, 2026)

**Focus:** Build agent infrastructure + Compliance Sentinel & Document Intelligence (MVP)

#### Week 1-2: Infrastructure Setup
- **Agent Orchestration Framework**
  - AgentOS core system (task queue, retry logic, error handling)
  - Human-in-the-loop approval gates
  - Audit logging system
  - Agent status monitoring dashboard
- **Data Layer Enhancements**
  - Unified data graph schema
  - Real-time event streaming setup (Kafka/PubSub)
  - Portal integration framework (GSTN, MCA21 API connectors)

#### Week 3-4: Compliance Sentinel & Document Intelligence MVP
- **Compliance Sentinel (Risk & Alert Engine)**
  - Auto-generate and continuously maintain the compliance calendar from company profile
  - Track 50+ compliance items (GST, TDS, MCA, PT, PF)
  - Deadline calculation based on incorporation date, business type
  - Auto-update calendar when regulatory changes or notifications are detected
  - Risk scoring and alerting for overdue / at-risk items
- **Document Intelligence**
  - Intelligent ingestion of compliance and financial documents into the document vault
  - Basic extraction of key fields (entity, period, amounts, sections)
  - Classification of uploaded notices (GST, IT, MCA) and mapping to applicable compliance requirements
  - Draft basic response templates (LLM-powered) tied back to stored documents

**Deliverable:** Compliance Sentinel + Document Intelligence MVP operational, deeply integrated with the compliance tracker and document vault

---

### Month 2: Filing Agent + Firm Dashboards (May 1 - May 31, 2026)

**Focus:** Filing automation + CA Firm & VC Dashboards

#### Week 1-2: Filing Agent MVP
- **GST Portal Integration**
  - OAuth 2.0 authentication with GSTN
  - Pre-fill GSTR-1 and GSTR-3B from synced data
  - Validation engine (GSTIN, HSN codes, amounts)
  - One-click submission (with CA approval gate)
  - Store ARN/acknowledgment
- **MCA Portal Integration (Basic)**
  - AOC-4 and MGT-7 pre-fill
  - Submission workflow (approval required)
- **Filing Queue Management**
  - Multi-company filing queue
  - Sort by deadline urgency
  - CA approval inbox
  - Status tracking

#### Week 3-4: Firm-Specific Dashboards

**CA Firm Portal:**
- Multi-client view (all clients in one dashboard)
- Client compliance status overview
- Filing queue across all clients
- Revenue tracking per client
- Team assignment (assign filings to team members)
- Client communication hub (notices, alerts)

**VC Fund Dashboard:**
- Portfolio company overview (20-50 companies)
- Compliance health score per company
- Risk alerts aggregation
- Financial metrics dashboard (MRR, burn, runway)
- Due diligence report generator (basic version)
- Investment tracking

**Deliverable:** Filing Agent MVP + 2 firm dashboards operational

---

### Month 3: Reconciliation Agent + Knowledge Bot + Accelerator Dashboard (June 1 - June 30, 2026)

**Focus:** Financial automation + Knowledge system + Final dashboard

#### Week 1-2: Reconciliation Agent MVP
- **Bank Feed Integration**
  - Account Aggregator (AA) framework integration (RBI-compliant)
  - Daily transaction sync
  - Manual bank statement upload (fallback)
- **Auto-Matching Engine**
  - Rule-based matching (date ± 3 days, amount tolerance, party name fuzzy match)
  - GL auto-posting for matched entries
  - Exception flagging for human review
  - Reconciliation lock (approved periods)
- **Tally/Zoho Sync (Basic)**
  - One-way sync from accounting software
  - Chart of accounts mapping

#### Week 3: Knowledge Bot MVP
- **Regulatory Knowledge Base**
  - Vector database setup (regulatory corpus)
  - Fine-tuned LLM on Indian tax law, GST circulars, MCA notifications
  - Q&A interface for complex regulatory questions
  - Citation support (section references)
- **Integration Points**
  - Available in compliance tracker (contextual help)
  - Standalone chat interface
  - Notice response suggestions

#### Week 4: Accelerator Command Center + Polish
- **Accelerator Dashboard:**
  - Cohort management (40+ companies)
  - Batch compliance monitoring
  - Program milestone tracking
  - Cohort-wide reporting
  - Communication hub
- **System Polish:**
  - Performance optimization
  - Bug fixes
  - Documentation
  - User onboarding flows

**Deliverable:** All 4 agents MVP + 3 firm dashboards complete

---

## Priority Matrix

### 🔴 P0 - Critical (Must Have)
1. **ComplianceBot MVP** - Core value proposition
2. **Filing Agent (GST only)** - Immediate ROI for users
3. **CA Firm Portal** - Primary customer segment
4. **Agent Infrastructure** - Foundation for all agents

### 🟡 P1 - High Value (Should Have)
5. **Reconciliation Agent MVP** - Significant time savings
6. **VC Fund Dashboard** - High-value customer segment
7. **Knowledge Bot MVP** - Differentiator feature

### 🟢 P2 - Nice to Have (Can Defer)
8. **Accelerator Dashboard** - Smaller market, can be Phase 3
9. **MCA Filing Integration** - Lower priority than GST
10. **Advanced Notice Response** - Basic version sufficient for MVP

---

## Agent Feature Scope (MVP vs Full)

### Compliance Sentinel & Document Intelligence MVP (Month 1)
✅ Auto-generate and maintain compliance calendar  
✅ Track 50+ compliance items  
✅ Deadline alerts + risk scoring for overdue / at-risk items  
✅ Basic regulatory change detection  
✅ Notice and document classification (GST, IT, MCA)  
✅ Basic response templates tied to documents in the vault  
❌ Full regulatory scraping (Phase 3)  
❌ Advanced notice response generation (Phase 3)  
❌ Cross-client optimisation (Phase 3)  
❌ Advanced document understanding (multi-format, multi-language) (Phase 3)

### Filing Agent / E‑Invoicing Agent MVP (Month 2+)
✅ GST GSTR-1 & GSTR-3B filing  
✅ Pre-fill from synced data  
✅ Validation engine  
✅ CA approval workflow  
✅ ARN storage  
❌ TDS filing (Phase 3)  
❌ ITR filing (Phase 3)  
❌ Advanced error recovery (Phase 3)

### Reconciliation Agent MVP (Month 3)
✅ Bank feed sync (AA framework)  
✅ Auto-matching (85%+ accuracy target)  
✅ Exception flagging  
✅ GL auto-posting  
❌ Advanced ML matching (Phase 3)  
❌ Multi-currency support (Phase 3)  
❌ Advanced duplicate detection (Phase 3)

### Knowledge Bot MVP (Month 3)
✅ Regulatory Q&A  
✅ GST/IT/MCA knowledge base  
✅ Citation support  
✅ Contextual help in tracker  
❌ Multi-language support (Phase 3)  
❌ Advanced reasoning chains (Phase 3)  
❌ Document generation (Phase 3)

---

## Firm-Specific Dashboards

### CA Firm Portal (Month 2)
**Target Users:** CA firms managing 10-100 clients

**Features:**
- Multi-client dashboard (all clients in one view)
- Client compliance health scores
- Filing queue (sorted by urgency)
- Team assignment (assign work to team members)
- Client communication hub
- Revenue tracking per client
- Bulk operations (apply templates to multiple clients)
- Client onboarding workflow

**Success Metrics:**
- 80% reduction in filing preparation time
- 50% increase in clients per CA
- 2-minute average review time per filing

---

### VC Fund Dashboard (Month 2)
**Target Users:** VC funds managing 10-50 portfolio companies

**Features:**
- Portfolio company overview
- Compliance health score per company
- Risk alerts aggregation (compliance + financial)
- Financial metrics dashboard:
  - MRR, ARR, burn rate, runway
  - Revenue trends
  - Key metrics comparison
- Due diligence report generator (basic)
- Investment tracking (rounds, valuations)
- Portfolio-wide compliance calendar
- Automated investor updates (monthly)

**Success Metrics:**
- 90% reduction in portfolio monitoring time
- Due diligence cycle: 3-6 weeks → 2-3 days
- Real-time risk visibility

---

### Accelerator Command Center (Month 3)
**Target Users:** Accelerators/Incubators managing 20-100 cohort companies

**Features:**
- Cohort management (batch view)
- Batch compliance monitoring
- Program milestone tracking
- Cohort-wide reporting
- Communication hub (announcements, updates)
- Company progress tracking
- Resource library (templates, guides)
- Demo day preparation tools

**Success Metrics:**
- 70% reduction in program management overhead
- Automated compliance tracking for entire cohort
- Faster program delivery

---

## Technical Architecture

### Agent Infrastructure (Month 1)
- **AgentOS Core:**
  - Task queue (Redis/BullMQ)
  - Retry logic with exponential backoff
  - Error handling & alerting
  - Agent status monitoring
- **Human-in-the-Loop:**
  - Approval gates (3-tier system)
  - Review workflows
  - Audit logging
- **Data Layer:**
  - Unified data graph (PostgreSQL)
  - Event streaming (Kafka/PubSub)
  - Real-time sync

### Portal Integrations
- **GSTN (GST Portal):**
  - OAuth 2.0 authentication
  - API integration for GSTR-1, GSTR-3B
  - Secure credential storage
- **MCA21 (Companies Portal):**
  - Basic API integration
  - AOC-4, MGT-7 filing
- **Account Aggregator (RBI AA):**
  - Bank feed integration
  - Transaction sync
  - RBI-compliant data handling

### LLM & AI Components
- **Fine-tuned LLM:**
  - Regulatory corpus training
  - Notice classification
  - Response generation
- **Vector Database:**
  - Regulatory knowledge base
  - Semantic search
  - Citation support

---

## Risk Mitigation

### Technical Risks
1. **Portal API Changes**
   - Mitigation: Abstract API layer, fallback to manual upload
   - Timeline buffer: +1 week

2. **AA Framework Delays**
   - Mitigation: Manual bank statement upload as fallback
   - Alternative: Direct bank API integration (Phase 3)

3. **LLM Accuracy**
   - Mitigation: Human approval gates, confidence scoring
   - Fallback: Template-based responses

### Scope Risks
1. **Feature Creep**
   - Mitigation: Strict MVP definition, defer non-critical features
   - Buffer: 20% time reserved for polish

2. **Integration Complexity**
   - Mitigation: Prioritize GST (most used), defer others
   - Phased approach: One portal at a time

---

## Versioned Product Roadmap (Dot Releases for v1)

Over the next 3 months (April 1, 2026 – July 1, 2026), the **primary objective is testing and hardening the compliance tracker and document vault**. AI agents are introduced progressively through dot releases — each release is small, independently testable, and gated on the previous release being stable.

> **Sequencing rule:** No agent release proceeds until the preceding agent layer has completed internal testing. E‑invoicing / filing foundations do not start until v1.3.0 (Sentinel + Doc Intelligence) is confirmed stable.

---

### v1.0.0 – Foundation (Target: April 1–7, 2026)
**Theme:** Stable baseline — no new features, just a hardened, deployable product

**Compliance Tracker**
- Complete manual compliance calendar (all 50+ items configured)
- Deadline reminder notifications (email + in-app)
- Status update flows (pending → filed → overdue)
- Regression test suite covering core tracker flows

**Document Vault**
- Upload, search, and tagging working reliably across document types
- Folder structure and version history stable
- Bulk upload and download tested

**Infrastructure**
- AgentOS core scaffolded (task queue, retry logic, error handling)
- Audit logging live for all user actions
- Human-in-the-loop approval gate framework ready (not yet wired to any agent)
- Monitoring dashboard for system health

**Testing Goals**
- 100% of core tracker + vault user flows covered by integration tests
- Load test: 50 concurrent users, <2s response time
- Zero P0 bugs open at release

---

### v1.1.0 – Compliance Sentinel Alpha (Target: April 14–21, 2026)
**Theme:** Sentinel integrated with the compliance tracker — internal testing only

**Compliance Sentinel**
- Auto-generate compliance calendar from company profile (incorporation date, business type, GST registration)
- Track 50+ compliance items: GST, TDS, MCA, PT, PF
- Deadline calculation engine (statutory dates + grace periods)
- Risk scoring: overdue, at-risk, upcoming (7-day, 30-day buckets)
- Rule-based alerts: email + in-app notifications triggered by risk score changes
- Sentinel dashboard panel added to compliance tracker UI

**Testing & Rollout**
- Internal-only testing: 3–5 pilot client profiles (synthetic data)
- Manual QA checklist: calendar accuracy for 10+ company profiles
- No external users; feedback loop internal only

**Exit Criteria for v1.1.0**
- Calendar accuracy ≥95% across test profiles
- Zero missed deadlines on test set
- Alert delivery latency <5 min

---

### v1.2.0 – Document Intelligence Alpha (Target: May 1–10, 2026)
**Theme:** Intelligent document ingestion into the vault — closed beta with CA firms

**Document Intelligence**
- Intelligent ingestion pipeline: documents uploaded to vault are auto-processed
- Key field extraction: entity name, period, amounts, sections, notice reference numbers
- Notice/document classification: GST, Income Tax, MCA, Others
- Mapping classified notices to relevant compliance tracker items
- Draft response template generation (LLM-powered, tied to extracted fields + vault documents)
- Confidence scoring on all extractions (low-confidence items flagged for human review)

**Testing & Rollout**
- Closed beta: 5–10 CA firms (invited)
- Test set: 100+ real notices/documents across GST, IT, MCA categories
- Accuracy benchmarking: extraction accuracy, classification accuracy
- Feedback form embedded in UI for beta users to flag errors

**Exit Criteria for v1.2.0**
- Classification accuracy ≥90% across test document set
- Key field extraction accuracy ≥85%
- Response template accepted without major edits ≥70% of the time

---

### v1.3.0 – Sentinel + Document Intelligence Beta (Target: May 20 – June 5, 2026)
**Theme:** Combined workflows — expanded beta, performance tuning

**Combined Workflows**
- Sentinel risk alerts now link directly to relevant documents in the vault
- Document Intelligence notices auto-update compliance tracker item status
- Draft notice responses surface within the tracker (not just the vault)
- Unified timeline view: compliance events + document events in one feed
- Bulk notice processing for CA firms managing multiple clients

**Hardening**
- Performance tuning based on closed beta feedback (v1.2.0)
- Accuracy improvements to extraction and classification models
- Edge case handling: multi-period notices, amended returns, cross-entity documents
- Regression suite expanded to cover Sentinel ↔ Doc Intelligence interaction paths

**Testing & Rollout**
- Expanded beta: 20–30 CA firms
- A/B test: manual workflow vs. Sentinel-assisted workflow (time-to-completion metric)
- Weekly feedback review cycle

**Exit Criteria for v1.3.0**
- No P0/P1 bugs open
- Sentinel + Doc Intelligence integrated flows fully regression-tested
- Beta NPS ≥40

---

### v1.4.0 – Filing / E‑Invoicing Foundations (Target: June 10–20, 2026)
**Theme:** First filing automation — gated on v1.3.0 stability

> **Gate:** v1.4.0 work does not begin until v1.3.0 exit criteria are met and signed off.

**Filing Agent (GST only)**
- OAuth 2.0 authentication with GSTN portal
- Pre-fill GSTR-1 and GSTR-3B from synced compliance tracker data
- Validation engine: GSTIN format, HSN codes, amount cross-checks
- CA approval gate: one-click review + submit workflow
- ARN / acknowledgment storage in document vault
- Filing queue: multi-client view sorted by deadline urgency

**E‑Invoicing Groundwork**
- Schema handling for e-invoice JSON (IRN generation flow)
- Basic validation: mandatory fields, GSTIN, invoice date checks
- Not yet live — groundwork only, no production submissions

**Testing & Rollout**
- End-to-end testing with human-in-the-loop approvals (no automated submissions yet)
- Sandbox GSTN environment used exclusively
- Internal QA + 3–5 CA firm pilot users

**Exit Criteria for v1.4.0**
- GSTR-1 and GSTR-3B pre-fill accuracy ≥99%
- Validation engine catches all known error codes
- CA approval flow tested end-to-end with zero data loss

---

### v1.5.0 – v1 Stabilisation & Hardening (Target: June 25 – July 1, 2026)
**Theme:** Polish, test coverage, and Phase 3 readiness

**Stabilisation**
- All P0 and P1 bugs resolved across compliance tracker, document vault, Sentinel, Doc Intelligence, and Filing Agent
- Performance optimisation: query tuning, caching, background job efficiency
- UX polish: onboarding flows, empty states, error messages, loading states
- Accessibility pass on core screens

**Test Coverage**
- Full regression suite: compliance tracker + document vault (target: 90%+ coverage)
- Integration tests for all agent-to-tracker and agent-to-vault interactions
- Load test: 200 concurrent users, <2s p95 response time
- Security review: auth flows, document access controls, API key handling

**Documentation & Readiness**
- Internal runbooks for each agent and integration
- User-facing help docs for CA firm beta users
- API documentation for portal integrations
- Phase 3 backlog groomed and prioritised (reconciliation, knowledge bot, advanced e‑invoicing)

**Exit Criteria for v1.5.0 (Phase 2 Completion)**
- Zero P0 bugs, <5 P1 bugs open
- All regression suites passing
- Phase 3 backlog reviewed and signed off

---

## Success Metrics

### Agent Performance
- **ComplianceBot:**
  - 200+ compliance items tracked per client/year
  - 99%+ calendar accuracy
  - <5 min notice classification time

- **Filing Agent:**
  - 2 min average CA review time per filing
  - 99%+ filing accuracy
  - 0% penalty rate for compliant clients

- **Reconciliation Agent:**
  - 85%+ auto-match rate
  - 92% reduction in manual reconciliation time
  - D+1 books always current

- **Knowledge Bot:**
  - 90%+ answer accuracy
  - <10 sec response time
  - 80%+ user satisfaction

### Business Metrics
- **CA Firms:**
  - 50% increase in clients per CA
  - ₹18-30L/year cost savings per firm

- **VC Funds:**
  - 90% reduction in portfolio monitoring time
  - Due diligence: 3-6 weeks → 2-3 days

- **Accelerators:**
  - 70% reduction in program management overhead
  - Automated compliance for entire cohort

---

## Phase 3 Preview (Post-July 2026)

**Not in Phase 2, but planned for Phase 3:**
- Risk Sentinel (compliance + financial risk monitoring)
- Audit Agent (transaction testing, evidence assembly)
- Due Diligence AI (full-featured VC DD)
- Reporting Agent (automated board packs, MIS)
- Advanced portal integrations (TDS, ITR, state portals)
- ML-enhanced reconciliation
- Multi-currency support
- Advanced regulatory scraping
- Mobile app

---

## Team & Resources

### Required Team
- **Backend Engineers:** 3-4 (agent development, integrations)
- **Frontend Engineers:** 2-3 (dashboards, UI)
- **AI/ML Engineers:** 2 (LLM fine-tuning, vector DB)
- **QA Engineers:** 1-2 (testing, validation)
- **DevOps:** 1 (infrastructure, deployment)

### External Dependencies
- GSTN API access (apply early)
- Account Aggregator framework access
- MCA21 API credentials
- LLM API (OpenAI/Anthropic) or self-hosted

---

## Conclusion

This 3-month plan is **realistic and achievable** because:

1. **Focused Scope:** Only 4 core agents (MVP), not all 8
2. **Phased Approach:** Build foundation first, then agents, then dashboards
3. **MVP Mindset:** Core functionality first, enhancements later
4. **Proven Tech:** Using established frameworks (OAuth, AA, LLM APIs)
5. **Buffer Time:** 20% reserved for polish and unexpected issues

**Post-Phase 2:** We'll have a working MVP that demonstrates autonomous compliance management, with clear path to full-featured agents in Phase 3.


---------
**Document Version:** 1.0  
**Next Review:** March 2026 (pre-development)
