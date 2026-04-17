'use server'

import { createServerContainer } from '@/lib/composition/server-container'
import { handleActionError } from '@/lib/errors/handle-error'
import { validateCompanyId } from '@/lib/utils/input-validation'
import { generateFilingsFromAssessments, getFilingsForCompany, upsertFiling } from '@/lib/compliance/filings'
import { currentIndianFY } from '@/lib/compliance/facts'

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
 * Generate filing rows from applicable assessments + return them.
 * Called when the tracker tab loads for a company + FY.
 */
export async function initializeAndListFilings(
  companyId: string,
  financialYear?: string,
  category?: string,
): Promise<{
  success: boolean
  financialYear?: string
  generated?: { created: number; existed: number }
  filings?: Array<{
    id: string
    ruleId: string
    periodKey: string
    dueDate: string | null
    status: string
    amountPayable: number | null
    amountPaid: number | null
    shortDeduction: number | null
    dateOfPayment: string | null
    dateOfFiling: string | null
    daysDelay: number | null
    interestOnShort: number | null
    interestOnLate: number | null
    challanNumber: string | null
    acknowledgement: string | null
    formReference: string | null
    workingNotes: string | null
    documentId: string | null
    rule: {
      name: string
      category: string
      act: string
      sectionRef: string
      frequency: string
      dueDescription: string | null
      penalty: string | null
      isCritical: boolean
      formRefs: unknown
    }
  }>
  error?: string
}> {
  try {
    const { user } = await assertCompanyAccess(companyId)
    const fy = financialYear || currentIndianFY()

    // Auto-generate filing rows for applicable assessments (idempotent)
    const generated = await generateFilingsFromAssessments({
      companyId,
      financialYear: fy,
      createdBy: user.id,
    })

    // Fetch all filings with rule metadata
    const { filings, rules } = await getFilingsForCompany({
      companyId,
      financialYear: fy,
      category,
    })

    const ruleById = new Map(rules.map(r => [r.id, r]))

    return {
      success: true,
      financialYear: fy,
      generated,
      filings: filings.map(f => {
        const rule = ruleById.get(f.rule_id)
        return {
          id: f.id,
          ruleId: f.rule_id,
          periodKey: f.period_key,
          dueDate: f.due_date?.toISOString().slice(0, 10) || null,
          status: f.status,
          amountPayable: f.amount_payable ? Number(f.amount_payable) : null,
          amountPaid: f.amount_paid ? Number(f.amount_paid) : null,
          shortDeduction: f.short_deduction ? Number(f.short_deduction) : null,
          dateOfPayment: f.date_of_payment?.toISOString().slice(0, 10) || null,
          dateOfFiling: f.date_of_filing?.toISOString().slice(0, 10) || null,
          daysDelay: f.days_delay,
          interestOnShort: f.interest_on_short ? Number(f.interest_on_short) : null,
          interestOnLate: f.interest_on_late ? Number(f.interest_on_late) : null,
          challanNumber: f.challan_number,
          acknowledgement: f.acknowledgement,
          formReference: f.form_reference,
          workingNotes: f.working_notes,
          documentId: f.document_id,
          rule: {
            name: rule?.name || f.rule_id,
            category: rule?.category || 'Others',
            act: rule?.act || '',
            sectionRef: rule?.section_ref || '',
            frequency: rule?.frequency || '',
            dueDescription: rule?.due_description || null,
            penalty: rule?.penalty || null,
            isCritical: rule?.is_critical || false,
            formRefs: rule?.form_refs || null,
          },
        }
      }),
    }
  } catch (error) {
    return handleActionError(error)
  }
}

/**
 * Update a single filing row — called from the tracker UI when user
 * edits a cell (amount paid, challan number, filing date, etc.)
 */
export async function updateFiling(
  companyId: string,
  filingId: string,
  data: {
    status?: string
    amountPayable?: number | null
    amountPaid?: number | null
    dateOfPayment?: string | null
    dateOfFiling?: string | null
    interestOnShort?: number | null
    interestOnLate?: number | null
    challanNumber?: string | null
    acknowledgement?: string | null
    formReference?: string | null
    workingNotes?: string | null
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await assertCompanyAccess(companyId)

    const filing = await prisma.complianceFiling.findFirst({
      where: { id: filingId, company_id: companyId },
      select: { id: true, due_date: true },
    })
    if (!filing) return { success: false, error: 'Filing not found' }

    // Auto-compute short deduction + days delay
    let shortDeduction: number | undefined
    if (data.amountPayable != null && data.amountPaid != null) {
      shortDeduction = Math.max(0, data.amountPayable - data.amountPaid)
    }

    let daysDelay: number | undefined
    const filingDate = data.dateOfFiling ? new Date(data.dateOfFiling) : undefined
    if (filingDate && filing.due_date) {
      daysDelay = Math.ceil((filingDate.getTime() - filing.due_date.getTime()) / (1000 * 60 * 60 * 24))
      if (daysDelay < 0) daysDelay = 0
    }

    await prisma.complianceFiling.update({
      where: { id: filing.id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.amountPayable !== undefined ? { amount_payable: data.amountPayable } : {}),
        ...(data.amountPaid !== undefined ? { amount_paid: data.amountPaid } : {}),
        ...(shortDeduction !== undefined ? { short_deduction: shortDeduction } : {}),
        ...(data.dateOfPayment !== undefined ? { date_of_payment: data.dateOfPayment ? new Date(data.dateOfPayment) : null } : {}),
        ...(filingDate !== undefined ? { date_of_filing: filingDate } : {}),
        ...(daysDelay !== undefined ? { days_delay: daysDelay } : {}),
        ...(data.interestOnShort !== undefined ? { interest_on_short: data.interestOnShort } : {}),
        ...(data.interestOnLate !== undefined ? { interest_on_late: data.interestOnLate } : {}),
        ...(data.challanNumber !== undefined ? { challan_number: data.challanNumber } : {}),
        ...(data.acknowledgement !== undefined ? { acknowledgement: data.acknowledgement } : {}),
        ...(data.formReference !== undefined ? { form_reference: data.formReference } : {}),
        ...(data.workingNotes !== undefined ? { working_notes: data.workingNotes } : {}),
        updated_by: user.id,
      },
    })

    return { success: true }
  } catch (error) {
    return handleActionError(error)
  }
}

import { prisma } from '@/lib/prisma'
