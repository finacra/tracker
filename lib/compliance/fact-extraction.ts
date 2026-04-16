import 'server-only'
import { prisma } from '@/lib/prisma'
import { recordFact, type FactInput } from './facts'
import { chatCompletion } from '@/lib/api/openai'

/**
 * Fact Extraction Agent — v0
 *
 * Given an uploaded company document that's already been processed
 * (chunks + embeddings exist in document_chunks_internal), ask an
 * LLM to extract atomic, threshold-relevant facts for the compliance
 * evaluator. Writes them as CompanyFact rows with
 * source_kind="document_extracted" and confidence < 1.
 *
 * Kind taxonomy (v0 — extend in later phases):
 *  - rent.monthly_payment         amount per month, counterparty = landlord
 *  - contractor.annual_spend      amount per year, counterparty = contractor
 *  - salary.annual_bill           total salary disbursed in the FY
 *  - headcount.total              employees on roll at period end
 *  - gst.registered_state         categorical; payload.state
 *  - director.remuneration        amount per year, counterparty = director
 *
 * Intentional non-goals for v0:
 *  - No re-extraction on doc re-upload — caller decides when to re-run
 *  - No cross-document reconciliation — that's a later agent
 *  - No structured output / tools API — defensive JSON parse, same as the
 *    existing business-impact generator. Upgrade path noted inline.
 */

type ExtractedFactCandidate = {
  kind: string
  amount?: number | null
  unit?: string | null
  period_start: string           // YYYY-MM-DD
  period_end: string
  counterparty?: string | null
  payload?: unknown
  confidence: number             // 0..1 per-fact; agent's own call
  evidence_quote?: string | null // brief verbatim snippet for auditability
}

type ExtractResult = {
  documentId: string
  factsWritten: string[]         // CompanyFact ids
  skipped: number
  errors: string[]
}

const SYSTEM_PROMPT = `You are a compliance fact extractor for an Indian tax-compliance SaaS.
Given the raw text of a business document (rent agreement, contractor invoice,
salary register, employment contract, etc.), extract atomic facts the
applicability engine can use to decide whether TDS/GST/ROC/labour rules apply.

Rules:
- Emit ONLY facts grounded in the document. If a number is not stated, don't guess.
- Every amount is in Indian Rupees unless the text says otherwise.
- Normalise periods to Indian financial-year boundaries when the document
  implies a year ("FY 2025-26" → 2025-04-01 to 2026-03-31). When a document
  states a specific month or date range, use those dates verbatim.
- Confidence: 0.9+ when the document literally states the fact; 0.6-0.8 when
  you inferred it from context; below 0.6 means do NOT emit the fact.
- Skip categorical facts already typically captured in onboarding
  (employee count, turnover, MSME status) unless the document contradicts
  the declared value.

Return strict JSON of the shape:
{ "facts": [ { "kind": "rent.monthly_payment", "amount": 22000,
  "unit": "rupees_per_month", "period_start": "2025-04-01",
  "period_end": "2026-03-31", "counterparty": "M/s Patel Estates",
  "confidence": 0.95, "evidence_quote": "monthly rent of Rs 22,000/-" } ] }

Allowed kinds: rent.monthly_payment, contractor.annual_spend,
contractor.monthly_spend, salary.annual_bill, headcount.total,
director.remuneration, gst.registered_state, turnover.annual,
imports.annual_value, exports.annual_value.

If nothing extractable, return { "facts": [] }. Never invent facts.`

async function reassembleDocumentText(documentId: string): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ content: string }>>`
    SELECT content
    FROM public.document_chunks_internal
    WHERE document_id = ${documentId}::uuid
    ORDER BY (metadata->>'page')::int NULLS LAST, id
  `
  return rows.map((r) => r.content).join('\n\n')
}

function isoDateOrNull(s: string | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export async function extractFactsFromDocument(options: {
  companyId: string
  documentId: string
  createdBy?: string | null
  maxFacts?: number
}): Promise<ExtractResult> {
  const result: ExtractResult = { documentId: options.documentId, factsWritten: [], skipped: 0, errors: [] }
  const limit = options.maxFacts ?? 30

  const text = await reassembleDocumentText(options.documentId)
  if (!text.trim()) {
    result.errors.push('no_text_available')
    return result
  }

  // Truncate to keep prompt bounded. Most compliance-relevant docs are
  // short; rent agreements rarely exceed 15k chars; payroll registers are
  // structured. Anything bigger gets front-loaded so the LLM sees the
  // header + material clauses.
  const truncated = text.length > 24000 ? text.slice(0, 24000) : text

  const raw = await chatCompletion(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Extract facts from this document:\n\n${truncated}` },
    ],
    { maxTokens: 2000 },
  )

  if (!raw) {
    result.errors.push('llm_unavailable')
    return result
  }

  // Defensive JSON parse — the existing openai helper doesn't yet enforce
  // response_format:json_schema. Grab the first {...} block and parse.
  const firstBrace = raw.indexOf('{')
  const lastBrace = raw.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    result.errors.push('llm_response_not_json')
    return result
  }

  let parsed: { facts?: ExtractedFactCandidate[] }
  try {
    parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1))
  } catch {
    result.errors.push('llm_response_parse_failed')
    return result
  }

  const candidates = (parsed.facts || []).slice(0, limit)
  for (const candidate of candidates) {
    const periodStart = isoDateOrNull(candidate.period_start)
    const periodEnd = isoDateOrNull(candidate.period_end)
    if (!candidate.kind || !periodStart || !periodEnd) {
      result.skipped++
      continue
    }
    if (typeof candidate.confidence !== 'number' || candidate.confidence < 0.6) {
      result.skipped++
      continue
    }

    try {
      const factInput: FactInput = {
        companyId: options.companyId,
        kind: candidate.kind,
        periodStart,
        periodEnd,
        amount: typeof candidate.amount === 'number' ? candidate.amount : null,
        unit: candidate.unit ?? null,
        payload: {
          ...(typeof candidate.payload === 'object' && candidate.payload ? candidate.payload : {}),
          evidence_quote: candidate.evidence_quote ?? null,
        },
        counterparty: candidate.counterparty ?? null,
        sourceKind: 'document_extracted',
        sourceDocId: options.documentId,
        confidence: Math.min(1, Math.max(0, candidate.confidence)),
        createdBy: options.createdBy ?? null,
      }
      const id = await recordFact(factInput)
      result.factsWritten.push(id)
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  return result
}
