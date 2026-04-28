'use server'

import { createServerContainer } from '@/lib/composition/server-container'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import {
  generateComplianceIntelligence,
  detectRegulatoryChanges,
  validateExistingCompliances,
  type ComplianceGenerationResult,
  type GeneratedRequirement,
  type ValidationResult,
} from '@/lib/services/compliance-intelligence'
import { evaluateRules, buildProfileKey } from '@/lib/compliance/rules'
import type { EvaluatedCompliance, ComplianceRule } from '@/lib/compliance/rules'
import { buildRuleProfile, type CompanyForRuleEvaluation } from '@/lib/compliance/rules/profile-builder'
import { computeDeadlines, computeNextDeadline, buildIndianFYProfile, frequencyToComplianceType } from '@/lib/services/deadline-engine'
import { handleActionError } from '@/lib/errors/handle-error'
import { canUserEdit } from './actions'
import type { AppUser } from '@/domain/models/AppUser'

// ── Auth helpers ───────────────────────────────────────────────────────────

async function getCurrentUserOrNull(): Promise<AppUser | null> {
  const { authService } = createServerContainer()
  return authService.getCurrentUser()
}

// ── Generate Compliance Intelligence ───────────────────────────────────────

export interface GenerateComplianceResult {
  success: boolean
  batchId?: string
  totalGenerated?: number
  rulesEngineCount?: number
  aiCount?: number
  highConfidence?: number
  needsReview?: number
  missingProfileFields?: string[]
  // Validation layer stats
  validationRan?: boolean
  validatedCount?: number
  flaggedCount?: number
  removedByValidation?: number
  validationResults?: Array<{
    requirementName: string
    verdict: 'applicable' | 'not_applicable' | 'uncertain'
    reason: string
    sourceUrl: string | null
  }>
  error?: string
}

export async function generateComplianceForCompany(
  companyId: string,
  options?: { skipAI?: boolean }
): Promise<GenerateComplianceResult> {
  const t0 = Date.now()
  try {
    const user = await getCurrentUserOrNull()
    if (!user) return { success: false, error: 'Not authenticated' }

    const canEdit = await canUserEdit(companyId)
    if (!canEdit) return { success: false, error: 'Permission denied' }

    // Fetch company details — include all attributes for rules engine
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        type: true,
        nic_code: true,
        state: true,
        is_listed: true,
        incorporation_date: true,
        country_code: true,
        industries: true,
        industry_categories: true,
        employee_count: true,
        annual_turnover: true,
        is_gst_registered: true,
        net_worth: true,
        is_msme: true,
        msme_category: true,
        has_imports_exports: true,
        is_startup_dpiit: true,
      },
    })

    if (!company) return { success: false, error: 'Company not found' }

    // ── Step 1: Rules Engine (deterministic, $0) ──────────────────────
    const ruleProfile = buildRuleProfile(company as CompanyForRuleEvaluation)
    const rulesResult = evaluateRules(ruleProfile)

    // Fetch existing requirements (distinct by name) to avoid duplicating
    const existingRows = await prisma.$queryRaw<any[]>(
      Prisma.sql`SELECT DISTINCT ON (requirement) category, requirement, compliance_type, source
        FROM regulatory_requirements
        WHERE company_id = ${companyId}::uuid
        ORDER BY requirement, created_at DESC`
    )
    const existingRequirements = (existingRows || []).map((r: any) => ({
      category: r.category as string,
      requirement: r.requirement as string,
      compliance_type: r.compliance_type as string | null,
      source: r.source as string | null,
    }))

    // Filter out rules that already exist in DB (from templates or previous runs)
    const newRules = rulesResult.applicable.filter(
      (ec) => !isRuleDuplicate(ec.rule, existingRequirements)
    )

    // Insert rules engine results (auto-approved, high confidence)
    const batchId = `rules_${Date.now()}`
    let rulesInsertedCount = 0
    if (newRules.length > 0) {
      rulesInsertedCount = await bulkInsertRulesEngineResults(companyId, newRules, user.id, batchId, ruleProfile.incorporationDate)
    }
    console.log('[generateComplianceForCompany] rules engine done', { ms: Date.now() - t0, inserted: rulesInsertedCount })

    // ── Step 2: Perplexity AI (specialized, cached by profile key) ───
    // Validation (Step 3 in the old flow) is now a SEPARATE explicit
    // "Validate with AI" action — running it inline added 30-60s and
    // only catches edge cases. First-generate stays focused on getting
    // the user a usable tracker quickly: rules engine + AI discoveries.
    let aiCount = 0
    let needsReview = 0

    if (!options?.skipAI && company.nic_code) {
      // Refresh existing list after rules engine insert
      const allExisting = [
        ...existingRequirements,
        ...newRules.map((ec) => ({
          category: ec.rule.category,
          requirement: ec.rule.name,
          compliance_type: frequencyToComplianceType(ec.rule.frequency) || null,
          source: 'rules_engine' as string | null,
        })),
      ]

      try {
        const aiResult: ComplianceGenerationResult = await generateComplianceIntelligence(
          company,
          allExisting.map((r) => ({
            category: r.category,
            requirement: r.requirement,
            compliance_type: r.compliance_type,
          }))
        )

        if (aiResult.success && aiResult.requirements.length > 0) {
          await bulkInsertAIRequirements(companyId, aiResult.requirements, user.id)
          aiCount = aiResult.requirements.length
          needsReview = aiResult.needsReview
        }
      } catch (aiError) {
        // AI failure is non-fatal — rules engine results are already saved
        console.warn('[generateComplianceForCompany] AI generation failed (non-fatal):', aiError instanceof Error ? aiError.message : aiError)
      }
    }

    console.log('[generateComplianceForCompany] done', { totalMs: Date.now() - t0, rulesInsertedCount, aiCount })
    return {
      success: true,
      batchId,
      totalGenerated: rulesInsertedCount + aiCount,
      rulesEngineCount: rulesInsertedCount,
      aiCount,
      highConfidence: newRules.length,
      needsReview,
      missingProfileFields: rulesResult.missingProfileFields,
      // Validation no longer runs inline — left as zero/false. The
      // standalone validateComplianceForCompany action covers it.
      validationRan: false,
      validatedCount: 0,
      flaggedCount: 0,
      removedByValidation: 0,
      validationResults: [],
    }
  } catch (error) {
    console.error('[generateComplianceForCompany] threw',
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error.stack : '')
    return handleActionError(error)
  }
}

// ── Check if a rule already exists in DB ─────────────────────────────────

function isRuleDuplicate(
  rule: ComplianceRule,
  existing: { category: string; requirement: string; compliance_type: string | null }[]
): boolean {
  const ruleNameLower = rule.name.toLowerCase()
  const ruleSlug = rule.id.toLowerCase()

  return existing.some((e) => {
    const existingLower = e.requirement.toLowerCase()
    // Exact match
    if (existingLower === ruleNameLower) return true
    // Slug contained in existing name or vice versa
    if (existingLower.includes(ruleSlug) || ruleSlug.includes(existingLower.replace(/\s+/g, '-'))) return true
    // Significant overlap: 3+ word match in same category
    if (e.category === rule.category) {
      const ruleWords = ruleNameLower.split(/[\s\-—]+/).filter((w) => w.length > 3)
      const existingWords = existingLower.split(/[\s\-—]+/).filter((w) => w.length > 3)
      const overlap = ruleWords.filter((w) => existingWords.includes(w))
      if (overlap.length >= 3) return true
    }
    return false
  })
}

// ── Bulk Insert Rules Engine Results ─────────────────────────────────────
//
// Old implementation did:
//   for each rule (~30):
//     for each deadline (~24 periods over 2 FYs):
//       SELECT 1 FROM regulatory_requirements WHERE …  -- existence check
//       INSERT INTO regulatory_requirements …            -- one row
//
// At ~720 round-trips × ~5ms PgBouncer overhead, that's ~3.6s of pure
// network latency on top of any actual SQL work. Combined with cold
// starts and the LLM call later in the pipeline, this was a major
// reason generation hit Vercel's function timeout.
//
// New implementation:
//   1) Single SELECT to fetch ALL existing (requirement, period_key)
//      tuples for the company. (One round-trip, regardless of rule count.)
//   2) Build candidate rows in memory.
//   3) Filter out ones that already exist.
//   4) Single multi-VALUES INSERT for the rest. (One round-trip.)

interface PendingInsert {
  category: string
  requirement: string
  description: string
  status: string
  dueDate: string | null
  penalty: string | null
  isCritical: boolean
  complianceType: string | null
  requiredDocsArray: string
  sourceUrl: string | null
  act: string | null
  section: string | null
  authority: string | null
  dueDateFormula: string | null
  matchReasons: string
  periodKey: string | null
  periodLabel: string | null
}

async function bulkInsertRulesEngineResults(
  companyId: string,
  evaluated: EvaluatedCompliance[],
  userId: string,
  batchId: string,
  incorporationDate: Date | null
): Promise<number> {
  const fyProfile = buildIndianFYProfile(incorporationDate || new Date())
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // Step 1: ONE round-trip to fetch all existing (requirement, period_key)
  // pairs for this company. We use COALESCE to normalise NULL period_key
  // to '' so set-membership checks match the JS-side keys we build below.
  const existingRows = await prisma.$queryRaw<Array<{ requirement: string; period_key: string | null }>>(
    Prisma.sql`SELECT requirement, period_key
      FROM regulatory_requirements
      WHERE company_id = ${companyId}::uuid`
  )
  const existingKeys = new Set(
    (existingRows || []).map((r) => `${r.requirement}|${r.period_key ?? ''}`)
  )

  // Step 2: Build all pending rows in memory.
  const pending: PendingInsert[] = []

  for (const ec of evaluated) {
    const rule = ec.rule
    const complianceType = frequencyToComplianceType(rule.frequency)
    const requiredDocs = rule.documentsRequired || []
    const requiredDocsArray = `{${requiredDocs.map((d: string) => `"${d.replace(/"/g, '\\"')}"`).join(',')}}`
    const matchReasons = ec.matchedConditions.join('; ')
    const missingWarnings = ec.missingData.length > 0
      ? `\n\n⚠️ Missing data: ${ec.missingData.join('; ')}`
      : ''
    const description = `${rule.applicabilityReason}${missingWarnings}`
    const isRecurring = ['monthly', 'quarterly', 'half-yearly', 'annual'].includes(rule.frequency)

    if (isRecurring && rule.dueDateFormula) {
      const deadlines = computeDeadlines(rule.dueDateFormula, fyProfile, 24, undefined, fyProfile.financialYearStart)
      if (deadlines.length > 0) {
        for (const dl of deadlines) {
          const dueDate = dl.date.toISOString().split('T')[0]
          const periodKey = dl.period || null
          const periodLabel = dl.label || null
          const dueDay = new Date(dl.date.getFullYear(), dl.date.getMonth(), dl.date.getDate())
          const status = dueDay < today ? 'overdue' : 'not_started'
          const reqName = periodLabel ? `${rule.name} — ${periodLabel}` : rule.name
          const key = `${reqName}|${periodKey ?? ''}`
          if (existingKeys.has(key)) continue
          existingKeys.add(key) // dedup within this run too
          pending.push({
            category: rule.category,
            requirement: reqName,
            description,
            status,
            dueDate,
            penalty: rule.penalty,
            isCritical: rule.isCritical,
            complianceType: complianceType || null,
            requiredDocsArray,
            sourceUrl: rule.sourceUrl,
            act: rule.act,
            section: rule.section,
            authority: rule.authority,
            dueDateFormula: rule.dueDateFormula,
            matchReasons,
            periodKey,
            periodLabel,
          })
        }
        continue
      }
      // fall through to single-row insert below
    }

    // Single-row (non-recurring or no deadlines computed) path
    let dueDate: string | null = null
    try {
      const nextDate = computeNextDeadline(rule.dueDateFormula, fyProfile)
      if (nextDate) dueDate = nextDate.toISOString().split('T')[0]
    } catch { /* non-fatal */ }
    const key = `${rule.name}|`
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    pending.push({
      category: rule.category,
      requirement: rule.name,
      description,
      status: 'not_started',
      dueDate,
      penalty: rule.penalty,
      isCritical: rule.isCritical,
      complianceType: complianceType || null,
      requiredDocsArray,
      sourceUrl: rule.sourceUrl,
      act: rule.act,
      section: rule.section,
      authority: rule.authority,
      dueDateFormula: rule.dueDateFormula,
      matchReasons,
      periodKey: null,
      periodLabel: null,
    })
  }

  if (pending.length === 0) return 0

  // Step 3: ONE round-trip — multi-VALUES INSERT.
  // PostgreSQL parameter limit is 65k; we have 26 params/row, so chunk
  // generously (1000 rows ≈ 26k params) — well under the cap and never
  // anywhere close to it for a real company (~30 rules × 24 deadlines).
  const CHUNK = 1000
  let totalInserted = 0
  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK)
    const valuesSql = chunk.map((p) => Prisma.sql`(
      ${companyId}::uuid, ${p.category}::text, ${p.requirement}::text,
      ${p.description}::text, ${p.status}::text, ${p.dueDate}::date,
      ${p.penalty}::text, ${p.isCritical}::boolean,
      ${p.complianceType}::text, 'FY'::text, 'IN'::text,
      ${p.requiredDocsArray}::text[], 'rules_engine'::text,
      ${1.0}::double precision, ${false}::boolean,
      ${p.sourceUrl}::text, ${p.act}::text, ${p.section}::text,
      ${p.authority}::text, ${p.dueDateFormula}::text,
      ${p.matchReasons}::text, ${batchId}::text,
      ${p.periodKey}::text, ${p.periodLabel}::text,
      ${userId}::uuid, ${userId}::uuid, NOW(), NOW()
    )`)
    await prisma.$executeRaw(Prisma.sql`INSERT INTO regulatory_requirements (
      company_id, category, requirement, description, status,
      due_date, penalty, is_critical, compliance_type,
      year_type, country_code, required_documents,
      source, confidence_score, needs_ca_review,
      source_url, act, section, authority,
      due_date_formula, applicability_reason, ai_batch_id,
      period_key, period_label,
      app_created_by, app_updated_by, created_at, updated_at
    ) VALUES ${Prisma.join(valuesSql, ',')}`)
    totalInserted += chunk.length
  }

  return totalInserted
}

// ── Bulk Insert AI Requirements ────────────────────────────────────────────

/**
 * Strip year tokens (4-digit years 19xx-21xx, `FY 2024-25`, `2023-24`,
 * trailing " — For Apr 2026" period labels, etc) from an AI-generated
 * compliance NAME so the name itself is year-agnostic. The actual year
 * lives in due_date / period_key / period_label — names with hard-coded
 * years break historical generation, where the same rule needs to apply
 * to multiple FYs.
 */
function stripYearFromName(name: string): string {
  let out = name
  // Remove " — For <Month> <Year>" trailing labels
  out = out.replace(/\s*[—–-]\s*for\s+[A-Za-z]+\s*\d{4}\s*$/i, '')
  // Remove standalone "FY 2024-25" / "FY2024-25" / "F.Y. 2024-25"
  out = out.replace(/\bF\.?Y\.?\s*\d{4}\s*[-–]\s*\d{2,4}\b/gi, '')
  // Remove "2024-25" / "2024–25" pairs
  out = out.replace(/\b\d{4}\s*[-–]\s*\d{2,4}\b/g, '')
  // Remove standalone 4-digit years 19xx-21xx
  out = out.replace(/\b(19|20|21)\d{2}\b/g, '')
  // Cleanup leftover separators / double spaces
  out = out.replace(/\s+[—–-]\s*$/g, '')
  out = out.replace(/\s{2,}/g, ' ').trim()
  return out || name // fallback to original if we stripped everything
}

async function bulkInsertAIRequirements(
  companyId: string,
  requirements: GeneratedRequirement[],
  userId: string
): Promise<void> {
  if (requirements.length === 0) return

  // Sanitize names — strip year tokens so historical generation can
  // re-deadline the same rule for any FY without baking the wrong year
  // into the requirement name.
  const sanitized = requirements.map((r) => ({ ...r, requirement: stripYearFromName(r.requirement) }))

  // Idempotency: prefetch existing requirement names for this company
  // and skip any AI items that match (case-insensitive). Prevents
  // duplicates when the user clicks Generate / Re-evaluate again.
  const existingRows = await prisma.$queryRaw<Array<{ requirement: string }>>(
    Prisma.sql`SELECT DISTINCT requirement FROM regulatory_requirements WHERE company_id = ${companyId}::uuid`
  )
  const existingNorm = new Set(
    (existingRows || []).map((r) => r.requirement.trim().toLowerCase())
  )
  const fresh = sanitized.filter((r) => !existingNorm.has(r.requirement.trim().toLowerCase()))
  if (fresh.length === 0) {
    console.log('[bulkInsertAIRequirements] all items already exist — nothing to insert')
    return
  }
  console.log('[bulkInsertAIRequirements]', {
    received: requirements.length,
    sanitized: sanitized.length,
    skippedDuplicates: sanitized.length - fresh.length,
    inserting: fresh.length,
  })

  // Single multi-VALUES INSERT (same pattern as rules engine bulk insert)
  const valuesSql = fresh.map((req) => {
    const dueDateStr = req.due_date ? req.due_date.toISOString().split('T')[0] : null
    const reqDocs = req.required_documents || []
    const reqDocsArray = `{${reqDocs.map((d: string) => `"${d.replace(/"/g, '\\"')}"`).join(',')}}`
    return Prisma.sql`(
      ${companyId}::uuid,
      ${req.category}::text,
      ${req.requirement}::text,
      ${req.description || null}::text,
      ${req.status}::text,
      ${dueDateStr}::date,
      ${req.penalty || null}::text,
      ${req.is_critical}::boolean,
      ${req.compliance_type || null}::text,
      ${req.entity_type || null}::text,
      ${req.industry || null}::text,
      ${req.industry_category || null}::text,
      ${req.year_type || 'FY'}::text,
      ${req.country_code || 'IN'}::text,
      ${reqDocsArray}::text[],
      ${req.source}::text,
      ${req.confidence_score}::double precision,
      ${req.needs_ca_review}::boolean,
      ${req.source_url || null}::text,
      ${req.act || null}::text,
      ${req.section || null}::text,
      ${req.authority || null}::text,
      ${req.due_date_formula || null}::text,
      ${req.applicability_reason || null}::text,
      ${req.ai_batch_id || null}::text,
      ${userId}::uuid,
      ${userId}::uuid,
      NOW(),
      NOW()
    )`
  })
  await prisma.$executeRaw(Prisma.sql`INSERT INTO regulatory_requirements (
    company_id, category, requirement, description, status,
    due_date, penalty, is_critical, compliance_type,
    entity_type, industry, industry_category, year_type, country_code,
    required_documents, source, confidence_score, needs_ca_review,
    source_url, act, section, authority,
    due_date_formula, applicability_reason, ai_batch_id,
    app_created_by, app_updated_by, created_at, updated_at
  ) VALUES ${Prisma.join(valuesSql, ',')}`)
}

// ── Get AI-Generated Requirements Pending Review ───────────────────────────

export interface AIRequirementForReview {
  id: string
  category: string
  requirement: string
  description: string | null
  due_date: string | null
  penalty: string | null
  is_critical: boolean
  compliance_type: string | null
  source: string
  confidence_score: number | null
  needs_ca_review: boolean
  source_url: string | null
  act: string | null
  section: string | null
  authority: string | null
  due_date_formula: string | null
  applicability_reason: string | null
  ai_batch_id: string | null
  required_documents: string[]
  created_at: string
}

export async function getAIRequirementsPendingReview(
  companyId: string
): Promise<{ success: boolean; requirements?: AIRequirementForReview[]; error?: string }> {
  try {
    const user = await getCurrentUserOrNull()
    if (!user) return { success: false, error: 'Not authenticated' }

    const rows = await prisma.$queryRaw<any[]>(
      Prisma.sql`SELECT
        id, category, requirement, description,
        due_date::text as due_date, penalty, is_critical,
        compliance_type, source, confidence_score,
        needs_ca_review, source_url, act, section,
        authority, due_date_formula, applicability_reason,
        ai_batch_id, required_documents,
        created_at::text as created_at
      FROM regulatory_requirements
      WHERE company_id = ${companyId}::uuid
        AND source IN ('ai_generated', 'ai_validated')
        AND status = 'pending_review'
      ORDER BY confidence_score DESC, category, requirement`
    )

    const requirements: AIRequirementForReview[] = (rows || []).map((r: any) => ({
      id: r.id,
      category: r.category,
      requirement: r.requirement,
      description: r.description,
      due_date: r.due_date,
      penalty: r.penalty,
      is_critical: r.is_critical ?? false,
      compliance_type: r.compliance_type,
      source: r.source || 'ai_generated',
      confidence_score: r.confidence_score,
      needs_ca_review: r.needs_ca_review ?? true,
      source_url: r.source_url,
      act: r.act,
      section: r.section,
      authority: r.authority,
      due_date_formula: r.due_date_formula,
      applicability_reason: r.applicability_reason,
      ai_batch_id: r.ai_batch_id,
      required_documents: Array.isArray(r.required_documents) ? r.required_documents : [],
      created_at: r.created_at,
    }))

    return { success: true, requirements }
  } catch (error) {
    return handleActionError(error)
  }
}

// ── CA Review Actions ──────────────────────────────────────────────────────

export async function approveAIRequirement(
  requirementId: string,
  companyId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[approveAIRequirement] id:', requirementId, 'company:', companyId)
    const user = await getCurrentUserOrNull()
    if (!user) return { success: false, error: 'Not authenticated' }
    if (!(await canUserEdit(companyId))) return { success: false, error: 'Permission denied' }

    const rowsAffected = await prisma.$executeRaw(
      Prisma.sql`UPDATE regulatory_requirements
        SET status = 'not_started',
            needs_ca_review = false,
            app_updated_by = ${user.id}::uuid,
            updated_at = NOW()
        WHERE id = ${requirementId}::uuid
          AND company_id = ${companyId}::uuid
          AND status = 'pending_review'`
    )
    console.log('[approveAIRequirement] Rows affected:', rowsAffected)

    return { success: true }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function approveAllAIRequirements(
  companyId: string,
  batchId?: string
): Promise<{ success: boolean; approved?: number; error?: string }> {
  try {
    const user = await getCurrentUserOrNull()
    if (!user) return { success: false, error: 'Not authenticated' }
    if (!(await canUserEdit(companyId))) return { success: false, error: 'Permission denied' }

    let result: number
    if (batchId) {
      result = await prisma.$executeRaw(
        Prisma.sql`UPDATE regulatory_requirements
          SET status = 'not_started',
              needs_ca_review = false,
              app_updated_by = ${user.id}::uuid,
              updated_at = NOW()
          WHERE company_id = ${companyId}::uuid
            AND status = 'pending_review'
            AND ai_batch_id = ${batchId}::text`
      )
    } else {
      result = await prisma.$executeRaw(
        Prisma.sql`UPDATE regulatory_requirements
          SET status = 'not_started',
              needs_ca_review = false,
              app_updated_by = ${user.id}::uuid,
              updated_at = NOW()
          WHERE company_id = ${companyId}::uuid
            AND status = 'pending_review'
            AND source IN ('ai_generated', 'ai_validated')`
      )
    }

    return { success: true, approved: result }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function rejectAIRequirement(
  requirementId: string,
  companyId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUserOrNull()
    if (!user) return { success: false, error: 'Not authenticated' }
    if (!(await canUserEdit(companyId))) return { success: false, error: 'Permission denied' }

    // Delete the rejected AI requirement entirely
    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM regulatory_requirements
        WHERE id = ${requirementId}::uuid
          AND company_id = ${companyId}::uuid
          AND status = 'pending_review'
          AND source IN ('ai_generated', 'ai_validated')`
    )

    return { success: true }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function updateAIRequirementBeforeApproval(
  requirementId: string,
  companyId: string,
  updates: {
    category?: string
    requirement?: string
    description?: string
    due_date?: string
    penalty?: string
    compliance_type?: string
    is_critical?: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUserOrNull()
    if (!user) return { success: false, error: 'Not authenticated' }
    if (!(await canUserEdit(companyId))) return { success: false, error: 'Permission denied' }

    // Build dynamic SET clause
    const setClauses: string[] = ['updated_at = NOW()', `app_updated_by = '${user.id}'::uuid`]

    if (updates.category !== undefined) setClauses.push(`category = '${updates.category}'`)
    if (updates.requirement !== undefined) setClauses.push(`requirement = '${updates.requirement}'`)
    if (updates.description !== undefined) setClauses.push(`description = '${updates.description}'`)
    if (updates.due_date !== undefined) setClauses.push(`due_date = '${updates.due_date}'::date`)
    if (updates.penalty !== undefined) setClauses.push(`penalty = '${updates.penalty}'`)
    if (updates.compliance_type !== undefined) setClauses.push(`compliance_type = '${updates.compliance_type}'`)
    if (updates.is_critical !== undefined) setClauses.push(`is_critical = ${updates.is_critical}`)

    await prisma.$executeRawUnsafe(
      `UPDATE regulatory_requirements
        SET ${setClauses.join(', ')}
        WHERE id = '${requirementId}'::uuid
          AND company_id = '${companyId}'::uuid
          AND status = 'pending_review'`
    )

    return { success: true }
  } catch (error) {
    return handleActionError(error)
  }
}

// ── Historical Compliance Generation ──────────────────────────────────────

export interface GenerateHistoricalResult {
  success: boolean
  generated?: number
  yearsBack?: number
  cappedAtIncorporation?: boolean
  error?: string
}

export async function generateHistoricalCompliances(
  companyId: string,
  yearsBack: number // 1, 2, 3, or custom
): Promise<GenerateHistoricalResult> {
  try {
    const user = await getCurrentUserOrNull()
    if (!user) return { success: false, error: 'Not authenticated' }
    if (!(await canUserEdit(companyId))) return { success: false, error: 'Permission denied' }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, incorporation_date: true },
    })
    if (!company) return { success: false, error: 'Company not found' }

    const incorpDate = company.incorporation_date
    if (!incorpDate) {
      return { success: false, error: 'Incorporation date not set. Update the company profile first.' }
    }

    // Cap yearsBack at incorporation date
    const now = new Date()
    const maxYearsBack = Math.floor((now.getTime() - incorpDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    const actualYearsBack = Math.min(yearsBack, Math.max(maxYearsBack, 0))
    const cappedAtIncorporation = actualYearsBack < yearsBack

    if (actualYearsBack <= 0) {
      return { success: false, error: 'Company was incorporated less than 1 year ago. No historical entries to generate.' }
    }

    // Compute the start date for historical generation
    const startDate = new Date(now)
    startDate.setFullYear(startDate.getFullYear() - actualYearsBack)
    // Never go before incorporation
    const effectiveStart = startDate < incorpDate ? incorpDate : startDate

    // Get existing recurring requirements with their formulas. We dedupe
    // by (base_name, due_date_formula) below — the DB has many rows per
    // base rule (one per period: "TDS Payment — Monthly — For Apr 2026",
    // "— For May 2026", etc.) and we want ONE source per logical rule.
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
      return { success: false, error: 'No recurring requirements found. Generate compliances first.' }
    }

    // Strip the period suffix that the rules engine appends so we can
    // (a) dedupe to one source row per base rule, and (b) rebuild the
    // requirement name with the HISTORICAL period_label rather than
    // copying the source row's (current-FY) period verbatim. Without
    // this, historical entries inherited names like "ESI — For Dec 2026"
    // even though their due_date was Jul 2025.
    const stripPeriodSuffix = (name: string): string =>
      name
        .replace(/\s*[—–-]\s*(For\s+[A-Za-z]+\s*\d{2,4}|Q[1-4][^\n]*?\d{2,4}|H[12][^\n]*?\d{2,4})\s*$/i, '')
        .replace(/\s*[—–-]\s*(Annual|Quarterly|Monthly|Half-Yearly|Half-yearly)?\s*[—–-]\s*For\s+[A-Za-z]+\s*\d{2,4}\s*$/i, '')
        .trim()

    type RuleSource = (typeof existingRules)[number] & { baseName: string }
    const uniqueRulesByKey = new Map<string, RuleSource>()
    for (const r of existingRules as any[]) {
      const baseName = stripPeriodSuffix(String(r.requirement || ''))
      const key = `${baseName}|${r.due_date_formula}`
      if (!uniqueRulesByKey.has(key)) {
        uniqueRulesByKey.set(key, { ...r, baseName })
      }
    }
    console.log('[generateHistoricalCompliances] dedupe', {
      sourceRows: existingRules.length,
      uniqueBaseRules: uniqueRulesByKey.size,
      yearsBack: actualYearsBack,
    })

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

      const pastDeadlines = deadlines.filter(dl => dl.date < now)

      for (const dl of pastDeadlines) {
        const dueDate = dl.date.toISOString().split('T')[0]
        const periodKey = dl.period || null
        const periodLabel = dl.label || null
        // Rebuild the requirement name with THIS period's label.
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
              ${user.id}::uuid, ${user.id}::uuid, NOW(), NOW()
            ) ON CONFLICT (company_id, requirement, period_key)
              WHERE period_key IS NOT NULL DO NOTHING`
          )
          totalGenerated++
        } catch {
          // Skip constraint violations silently
        }
      }
    }

    return {
      success: true,
      generated: totalGenerated,
      yearsBack: actualYearsBack,
      cappedAtIncorporation,
    }
  } catch (error) {
    return handleActionError(error)
  }
}

// ── Standalone Validation ──────────────────────────────────────────────────

export interface ValidateComplianceResult {
  success: boolean
  validatedCount?: number
  flaggedCount?: number
  removedCount?: number
  discoveredCount?: number
  results?: Array<{
    requirementName: string
    verdict: 'applicable' | 'not_applicable' | 'uncertain'
    reason: string
    sourceUrl: string | null
  }>
  discovered?: Array<{
    name: string
    category: string
    act: string
    authority: string
    confidenceScore: number
  }>
  error?: string
}

export async function validateComplianceForCompany(
  companyId: string
): Promise<ValidateComplianceResult> {
  try {
    const user = await getCurrentUserOrNull()
    if (!user) return { success: false, error: 'Not authenticated' }
    if (!(await canUserEdit(companyId))) return { success: false, error: 'Permission denied' }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true, name: true, type: true, nic_code: true, state: true,
        is_listed: true, incorporation_date: true, country_code: true,
        industries: true, industry_categories: true, employee_count: true,
        annual_turnover: true, is_gst_registered: true, net_worth: true,
        is_msme: true, has_imports_exports: true, is_startup_dpiit: true,
      },
    })
    if (!company) return { success: false, error: 'Company not found' }

    const allReqs = await prisma.$queryRaw<any[]>(
      Prisma.sql`SELECT id, requirement, category, compliance_type, due_date::text as due_date, source
        FROM regulatory_requirements
        WHERE company_id = ${companyId}::uuid
        ORDER BY category, requirement`
    )

    if (!allReqs || allReqs.length === 0) {
      return { success: false, error: 'No requirements to validate. Generate compliances first.' }
    }

    const validationResult = await validateExistingCompliances(
      company as any,
      allReqs.map((r: any) => ({
        requirement: r.requirement,
        category: r.category,
        compliance_type: r.compliance_type,
        due_date: r.due_date,
        source: r.source,
      }))
    )

    if (!validationResult.success) {
      return { success: false, error: validationResult.error || 'Validation failed' }
    }

    let removedCount = 0
    const flaggedResults: ValidateComplianceResult['results'] = []

    for (const v of validationResult.validations) {
      if (v.verdict === 'not_applicable') {
        const match = allReqs.find((r: any) =>
          r.requirement.toLowerCase().includes(v.requirementName.toLowerCase().slice(0, 30)) ||
          v.requirementName.toLowerCase().includes(r.requirement.toLowerCase().slice(0, 30))
        )
        if (match) {
          await prisma.$executeRaw(
            Prisma.sql`DELETE FROM regulatory_requirements
              WHERE id = ${match.id}::uuid AND company_id = ${companyId}::uuid`
          )
          removedCount++
        }
      } else if (v.verdict === 'uncertain') {
        const match = allReqs.find((r: any) =>
          r.requirement.toLowerCase().includes(v.requirementName.toLowerCase().slice(0, 30)) ||
          v.requirementName.toLowerCase().includes(r.requirement.toLowerCase().slice(0, 30))
        )
        if (match) {
          await prisma.$executeRaw(
            Prisma.sql`UPDATE regulatory_requirements
              SET needs_ca_review = true,
                  applicability_reason = COALESCE(applicability_reason, '') || ${'\n\n⚠️ AI Validation: ' + v.reason}::text,
                  updated_at = NOW()
              WHERE id = ${match.id}::uuid AND company_id = ${companyId}::uuid`
          )
        }
      }

      if (v.verdict !== 'applicable') {
        flaggedResults.push({
          requirementName: v.requirementName,
          verdict: v.verdict,
          reason: v.reason,
          sourceUrl: v.sourceUrl,
        })
      }
    }

    // ── Insert discovered (missing) compliances as pending_review ──
    let discoveredCount = 0
    const discoveredSummary: ValidateComplianceResult['discovered'] = []

    if (validationResult.discoveredCompliances && validationResult.discoveredCompliances.length > 0) {
      const fyProfile = buildIndianFYProfile(company.incorporation_date || new Date())

      for (const item of validationResult.discoveredCompliances) {
        // Skip if already exists
        const isDupe = allReqs.some((r: any) => {
          const existingLower = r.requirement.toLowerCase()
          const itemLower = item.name.toLowerCase()
          return existingLower.includes(itemLower.slice(0, 30)) || itemLower.includes(existingLower.slice(0, 30))
        })
        if (isDupe) continue

        // Compute due date
        let dueDate: string | null = null
        try {
          const nextDate = computeNextDeadline(item.dueDateFormula, fyProfile)
          if (nextDate) dueDate = nextDate.toISOString().split('T')[0]
        } catch { /* non-fatal */ }

        const complianceType = frequencyToComplianceType(item.frequency)
        const reqDocs = item.documentsRequired || []
        const reqDocsArray = `{${reqDocs.map((d: string) => `"${d.replace(/"/g, '\\"')}"`).join(',')}}`

        await prisma.$queryRaw(
          Prisma.sql`INSERT INTO regulatory_requirements (
            company_id, category, requirement, description, status,
            due_date, penalty, is_critical, compliance_type,
            year_type, country_code, required_documents,
            source, confidence_score, needs_ca_review,
            source_url, act, section, authority,
            due_date_formula, applicability_reason,
            app_created_by, app_updated_by, created_at, updated_at
          ) VALUES (
            ${companyId}::uuid,
            ${item.category}::text,
            ${item.name}::text,
            ${`${item.act} — ${item.section}. ${item.applicabilityReason}`}::text,
            'pending_review'::text,
            ${dueDate}::date,
            ${item.penaltyOnMiss}::text,
            ${item.confidenceScore >= 0.95}::boolean,
            ${complianceType || null}::text,
            'FY'::text,
            'IN'::text,
            ${reqDocsArray}::text[],
            'ai_validated'::text,
            ${item.confidenceScore}::double precision,
            ${item.confidenceScore < 0.95}::boolean,
            ${item.sourceUrl}::text,
            ${item.act}::text,
            ${item.section}::text,
            ${item.authority}::text,
            ${item.dueDateFormula}::text,
            ${item.applicabilityReason}::text,
            ${user.id}::uuid,
            ${user.id}::uuid,
            NOW(),
            NOW()
          )`
        )

        discoveredCount++
        discoveredSummary.push({
          name: item.name,
          category: item.category,
          act: item.act,
          authority: item.authority,
          confidenceScore: item.confidenceScore,
        })
      }
    }

    return {
      success: true,
      validatedCount: validationResult.validations.length,
      flaggedCount: validationResult.flaggedCount,
      removedCount,
      discoveredCount,
      results: flaggedResults,
      discovered: discoveredSummary,
    }
  } catch (error) {
    return handleActionError(error)
  }
}

// ── Regulatory Change Detection ────────────────────────────────────────────

export async function checkRegulatoryChanges(
  companyId: string,
  lastCheckedDate: string
): Promise<{
  success: boolean
  changes?: Array<{
    changeType: string
    description: string
    effectiveDate: string
    sourceUrl: string
    actionRequired: string
  }>
  error?: string
}> {
  try {
    const user = await getCurrentUserOrNull()
    if (!user) return { success: false, error: 'Not authenticated' }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        type: true,
        nic_code: true,
        state: true,
        is_listed: true,
        country_code: true,
      },
    })

    if (!company) return { success: false, error: 'Company not found' }

    const result = await detectRegulatoryChanges(company, lastCheckedDate)

    if (result.error) {
      return { success: false, error: result.error }
    }

    return { success: true, changes: result.changes }
  } catch (error) {
    return handleActionError(error)
  }
}
