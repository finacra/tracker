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

    // ── Step 2: Perplexity AI (specialized, cached by profile key) ───
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
      } catch (aiError: any) {
        // AI failure is non-fatal — rules engine results are already saved
        console.warn('[generateComplianceForCompany] AI validation failed (non-fatal):', aiError.message)
      }
    }

    // ── Step 3: Perplexity AI Validation (review rules engine output) ──
    let validationRan = false
    let validatedCount = 0
    let flaggedCount = 0
    let removedByValidation = 0
    let validationResults: GenerateComplianceResult['validationResults'] = []

    try {
      // Fetch all requirements just inserted (rules engine + AI)
      const allReqs = await prisma.$queryRaw<any[]>(
        Prisma.sql`SELECT id, requirement, category, compliance_type, due_date::text as due_date, source
          FROM regulatory_requirements
          WHERE company_id = ${companyId}::uuid
          ORDER BY category, requirement`
      )

      if (allReqs && allReqs.length > 0) {
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

        if (validationResult.success) {
          validationRan = true
          validatedCount = validationResult.validations.length
          flaggedCount = validationResult.flaggedCount

          // Process validation results
          for (const v of validationResult.validations) {
            if (v.verdict === 'not_applicable') {
              // Find matching requirement and delete it
              const match = allReqs.find((r: any) =>
                r.requirement.toLowerCase().includes(v.requirementName.toLowerCase().slice(0, 30)) ||
                v.requirementName.toLowerCase().includes(r.requirement.toLowerCase().slice(0, 30))
              )
              if (match) {
                await prisma.$executeRaw(
                  Prisma.sql`DELETE FROM regulatory_requirements
                    WHERE id = ${match.id}::uuid AND company_id = ${companyId}::uuid`
                )
                removedByValidation++
              }
            } else if (v.verdict === 'uncertain') {
              // Mark as needs CA review
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

            // Collect results for UI display (only flagged items)
            if (v.verdict !== 'applicable') {
              validationResults!.push({
                requirementName: v.requirementName,
                verdict: v.verdict,
                reason: v.reason,
                sourceUrl: v.sourceUrl,
              })
            }
          }
        }
      }
    } catch (valError: any) {
      console.warn('[generateComplianceForCompany] Validation failed (non-fatal):', valError.message)
    }

    return {
      success: true,
      batchId,
      totalGenerated: rulesInsertedCount + aiCount - removedByValidation,
      rulesEngineCount: rulesInsertedCount,
      aiCount,
      highConfidence: newRules.length,
      needsReview,
      missingProfileFields: rulesResult.missingProfileFields,
      validationRan,
      validatedCount,
      flaggedCount,
      removedByValidation,
      validationResults,
    }
  } catch (error: any) {
    console.error('[generateComplianceForCompany] Error:', error)
    return { success: false, error: error.message || 'Failed to generate compliance intelligence' }
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

async function bulkInsertRulesEngineResults(
  companyId: string,
  evaluated: EvaluatedCompliance[],
  userId: string,
  batchId: string,
  incorporationDate: Date | null
): Promise<number> {
  const fyProfile = buildIndianFYProfile(incorporationDate || new Date())
  const now = new Date()
  let totalInserted = 0

  await prisma.$transaction(async (tx) => {
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

      // For recurring compliances, generate per-period entries (next 12 months)
      const isRecurring = ['monthly', 'quarterly', 'half-yearly', 'annual'].includes(rule.frequency)

      if (isRecurring && rule.dueDateFormula) {
        const deadlines = computeDeadlines(rule.dueDateFormula, fyProfile, 12)

        if (deadlines.length > 0) {
          for (const dl of deadlines) {
            const dueDate = dl.date.toISOString().split('T')[0]
            const periodKey = dl.period || null
            const periodLabel = dl.label || null
            const status = dl.date < now ? 'overdue' : 'not_started'

            await tx.$queryRaw(
              Prisma.sql`INSERT INTO regulatory_requirements (
                company_id, category, requirement, description, status,
                due_date, penalty, is_critical, compliance_type,
                year_type, country_code, required_documents,
                source, confidence_score, needs_ca_review,
                source_url, act, section, authority,
                due_date_formula, applicability_reason, ai_batch_id,
                period_key, period_label,
                app_created_by, app_updated_by, created_at, updated_at
              ) VALUES (
                ${companyId}::uuid, ${rule.category}::text, ${rule.name}::text,
                ${description}::text, ${status}::text, ${dueDate}::date,
                ${rule.penalty}::text, ${rule.isCritical}::boolean,
                ${complianceType || null}::text, 'FY'::text, 'IN'::text,
                ${requiredDocsArray}::text[], 'rules_engine'::text,
                ${1.0}::double precision, ${false}::boolean,
                ${rule.sourceUrl}::text, ${rule.act}::text, ${rule.section}::text,
                ${rule.authority}::text, ${rule.dueDateFormula}::text,
                ${matchReasons}::text, ${batchId}::text,
                ${periodKey}::text, ${periodLabel}::text,
                ${userId}::uuid, ${userId}::uuid, NOW(), NOW()
              ) ON CONFLICT (company_id, requirement, period_key)
                WHERE period_key IS NOT NULL DO NOTHING`
            )
            totalInserted++
          }
        } else {
          // Fallback: formula didn't produce deadlines — insert single entry
          await insertSingleRequirement(tx, companyId, rule, complianceType, description, requiredDocsArray, matchReasons, batchId, userId, fyProfile)
          totalInserted++
        }
      } else {
        // One-time / event-based — single entry, no period
        await insertSingleRequirement(tx, companyId, rule, complianceType, description, requiredDocsArray, matchReasons, batchId, userId, fyProfile)
        totalInserted++
      }
    }
  }, { timeout: 30000 })

  return totalInserted
}

async function insertSingleRequirement(
  tx: any,
  companyId: string,
  rule: ComplianceRule,
  complianceType: string | null,
  description: string,
  requiredDocsArray: string,
  matchReasons: string,
  batchId: string,
  userId: string,
  fyProfile: any
): Promise<void> {
  let dueDate: string | null = null
  try {
    const nextDate = computeNextDeadline(rule.dueDateFormula, fyProfile)
    if (nextDate) dueDate = nextDate.toISOString().split('T')[0]
  } catch { /* non-fatal */ }

  await tx.$queryRaw(
    Prisma.sql`INSERT INTO regulatory_requirements (
      company_id, category, requirement, description, status,
      due_date, penalty, is_critical, compliance_type,
      year_type, country_code, required_documents,
      source, confidence_score, needs_ca_review,
      source_url, act, section, authority,
      due_date_formula, applicability_reason, ai_batch_id,
      app_created_by, app_updated_by, created_at, updated_at
    ) VALUES (
      ${companyId}::uuid, ${rule.category}::text, ${rule.name}::text,
      ${description}::text, 'not_started'::text, ${dueDate}::date,
      ${rule.penalty}::text, ${rule.isCritical}::boolean,
      ${complianceType || null}::text, 'FY'::text, 'IN'::text,
      ${requiredDocsArray}::text[], 'rules_engine'::text,
      ${1.0}::double precision, ${false}::boolean,
      ${rule.sourceUrl}::text, ${rule.act}::text, ${rule.section}::text,
      ${rule.authority}::text, ${rule.dueDateFormula}::text,
      ${matchReasons}::text, ${batchId}::text,
      ${userId}::uuid, ${userId}::uuid, NOW(), NOW()
    )`
  )
}

// ── Bulk Insert AI Requirements ────────────────────────────────────────────

async function bulkInsertAIRequirements(
  companyId: string,
  requirements: GeneratedRequirement[],
  userId: string
): Promise<void> {
  // Use a transaction to insert all requirements atomically
  await prisma.$transaction(async (tx) => {
    for (const req of requirements) {
      const dueDateStr = req.due_date ? req.due_date.toISOString().split('T')[0] : null
      const reqDocs = req.required_documents || []
      const reqDocsArray = `{${reqDocs.map((d: string) => `"${d.replace(/"/g, '\\"')}"`).join(',')}}`

      await tx.$queryRaw(
        Prisma.sql`INSERT INTO regulatory_requirements (
          company_id,
          category,
          requirement,
          description,
          status,
          due_date,
          penalty,
          is_critical,
          compliance_type,
          entity_type,
          industry,
          industry_category,
          year_type,
          country_code,
          required_documents,
          source,
          confidence_score,
          needs_ca_review,
          source_url,
          act,
          section,
          authority,
          due_date_formula,
          applicability_reason,
          ai_batch_id,
          app_created_by,
          app_updated_by,
          created_at,
          updated_at
        ) VALUES (
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
      )
    }
  }, { timeout: 30000 })
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
  } catch (error: any) {
    console.error('[getAIRequirementsPendingReview] Error:', error)
    return { success: false, error: error.message }
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
  } catch (error: any) {
    return { success: false, error: error.message }
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
  } catch (error: any) {
    return { success: false, error: error.message }
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
  } catch (error: any) {
    return { success: false, error: error.message }
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
  } catch (error: any) {
    return { success: false, error: error.message }
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

    // Get all existing distinct requirements with their formulas
    const existingRules = await prisma.$queryRaw<any[]>(
      Prisma.sql`SELECT DISTINCT ON (requirement)
        requirement, category, description, penalty, is_critical,
        compliance_type, year_type, country_code, required_documents,
        source, confidence_score, needs_ca_review, source_url,
        act, section, authority, due_date_formula, applicability_reason
      FROM regulatory_requirements
      WHERE company_id = ${companyId}::uuid
        AND due_date_formula IS NOT NULL
        AND compliance_type IN ('monthly', 'quarterly', 'half-yearly', 'annual')
      ORDER BY requirement, created_at DESC`
    )

    if (!existingRules || existingRules.length === 0) {
      return { success: false, error: 'No recurring requirements found. Generate compliances first.' }
    }

    const fyProfile = buildIndianFYProfile(incorpDate)
    let totalGenerated = 0

    await prisma.$transaction(async (tx) => {
      for (const rule of existingRules) {
        if (!rule.due_date_formula) continue

        // Compute deadlines going backward from now
        const monthsBack = actualYearsBack * 12
        const deadlines = computeDeadlines(
          rule.due_date_formula,
          fyProfile,
          monthsBack,
          effectiveStart // reference date = start of historical period
        )

        // Filter only past deadlines (before today)
        const pastDeadlines = deadlines.filter(dl => dl.date < now)

        for (const dl of pastDeadlines) {
          const dueDate = dl.date.toISOString().split('T')[0]
          const periodKey = dl.period || null
          const periodLabel = dl.label || null
          const reqDocs = Array.isArray(rule.required_documents) ? rule.required_documents : []
          const reqDocsArray = `{${reqDocs.map((d: string) => `"${d.replace(/"/g, '\\"')}"`).join(',')}}`

          try {
            await tx.$queryRaw(
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
                ${companyId}::uuid, ${rule.category}::text, ${rule.requirement}::text,
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
    }, { timeout: 60000 })

    return {
      success: true,
      generated: totalGenerated,
      yearsBack: actualYearsBack,
      cappedAtIncorporation,
    }
  } catch (error: any) {
    console.error('[generateHistoricalCompliances] Error:', error)
    return { success: false, error: error.message }
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
  } catch (error: any) {
    console.error('[validateComplianceForCompany] Error:', error)
    return { success: false, error: error.message }
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
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
