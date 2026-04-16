'use server'

import { createServerContainer } from '@/lib/composition/server-container'
import { handleActionError } from '@/lib/errors/handle-error'
import { validateCompanyId } from '@/lib/utils/input-validation'
import { evaluateCompliance } from '@/lib/compliance/evaluator'
import { upgradeLowConfidenceAssessments } from '@/lib/compliance/evaluator-llm'
import { buildRuleProfile, type CompanyForRuleEvaluation } from '@/lib/compliance/rules/profile-builder'
import { currentIndianFY } from '@/lib/compliance/facts'
import { prisma } from '@/lib/prisma'

async function assertCompanyAccess(companyId: string) {
  if (!validateCompanyId(companyId)) throw new Error('Invalid company ID')
  const { authService, companyMembershipRepository, companyRepository } = createServerContainer()
  const user = await authService.requireCurrentUser()

  const company = await companyRepository.getDetailsById(companyId)
  if (!company) throw new Error('Company not found')

  const isOwner = company.ownerUserId === user.id || company.ownerAppUserId === user.id
  if (!isOwner) {
    const membership = await companyMembershipRepository.findRole(user.id, companyId)
    if (!membership) throw new Error('Access denied')
  }
  return { user, company }
}

/**
 * Run the deterministic applicability evaluator for a company × FY.
 * Writes/updates ComplianceAssessment rows and returns a summary.
 */
export async function runApplicabilityEvaluation(
  companyId: string,
  financialYear?: string,
  options?: { skipLlmFallback?: boolean },
): Promise<{
  success: boolean
  financialYear?: string
  applicable?: number
  notApplicable?: number
  lowConfidence?: number
  llmUpgraded?: number
  skipped?: number
  error?: string
}> {
  try {
    await assertCompanyAccess(companyId)

    // Load the company row with the columns the profile builder needs.
    const row = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        type: true, nic_code: true, state: true, is_listed: true,
        employee_count: true, annual_turnover: true, is_gst_registered: true,
        net_worth: true, is_msme: true, msme_category: true,
        has_imports_exports: true, is_startup_dpiit: true,
        incorporation_date: true, country_code: true,
      },
    })
    if (!row) return { success: false, error: 'Company not found' }

    const profile = buildRuleProfile(row as CompanyForRuleEvaluation)
    const fy = financialYear || currentIndianFY()

    const result = await evaluateCompliance({
      companyId,
      financialYear: fy,
      profile,
      evaluatorVersion: 'v1',
    })

    // Upgrade low-confidence decisions with the LLM fallback unless
    // the caller opted out (e.g., cost-sensitive bulk evaluation).
    let llmUpgraded = 0
    if (!options?.skipLlmFallback && result.lowConfidenceCount > 0) {
      const upgrade = await upgradeLowConfidenceAssessments({
        companyId,
        financialYear: fy,
        profile,
      })
      llmUpgraded = upgrade.upgraded
    }

    return {
      success: true,
      financialYear: fy,
      applicable: result.applicableCount,
      notApplicable: result.notApplicableCount,
      lowConfidence: result.lowConfidenceCount,
      llmUpgraded,
      skipped: result.skippedRuleIds.length,
    }
  } catch (error) {
    return handleActionError(error)
  }
}

/**
 * Fetch assessments to power the tracker UI. Returns only applicable
 * items by default; pass `includeNotApplicable: true` for an audit view.
 */
export async function listAssessments(
  companyId: string,
  financialYear?: string,
  options?: { includeNotApplicable?: boolean },
): Promise<{
  success: boolean
  financialYear?: string
  items?: Array<{
    id: string
    ruleId: string
    applicable: boolean
    reasoning: string
    confidence: number
    evaluatorKind: string
    factsCited: string[]
    userOverridden: boolean
    userOverrideNote: string | null
    rule: {
      name: string
      category: string
      act: string
      sectionRef: string
      legacySectionRef: string | null
      frequency: string
      dueDescription: string | null
      penalty: string | null
      isCritical: boolean
      formRefs: unknown
      sourceUrl: string | null
    }
  }>
  error?: string
}> {
  try {
    await assertCompanyAccess(companyId)
    const fy = financialYear || currentIndianFY()

    const rows = await prisma.complianceAssessment.findMany({
      where: {
        company_id: companyId,
        financial_year: fy,
        ...(options?.includeNotApplicable ? {} : { applicable: true }),
      },
      orderBy: [{ confidence: 'desc' }, { assessed_at: 'desc' }],
    })

    if (rows.length === 0) {
      return { success: true, financialYear: fy, items: [] }
    }

    // Attach rule metadata in one query rather than N.
    const ruleIds = rows.map((r) => r.rule_id)
    const rules = await prisma.complianceRule.findMany({
      where: { id: { in: ruleIds } },
      select: {
        id: true, name: true, category: true, act: true,
        section_ref: true, legacy_section_ref: true, frequency: true,
        due_description: true, penalty: true, is_critical: true,
        form_refs: true, source_url: true,
      },
    })
    const ruleById = new Map(rules.map((r) => [r.id, r]))

    return {
      success: true,
      financialYear: fy,
      items: rows.map((a) => {
        const rule = ruleById.get(a.rule_id)
        return {
          id: a.id,
          ruleId: a.rule_id,
          applicable: a.applicable,
          reasoning: a.reasoning,
          confidence: a.confidence,
          evaluatorKind: a.evaluator_kind,
          factsCited: a.facts_cited,
          userOverridden: a.user_overridden,
          userOverrideNote: a.user_override_note,
          rule: {
            name: rule?.name || a.rule_id,
            category: rule?.category || 'Others',
            act: rule?.act || '',
            sectionRef: rule?.section_ref || '',
            legacySectionRef: rule?.legacy_section_ref || null,
            frequency: rule?.frequency || '',
            dueDescription: rule?.due_description || null,
            penalty: rule?.penalty || null,
            isCritical: rule?.is_critical || false,
            formRefs: rule?.form_refs || null,
            sourceUrl: rule?.source_url || null,
          },
        }
      }),
    }
  } catch (error) {
    return handleActionError(error)
  }
}

/**
 * User-overrides an assessment: "no, this doesn't apply to us because X"
 * or "yes, we need to file even though the agent marked not-applicable".
 * Takes precedence over any future re-evaluation.
 */
export async function overrideAssessment(
  companyId: string,
  assessmentId: string,
  applicable: boolean,
  note: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await assertCompanyAccess(companyId)

    const existing = await prisma.complianceAssessment.findFirst({
      where: { id: assessmentId, company_id: companyId },
      select: { id: true },
    })
    if (!existing) return { success: false, error: 'Assessment not found' }

    await prisma.complianceAssessment.update({
      where: { id: existing.id },
      data: {
        applicable,
        reasoning: note,
        confidence: 1.0,
        evaluator_kind: 'user_override',
        user_overridden: true,
        user_override_note: note,
        overridden_by: user.id,
        overridden_at: new Date(),
        assessed_at: new Date(),
        assessed_by: `user:${user.id}`,
      },
    })
    return { success: true }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function clearAssessmentOverride(
  companyId: string,
  assessmentId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertCompanyAccess(companyId)
    const existing = await prisma.complianceAssessment.findFirst({
      where: { id: assessmentId, company_id: companyId, user_overridden: true },
      select: { id: true },
    })
    if (!existing) return { success: false, error: 'No override to clear' }

    await prisma.complianceAssessment.update({
      where: { id: existing.id },
      data: {
        user_overridden: false,
        user_override_note: null,
        overridden_by: null,
        overridden_at: null,
      },
    })
    return { success: true }
  } catch (error) {
    return handleActionError(error)
  }
}
