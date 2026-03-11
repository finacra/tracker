import type { RequirementRepository } from '@/application/interfaces/RequirementRepository'
import type { Requirement } from '@/domain/models/Requirement'
import { createAdminClient } from '@/utils/supabase/admin'

type RequirementRow = Omit<Requirement, 'required_documents'> & {
  required_documents: unknown
}

export class SupabaseRequirementRepository implements RequirementRepository {
  async refreshOverdueStatuses(companyId: string): Promise<void> {
    const adminSupabase: any = createAdminClient()

    const { error } = await adminSupabase.rpc('update_company_overdue_statuses', {
      p_company_id: companyId,
    })

    if (error) {
      console.error('[SupabaseRequirementRepository] Status refresh error:', error)
    }
  }

  async getByCompanyId(companyId: string): Promise<Requirement[]> {
    const adminSupabase: any = createAdminClient()

    const { data, error } = await adminSupabase
      .from('regulatory_requirements')
      .select('*')
      .eq('company_id', companyId)
      .order('due_date', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    return (data || []).map((row: RequirementRow) => ({
      ...row,
      required_documents: Array.isArray(row.required_documents)
        ? (row.required_documents as string[])
        : row.required_documents
          ? [String(row.required_documents)]
          : [],
    }))
  }

  async refreshAllOverdueStatuses(): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase.rpc('update_overdue_statuses')
    if (error) {
      console.error('[SupabaseRequirementRepository] All status refresh error:', error)
    }
  }

  async getAll(): Promise<Requirement[]> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('regulatory_requirements')
      .select('*')
      .order('due_date', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    return (data || []).map((row: RequirementRow) => ({
      ...row,
      required_documents: Array.isArray(row.required_documents)
        ? (row.required_documents as string[])
        : row.required_documents
          ? [String(row.required_documents)]
          : [],
    }))
  }

  async getById(requirementId: string): Promise<Requirement | null> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('regulatory_requirements')
      .select('*')
      .eq('id', requirementId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found
      }
      throw new Error(error.message)
    }

    return {
      ...data,
      required_documents: Array.isArray(data.required_documents)
        ? (data.required_documents as string[])
        : data.required_documents
          ? [String(data.required_documents)]
          : [],
    }
  }

  async create(input: import('@/application/interfaces/RequirementRepository').CreateRequirementInput): Promise<Requirement> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('regulatory_requirements')
      .insert({
        company_id: input.companyId,
        category: input.category,
        requirement: input.requirement,
        description: input.description || null,
        due_date: input.dueDate,
        penalty: input.penalty || null,
        penalty_base_amount: input.penaltyBaseAmount || null,
        is_critical: input.isCritical ?? false,
        financial_year: input.financialYear || null,
        compliance_type: input.complianceType || 'one-time',
        year_type: input.yearType || 'FY',
        status: 'not_started',
        required_documents: input.requiredDocuments || [],
        created_by: input.createdBy,
        updated_by: input.updatedBy,
      })
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return {
      ...data,
      required_documents: Array.isArray(data.required_documents)
        ? (data.required_documents as string[])
        : data.required_documents
          ? [String(data.required_documents)]
          : [],
    }
  }

  async delete(requirementId: string, companyId?: string | null): Promise<void> {
    const adminSupabase: any = createAdminClient()
    let query = adminSupabase.from('regulatory_requirements').delete().eq('id', requirementId)

    if (companyId) {
      query = query.eq('company_id', companyId)
    }

    const { error } = await query

    if (error) {
      throw new Error(error.message)
    }
  }

  async update(requirementId: string, input: import('@/application/interfaces/RequirementRepository').UpdateRequirementInput): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('regulatory_requirements')
      .update({
        status: input.status,
        status_reason: input.statusReason,
        updated_at: new Date().toISOString(),
        updated_by: input.updatedBy,
        app_updated_by: input.appUpdatedBy || null,
        filed_by: input.filedBy,
        app_filed_by: input.appFiledBy || null,
        filed_on: input.filedOn,
        category: input.category,
        requirement: input.requirement,
        due_date: input.dueDate,
      })
      .eq('id', requirementId)

    if (error) {
      throw new Error(error.message)
    }
  }
}
