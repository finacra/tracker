import 'server-only'
import { prisma } from '@/lib/prisma'
import { chatCompletion } from '@/lib/api/openai'
import type { ComplianceAssessment, ComplianceRule, CompanyFact } from '@prisma/client'
import type { CompanyRuleProfile } from './rules/types'

/**
 * LLM fallback for low-confidence deterministic assessments.
 *
 * Runs only on assessments the deterministic evaluator marked
 * `evaluator_kind = "deterministic"` with `confidence < 0.8`. Gives the
 * model the rule's metadata + the company profile + all in-period facts
 * and asks for a yes/no with a short reasoning. Writes the decision back
 * with `evaluator_kind = "llm_assisted"` and whatever confidence the
 * model reports.
 *
 * Never overrides a user override. Never lowers an already-high
 * deterministic confidence — this is strictly an upgrade path.
 */

const SYSTEM_PROMPT = `You decide whether an Indian compliance rule applies to a specific
company for a specific financial year. You get:
- the rule's metadata (section, frequency, threshold, scope),
- the company's declared profile,
- all ground-truth facts collected for the FY (declared + extracted).

Decide one of: YES (applicable), NO (not applicable), UNSURE.

Rules:
- Trust the facts. If a threshold-gated rule (e.g. TDS on rent u/s 193/Sec 393(1)[Sl.2])
  has a clearly-below-threshold fact, answer NO.
- If the facts are silent on the gating kind, answer UNSURE — do NOT guess YES.
- When the company's industry / state / flags clearly disqualify the rule, answer NO.
- Confidence: 0.9+ only when the facts are unambiguous. 0.7-0.8 for normal
  inferences. 0.6 for UNSURE.

Return strict JSON: { "verdict": "YES"|"NO"|"UNSURE", "confidence": 0.0-1.0,
"reasoning": "one short paragraph citing facts and threshold" }.`

interface FallbackInput {
  companyId: string
  financialYear: string
  profile: CompanyRuleProfile
  /** Max number of low-confidence assessments to upgrade in one pass. */
  limit?: number
}

interface FallbackResult {
  considered: number
  upgraded: number
  stillUnsure: number
  errors: string[]
}

function factSummary(f: CompanyFact): string {
  const parts: string[] = [`${f.kind}`]
  if (f.amount !== null && f.amount !== undefined) {
    parts.push(`= ₹${Number(f.amount).toLocaleString('en-IN')}`)
    if (f.unit) parts.push(`(${f.unit})`)
  }
  if (f.counterparty) parts.push(`to/from ${f.counterparty}`)
  parts.push(`[${f.period_start.toISOString().slice(0, 10)}→${f.period_end.toISOString().slice(0, 10)}]`)
  parts.push(`src=${f.source_kind} conf=${f.confidence.toFixed(2)}`)
  return parts.join(' ')
}

function ruleSummary(r: ComplianceRule): string {
  const threshold = r.threshold_amount ? `₹${Number(r.threshold_amount).toLocaleString('en-IN')} ${r.threshold_basis ?? ''}` : 'none'
  return [
    `Rule: ${r.name}`,
    `Category: ${r.category}`,
    `Act: ${r.act}`,
    `Section: ${r.section_ref}${r.legacy_section_ref ? ` (formerly ${r.legacy_section_ref})` : ''}`,
    `Frequency: ${r.frequency}`,
    `Trigger: ${r.trigger_kind}, threshold: ${threshold}`,
    `Scope: ${JSON.stringify(r.entity_scope)}`,
    r.notes ? `Notes: ${r.notes}` : '',
  ].filter(Boolean).join('\n')
}

function profileSummary(p: CompanyRuleProfile): string {
  return [
    `type=${p.type}`,
    `state=${p.state}`,
    `NIC=${p.nicCode} (div=${p.nicDivision}, sec=${p.nicSection})`,
    `employees=${p.employeeCount}`,
    `turnover=₹${p.annualTurnoverLakhs}L`,
    `net_worth=₹${p.netWorthCrores}Cr`,
    `gst=${p.isGstRegistered}`,
    `msme=${p.isMsme}`,
    `imports_exports=${p.hasImportsExports}`,
    `dpiit=${p.isStartupDpiit}`,
    `listed=${p.isListed}`,
    `country=${p.countryCode}`,
  ].join(', ')
}

export async function upgradeLowConfidenceAssessments(input: FallbackInput): Promise<FallbackResult> {
  const result: FallbackResult = { considered: 0, upgraded: 0, stillUnsure: 0, errors: [] }
  const limit = input.limit ?? 20

  // Candidates: deterministic + low confidence + not overridden.
  const candidates = await prisma.complianceAssessment.findMany({
    where: {
      company_id: input.companyId,
      financial_year: input.financialYear,
      evaluator_kind: 'deterministic',
      confidence: { lt: 0.8 },
      user_overridden: false,
    },
    take: limit,
    orderBy: { confidence: 'asc' },
  })
  result.considered = candidates.length
  if (candidates.length === 0) return result

  // Batch load the rules + the whole fact sheet for the FY.
  const [rules, facts] = await Promise.all([
    prisma.complianceRule.findMany({
      where: { id: { in: candidates.map((c) => c.rule_id) } },
    }),
    prisma.companyFact.findMany({
      where: {
        company_id: input.companyId,
        superseded_by_id: null,
      },
    }),
  ])
  const ruleById = new Map(rules.map((r) => [r.id, r]))

  for (const assessment of candidates) {
    const rule = ruleById.get(assessment.rule_id)
    if (!rule) {
      result.errors.push(`rule ${assessment.rule_id} missing`)
      continue
    }

    const userPrompt = [
      `Financial year: ${input.financialYear}`,
      '',
      `Company profile: ${profileSummary(input.profile)}`,
      '',
      ruleSummary(rule),
      '',
      `Facts (${facts.length}):`,
      ...facts.map((f) => `  - ${factSummary(f)}`),
      '',
      `Current deterministic reasoning: ${assessment.reasoning}`,
      '',
      `Decide whether this rule applies. Return JSON only.`,
    ].join('\n')

    const raw = await chatCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 800 },
    )
    if (!raw) {
      result.errors.push(`llm unavailable for ${rule.id}`)
      continue
    }

    const first = raw.indexOf('{')
    const last = raw.lastIndexOf('}')
    if (first < 0 || last <= first) {
      result.errors.push(`llm returned non-json for ${rule.id}`)
      continue
    }

    let parsed: { verdict?: string; confidence?: number; reasoning?: string }
    try {
      parsed = JSON.parse(raw.slice(first, last + 1))
    } catch {
      result.errors.push(`parse failed for ${rule.id}`)
      continue
    }

    const verdict = (parsed.verdict || '').toUpperCase()
    const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7
    const reasoning = parsed.reasoning || assessment.reasoning

    if (verdict === 'YES' || verdict === 'NO') {
      await prisma.complianceAssessment.update({
        where: { id: assessment.id },
        data: {
          applicable: verdict === 'YES',
          reasoning,
          confidence,
          evaluator_kind: 'llm_assisted',
          assessed_at: new Date(),
          assessed_by: 'agent:llm_v1',
        },
      })
      result.upgraded++
    } else {
      result.stillUnsure++
    }
  }

  return result
}

// Legacy export expected by evaluateCompliance call sites if/when they
// want to chain the fallback automatically. Kept typed.
export type { FallbackResult }
