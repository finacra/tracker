/**
 * Historical compliance generator — produces past-period requirement
 * rows from existing recurring rules (those with `due_date_formula`).
 *
 * Two callers:
 *   • The "Previous Years" button in the tracker UI (server action).
 *   • The ingest worker (PR C) — invoked silently when an upload's
 *     extracted period has no matching requirement in the tracker.
 *     The worker generates the missing year on demand, then re-resolves
 *     the document → requirement linkage.
 *
 * Auth-agnostic: callers verify access first and pass userId. Same
 * pattern as `lib/compliance/smart-ingest.ts`.
 *
 * Idempotent: every INSERT is `ON CONFLICT (company_id, requirement,
 * period_key) DO NOTHING`. Re-running for the same company+years just
 * skips already-existing rows.
 */

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { computeDeadlines, buildIndianFYProfile } from '@/lib/services/deadline-engine'
import { stripPeriodSuffix } from '@/lib/utils/strip-period-suffix'

export interface HistoricalGenerationResult {
  generated: number
  yearsBack: number
  cappedAtIncorporation: boolean
}

export class NoIncorporationDateError extends Error {
  constructor() {
    super('Incorporation date not set on company')
    this.name = 'NoIncorporationDateError'
  }
}

export class NoRecurringRulesError extends Error {
  constructor() {
    super('No recurring requirements found — generate compliances first')
    this.name = 'NoRecurringRulesError'
  }
}

/**
 * Generate historical compliance rows for a company.
 *
 * @param companyId  target company
 * @param userId     UUID of the user / system identity to credit on
 *                   `app_created_by` / `app_updated_by`. The worker
 *                   passes the document's `created_by` so audit trails
 *                   stay coherent (silent backfill from upload).
 * @param yearsBack  how many FYs to walk back. Capped at incorporation
 *                   date — function returns `cappedAtIncorporation: true`
 *                   if the cap kicked in.
 * @returns          { generated, yearsBack, cappedAtIncorporation }
 */
export async function generateHistoricalForCompany(input: {
  companyId: string
  userId: string
  yearsBack: number
}): Promise<HistoricalGenerationResult> {
  const { companyId, userId, yearsBack } = input

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, incorporation_date: true },
  })
  if (!company) throw new Error('Company not found')

  const incorpDate = company.incorporation_date
  if (!incorpDate) throw new NoIncorporationDateError()

  // Cap yearsBack at incorporation date
  const now = new Date()
  const maxYearsBack = Math.floor((now.getTime() - incorpDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
  const actualYearsBack = Math.min(yearsBack, Math.max(maxYearsBack, 0))
  const cappedAtIncorporation = actualYearsBack < yearsBack

  if (actualYearsBack <= 0) {
    return { generated: 0, yearsBack: 0, cappedAtIncorporation: true }
  }

  // Compute the start date for historical generation, never before incorporation.
  const startDate = new Date(now)
  startDate.setFullYear(startDate.getFullYear() - actualYearsBack)
  const effectiveStart = startDate < incorpDate ? incorpDate : startDate

  // Pull recurring rules. The DB may have many rows per logical rule
  // (one per period); dedupe by (base_name, due_date_formula).
  const existingRules = await prisma.$queryRaw<any[]>(
    Prisma.sql`SELECT
      requirement, category, description, penalty, is_critical,
      compliance_type, year_type, country_code, required_documents,
      source, confidence_score, needs_ca_review, source_url,
      act, section, authority, due_date_formula, applicability_reason
    FROM regulatory_requirements
    WHERE company_id = ${companyId}::uuid
      AND due_date_formula IS NOT NULL
      AND compliance_type IN ('monthly', 'quarterly', 'half-yearly', 'annual')
    ORDER BY created_at DESC`
  )

  if (!existingRules || existingRules.length === 0) {
    throw new NoRecurringRulesError()
  }

  type RuleSource = (typeof existingRules)[number] & { baseName: string }
  const uniqueRulesByKey = new Map<string, RuleSource>()
  for (const r of existingRules as any[]) {
    const baseName = stripPeriodSuffix(String(r.requirement || ''))
    const key = `${baseName}|${r.due_date_formula}`
    if (!uniqueRulesByKey.has(key)) {
      uniqueRulesByKey.set(key, { ...r, baseName })
    }
  }

  const fyProfile = buildIndianFYProfile(incorpDate)
  let totalGenerated = 0

  for (const rule of Array.from(uniqueRulesByKey.values())) {
    if (!rule.due_date_formula) continue

    const monthsBack = actualYearsBack * 12
    const deadlines = computeDeadlines(
      rule.due_date_formula,
      fyProfile,
      monthsBack,
      effectiveStart
    )

    const pastDeadlines = deadlines.filter((dl: any) => dl.date < now)

    for (const dl of pastDeadlines) {
      const dueDate = dl.date.toISOString().split('T')[0]
      const periodKey = dl.period || null
      const periodLabel = dl.label || null
      const reqName = periodLabel ? `${rule.baseName} — ${periodLabel}` : rule.baseName
      const reqDocs = Array.isArray(rule.required_documents) ? rule.required_documents : []
      const reqDocsArray = `{${reqDocs.map((d: string) => `"${d.replace(/"/g, '\\"')}"`).join(',')}}`

      try {
        await prisma.$queryRaw(
          Prisma.sql`INSERT INTO regulatory_requirements (
            company_id, category, requirement, description, status,
            due_date, penalty, is_critical, compliance_type,
            year_type, country_code, required_documents,
            source, confidence_score, needs_ca_review,
            source_url, act, section, authority,
            due_date_formula, applicability_reason,
            period_key, period_label,
            app_created_by, app_updated_by, created_at, updated_at
          ) VALUES (
            ${companyId}::uuid, ${rule.category}::text, ${reqName}::text,
            ${rule.description || null}::text, 'overdue'::text, ${dueDate}::date,
            ${rule.penalty || null}::text, ${rule.is_critical || false}::boolean,
            ${rule.compliance_type || null}::text, ${rule.year_type || 'FY'}::text,
            ${rule.country_code || 'IN'}::text, ${reqDocsArray}::text[],
            ${rule.source || 'rules_engine'}::text,
            ${rule.confidence_score || 1.0}::double precision,
            ${false}::boolean, ${rule.source_url || null}::text,
            ${rule.act || null}::text, ${rule.section || null}::text,
            ${rule.authority || null}::text, ${rule.due_date_formula}::text,
            ${rule.applicability_reason || null}::text,
            ${periodKey}::text, ${periodLabel}::text,
            ${userId}::uuid, ${userId}::uuid, NOW(), NOW()
          ) ON CONFLICT (company_id, requirement, period_key)
            WHERE period_key IS NOT NULL DO NOTHING`
        )
        totalGenerated++
      } catch {
        // Skip constraint violations silently — same as the original.
      }
    }
  }

  return {
    generated: totalGenerated,
    yearsBack: actualYearsBack,
    cappedAtIncorporation,
  }
}

/**
 * Translate an Indian FY string ("2024-25") to "years back from now".
 * Returns 0 if the FY is current or future. Used by the ingest worker
 * to decide how far back to generate when an upload's period has no
 * matching requirement.
 */
export function yearsBackFromFY(fy: string): number {
  const m = /^(\d{4})-(\d{2,4})$/.exec(fy.trim())
  if (!m) return 0
  const startYear = parseInt(m[1], 10)
  if (!Number.isFinite(startYear)) return 0
  // Current Indian FY: starts April. April–Dec → year; Jan–Mar → year-1.
  const now = new Date()
  const currentFYStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return Math.max(0, currentFYStart - startYear)
}
