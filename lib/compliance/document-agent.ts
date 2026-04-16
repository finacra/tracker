import 'server-only'
import { prisma } from '@/lib/prisma'
import { chatCompletion } from '@/lib/api/openai'
import { SYSTEM_TAXONOMY } from '@/lib/vault/taxonomy'
import { getRulesInForce, fyPeriod } from './catalogue'
import { currentIndianFY } from './facts'
import { processDocumentContent } from '@/lib/utils/document-processor'

/**
 * Document Intelligence Agent — v1
 *
 * Given an uploaded file (+ its extracted text), produce suggested
 * metadata the user can accept or edit before finalising the upload:
 *
 *   - name:            clean human-readable file name
 *   - folderSlug:      top-level system folder (or user folder id)
 *   - subFolderSlug:   nested sub-folder when applicable
 *   - documentType:    matching DocumentTemplate.document_name
 *   - periodType:      one-time | monthly | quarterly | annual
 *   - periodFY:        e.g. "2026-27"
 *   - periodKey:       month key (YYYY-MM) or quarter key (YYYY-Q1..Q4)
 *   - periodStart/End: ISO dates
 *   - frequency:       copied through from the matched rule/template
 *   - requirementId:   the ComplianceRule id this doc is evidence for
 *   - registrationDate / expiryDate (certificates)
 *   - facts:           the same CompanyFact candidates as before
 *
 * Runs AFTER processDocumentContent has populated chunk text. Is
 * cost-bounded: one Azure OpenAI call per document, strict JSON
 * shape, defensive parse.
 */

export interface DocumentAgentSuggestion {
  name: string | null
  folderSlug: string | null
  subFolderSlug: string | null
  documentType: string | null
  periodType: 'one-time' | 'monthly' | 'quarterly' | 'annual' | null
  periodFY: string | null
  periodKey: string | null
  periodStart: string | null
  periodEnd: string | null
  frequency: string | null
  requirementId: string | null
  registrationDate: string | null
  expiryDate: string | null
  confidence: number                  // 0..1, how confident overall
  reasoning: string
  /**
   * If the agent thinks this is a new version of an existing document,
   * the existing doc's id. Caller can offer "link as new version" UX.
   */
  candidateSupersedesDocumentId: string | null
  facts: Array<{
    kind: string
    amount?: number | null
    unit?: string | null
    periodStart: string
    periodEnd: string
    counterparty?: string | null
    confidence: number
    evidenceQuote?: string | null
    payload?: unknown
  }>
}

// ── Helpers ───────────────────────────────────────────────────────────────

function folderTaxonomySummary(): string {
  // Describe the system taxonomy for the prompt so the model can only
  // pick valid slugs. User-added folders are handled client-side after
  // the agent returns; they don't need to be in the prompt.
  const lines: string[] = []
  for (const top of SYSTEM_TAXONOMY) {
    lines.push(`- ${top.slug} (${top.name})`)
    if (top.children?.length) {
      for (const child of top.children) {
        lines.push(`  - ${child.slug} (${child.name})`)
      }
    }
  }
  return lines.join('\n')
}

async function reassembleChunks(documentId: string): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ content: string }>>`
    SELECT content FROM public.document_chunks_internal
    WHERE document_id = ${documentId}::uuid
    ORDER BY (metadata->>'page')::int NULLS LAST, id
  `
  return rows.map((r) => r.content).join('\n\n')
}

async function waitForChunks(documentId: string, timeoutMs = 15000): Promise<string> {
  // processDocumentContent is invoked before this; chunks may already
  // be written. Poll briefly so the first call still sees text.
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const text = await reassembleChunks(documentId)
    if (text.trim().length > 40) return text
    await new Promise((r) => setTimeout(r, 750))
  }
  return reassembleChunks(documentId)
}

// ── Main ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = (taxonomy: string, rulesSummary: string, companyState: string | null) => `You are the Document Intelligence Agent for Finacra — an Indian compliance-tracking SaaS.

Given the raw text of a file a user just uploaded, suggest the right place in the vault and the right compliance obligation it relates to, plus any extractable facts.

Folder taxonomy (system-seeded; every company has these):
${taxonomy}

Compliance obligations in force for this company (name, rule id, category, section):
${rulesSummary}

Company home state: ${companyState ?? 'unknown'}

Your job is to return strict JSON in this exact shape:

{
  "name": "clean human-readable file name, no extension, e.g. 'GSTR-3B - Jul 2026 - 29AABCX1234R1ZM'",
  "folderSlug": "one of the top-level slugs above",
  "subFolderSlug": "one of the nested slugs under that top-level folder, or null",
  "documentType": "e.g. 'GSTR-3B' / 'Form 140' / 'PAN Card' / 'Rent Agreement' / null",
  "periodType": "one-time | monthly | quarterly | annual | null",
  "periodFY": "YYYY-YY or null",
  "periodKey": "YYYY-MM (monthly) | YYYY-Q1..Q4 (quarterly) | null",
  "periodStart": "YYYY-MM-DD or null",
  "periodEnd": "YYYY-MM-DD or null",
  "frequency": "same as periodType when applicable, else 'one-time'",
  "requirementId": "rule id the document evidences, or null if no match",
  "registrationDate": "YYYY-MM-DD for certificates (COI, licences), else null",
  "expiryDate": "YYYY-MM-DD for licences/registrations with renewal, else null",
  "confidence": 0.0-1.0,
  "reasoning": "1-2 short sentences on how you chose the folder + period",
  "facts": [
    { "kind": "rent.monthly_payment", "amount": 22000, "unit": "rupees_per_month",
      "periodStart": "2025-04-01", "periodEnd": "2026-03-31",
      "counterparty": "M/s Patel Estates", "confidence": 0.95,
      "evidenceQuote": "monthly rent of Rs 22,000/-" }
  ]
}

Routing rules:
- PAN / TAN / COI / MOA / AOA / Share Certificate / DIN Certificate
  → folderSlug: "constitutional", subFolderSlug matches.
- TDS return / TDS certificate (Form 140, 24Q, 26Q, 27Q, 168, 16, 16A)
  → folderSlug: "statutory-compliances", subFolderSlug: "tds".
- Advance tax challan (ITNS 280 / instalment proof)
  → "statutory-compliances" / "advance-tax".
- ITR acknowledgement / computation (ITR-1..7, 139)
  → "statutory-compliances" / "itr".
- Tax audit report (3CA-3CD / 3CB-3CD) → "statutory-compliances" / "tax-audit".
- GSTR-*, CMP-08, PMT-06 → "statutory-compliances" / "gst".
- AOC-4, MGT-7/7A, DIR-*, DPT-3, INC-20A/22, PAS-3, CHG-1/4, MSME-1, ADT-1/3
  → "mca-filings".
- Trade licence, FSSAI, factory licence, pollution licence, RERA, IEC, PT reg,
  MSME/Udyam → "licences".
- Balance sheet, P&L, audit report (not tax audit), cash flow → "financials".

If unsure, pick the BEST match and return confidence 0.6 — do NOT invent a folder.

FIELD COMPLETION RULES — fill EVERY field, think holistically:
- periodKey: for annual filings use the FY label (e.g., "2024-25"); for quarterly
  use "YYYY-Q1" through "Q4"; for monthly use "YYYY-MM".
- registrationDate: the date the document was FILED / signed / issued / stamped.
  Look for: MCA filing date, SRN date, digital signature date, "Date of filing",
  "Date of signing", acknowledgement date, certificate issue date. If absent,
  use the document's creation date or the earliest date mentioned.
- expiryDate: when this document's validity or compliance window ENDS. Rules:
  * For annual compliances (MGT-7/7A, AOC-4, DIR-KYC, ITR, tax audit, GSTR-9):
    one day before the next year's due date.
    Example: MGT-7A filed for FY 2024-25, due date is 29 Nov 2025 →
    expiryDate = "2026-11-28" (the day before MGT-7A due for FY 2025-26).
  * For monthly compliances: last day of the filing month.
  * For quarterly: last day of the quarter's final month.
  * For licences/certificates: the explicit expiry date on the document.
  * For one-time (COI, MOA, AOA, Share Certs): leave null (no expiry).
- requirementId: match against the compliance obligations list above. For MCA
  filings look for rules containing "mgt-7", "aoc-4", "dir-kyc", "adt-1", etc.
  For TDS returns look for "tds-return". For ITR look for "itr-". For GST
  look for "gstr-". Always populate this when there's a match.

For facts: only emit facts grounded in the document; confidence ≥ 0.6; follow
the same kinds used elsewhere (rent.monthly_payment, contractor.annual_spend,
salary.annual_bill, headcount.total, turnover.annual, gst.registered_state,
director.remuneration, imports.annual_value, exports.annual_value).
Return { ..., "facts": [] } if nothing extractable.`

function rulesForPrompt(rules: Awaited<ReturnType<typeof getRulesInForce>>): string {
  // Compact listing — enough for the model to map docs to rules without
  // blowing the token budget.
  return rules.slice(0, 60).map((r) =>
    `- ${r.id} · ${r.name} · ${r.category} · ${r.section_ref}`,
  ).join('\n')
}

export async function analyzeDocument(options: {
  companyId: string
  documentId: string
  companyState?: string | null
  rawText?: string  // when provided, skip chunk reassembly entirely
}): Promise<{
  suggestion: DocumentAgentSuggestion | null
  errors: string[]
}> {
  const errors: string[] = []

  // Use rawText if provided (from inline extraction), otherwise fall back
  // to reassembling from chunks (legacy path for docs already processed).
  const text = options.rawText || await waitForChunks(options.documentId)
  if (!text.trim()) {
    errors.push('no_text_available')
    return { suggestion: null, errors }
  }
  const truncated = text.length > 24000 ? text.slice(0, 24000) : text

  // Rules in force for this company's current FY. We scope to current FY
  // because most docs pertain to the current year; users can correct
  // historical filings after the fact in the review modal.
  const fy = currentIndianFY()
  const { periodStart, periodEnd } = fyPeriod(fy)
  const rules = await getRulesInForce({ periodStart, periodEnd })

  const system = SYSTEM_PROMPT(
    folderTaxonomySummary(),
    rulesForPrompt(rules),
    options.companyState ?? null,
  )

  const raw = await chatCompletion(
    [
      { role: 'system', content: system },
      { role: 'user', content: `Document text (truncated to first 24k chars):\n\n${truncated}` },
    ],
    { maxTokens: 2500 },  // JSON with folder, period, requirement, 0-30 facts ≈ 400-1500 tokens
  )
  if (!raw) {
    errors.push('llm_unavailable')
    return { suggestion: null, errors }
  }

  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first < 0 || last <= first) {
    errors.push('llm_response_not_json')
    return { suggestion: null, errors }
  }
  let parsed: any
  try {
    parsed = JSON.parse(raw.slice(first, last + 1))
  } catch {
    errors.push('llm_response_parse_failed')
    return { suggestion: null, errors }
  }

  // Duplicate detection — if there's an existing non-draft document with
  // the same document_type + period in this company, surface it as a
  // supersede candidate.
  let candidateSupersedesDocumentId: string | null = null
  if (parsed.documentType && parsed.periodKey) {
    const candidate = await prisma.companyDocument.findFirst({
      where: {
        company_id: options.companyId,
        document_type: parsed.documentType,
        period_key: parsed.periodKey,
        is_draft: false,
        deleted_at: null,
        is_latest: true,
      },
      select: { id: true },
    })
    if (candidate) candidateSupersedesDocumentId = candidate.id
  }

  const suggestion: DocumentAgentSuggestion = {
    name: parsed.name ?? null,
    folderSlug: parsed.folderSlug ?? null,
    subFolderSlug: parsed.subFolderSlug ?? null,
    documentType: parsed.documentType ?? null,
    periodType: parsed.periodType ?? null,
    periodFY: parsed.periodFY ?? null,
    periodKey: parsed.periodKey ?? null,
    periodStart: parsed.periodStart ?? null,
    periodEnd: parsed.periodEnd ?? null,
    frequency: parsed.frequency ?? null,
    requirementId: parsed.requirementId ?? null,
    registrationDate: parsed.registrationDate ?? null,
    expiryDate: parsed.expiryDate ?? null,
    confidence: typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.6,
    reasoning: parsed.reasoning ?? '',
    candidateSupersedesDocumentId,
    facts: Array.isArray(parsed.facts) ? parsed.facts.filter((f: any) =>
      typeof f?.kind === 'string' &&
      typeof f?.confidence === 'number' && f.confidence >= 0.6
    ) : [],
  }
  return { suggestion, errors }
}

/**
 * End-to-end: takes a freshly-uploaded draft document, processes its
 * content (OCR + chunks + embeddings), runs the agent, stores the
 * suggestion on the draft row, and returns it to the caller.
 */
export async function analyzeAndStoreSuggestion(options: {
  companyId: string
  documentId: string
}): Promise<{ suggestion: DocumentAgentSuggestion | null; errors: string[] }> {
  const doc = await prisma.companyDocument.findFirst({
    where: { id: options.documentId, company_id: options.companyId },
    select: { id: true, file_path: true, company_id: true },
  })
  if (!doc) return { suggestion: null, errors: ['document_not_found'] }

  // Extract text INLINE and pass it directly to the agent. The agent
  // only needs raw text — it doesn't need chunks or embeddings. Those
  // are for CIA semantic search and can be generated in the background
  // later (via processDocumentContent). This eliminates the dependency
  // on the chunk pipeline which was failing silently at the embedding step.
  const serverLog: string[] = []
  let extractedText = ''
  try {
    const { createStorageAdapter } = await import('@/lib/storage/factory')
    const storage = createStorageAdapter()

    serverLog.push(`downloading: ${doc.file_path}`)
    const buffer = await storage.downloadFile('company-documents', doc.file_path)
    serverLog.push(`downloaded: ${buffer.length} bytes`)

    const ext = doc.file_path.slice(doc.file_path.lastIndexOf('.')).toLowerCase()

    // Step 1: try pdf-parse for PDFs
    if (ext === '.pdf') {
      try {
        if (typeof (global as any).DOMMatrix === 'undefined') (global as any).DOMMatrix = class DOMMatrix {}
        let parseAction: any
        try { parseAction = require('pdf-parse/lib/pdf-parse.js') } catch { parseAction = require('pdf-parse') }
        const actualParser = typeof parseAction === 'function' ? parseAction : (parseAction.default || parseAction)
        const result = await actualParser(buffer, {
          pagerender: (pageData: any) => pageData.getTextContent().then((tc: any) => tc.items.map((i: any) => i.str).join(' '))
        })
        extractedText = result.text || ''
        serverLog.push(`pdf-parse: ${extractedText.trim().length} chars`)
      } catch (pdfErr) {
        serverLog.push(`pdf-parse FAILED: ${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)}`)
      }
    }

    // Step 2: OCR fallback if text is thin
    if (extractedText.trim().length < 100) {
      serverLog.push(`text too short (${extractedText.trim().length}), trying Azure DI OCR...`)
      try {
        const { extractTextWithOCR } = await import('@/lib/utils/document-intelligence')
        extractedText = await extractTextWithOCR(buffer)
        serverLog.push(`OCR success: ${extractedText.length} chars`)
      } catch (ocrErr) {
        const msg = ocrErr instanceof Error ? ocrErr.message : String(ocrErr)
        serverLog.push(`OCR FAILED: ${msg}`)
      }
    }

    if (!extractedText.trim()) {
      serverLog.push('NO TEXT EXTRACTED — cannot analyze')
    } else {
      serverLog.push(`text ready: ${extractedText.trim().length} chars for agent`)
    }

    // Background: kick off the full chunk + embed pipeline for CIA
    // semantic search. Non-blocking — don't await.
    processDocumentContent(doc.id, doc.company_id, doc.file_path).catch(err =>
      console.error('[document-agent] background chunk/embed failed (non-fatal):', err instanceof Error ? err.message : err)
    )
  } catch (err) {
    serverLog.push(`FATAL: ${err instanceof Error ? err.message : String(err)}`)
  }
  console.log('[document-agent] serverLog:', serverLog)

  // Pull company state (used in prompt for within/outside-state reasoning).
  const company = await prisma.company.findUnique({
    where: { id: options.companyId },
    select: { state: true },
  })

  const result = await analyzeDocument({
    companyId: options.companyId,
    documentId: options.documentId,
    companyState: company?.state ?? null,
    rawText: extractedText || undefined,  // pass text directly — skip chunk reassembly
  })

  // Surface ALL processing steps so the browser console shows exactly
  // what happened — download, pdf-parse, OCR, chunking — with no gaps.
  for (const line of serverLog) {
    result.errors.push(line)
  }

  if (result.suggestion) {
    // Round-trip through JSON.stringify so any undefined values become
    // absent keys instead of tripping Prisma's JsonValue type guard.
    const safeJson = JSON.parse(JSON.stringify(result.suggestion))
    try {
      await prisma.companyDocument.update({
        where: { id: doc.id },
        data: { agent_suggestions: safeJson, updated_at: new Date() },
      })
    } catch (err) {
      console.error('[document-agent] persist suggestion failed (non-fatal):',
        err instanceof Error ? err.message : err)
    }
  }
  return result
}
