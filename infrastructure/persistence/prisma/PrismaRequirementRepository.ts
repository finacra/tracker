import type { RequirementRepository } from '@/application/interfaces/RequirementRepository'
import type { Requirement } from '@/domain/models/Requirement'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export class PrismaRequirementRepository implements RequirementRepository {
  async refreshOverdueStatuses(companyId: string): Promise<void> {
    // Use the same RPC as Supabase implementation — this stored procedure is DB-level
    try {
      await prisma.$executeRaw(
        Prisma.sql`SELECT update_company_overdue_statuses(${companyId}::uuid)`
      )
    } catch (error) {
      console.error('[PrismaRequirementRepository] Status refresh error:', error)
    }
  }

  async refreshAllOverdueStatuses(): Promise<void> {
    // Use the same RPC as Supabase implementation — this stored procedure is DB-level
    try {
      await prisma.$executeRaw(Prisma.sql`SELECT update_overdue_statuses()`)
    } catch (error) {
      console.error('[PrismaRequirementRepository] All status refresh error:', error)
    }
  }

  async getAll(): Promise<Requirement[]> {
    // Use raw query to get all columns including those not in Prisma model
    const rows = await prisma.$queryRaw<any[]>(
      Prisma.sql`SELECT * FROM regulatory_requirements ORDER BY due_date ASC`
    )

    return (rows || []).map((row) => this.mapRow(row))
  }

  async getByCompanyId(companyId: string): Promise<Requirement[]> {
    // Use raw query to get all columns including those not in Prisma model
    // Use Prisma.sql with explicit UUID cast
    const rows = await prisma.$queryRaw<any[]>(
      Prisma.sql`SELECT * FROM regulatory_requirements
       WHERE company_id = ${companyId}::uuid
       ORDER BY due_date ASC`
    )

    return (rows || []).map((row) => this.mapRow(row))
  }

  async getById(requirementId: string): Promise<Requirement | null> {
    // Use Prisma.sql with explicit UUID cast
    const rows = await prisma.$queryRaw<any[]>(
      Prisma.sql`SELECT * FROM regulatory_requirements
       WHERE id = ${requirementId}::uuid
       LIMIT 1`
    )

    if (!rows || rows.length === 0) {
      return null
    }

    return this.mapRow(rows[0])
  }

  async create(input: import('@/application/interfaces/RequirementRepository').CreateRequirementInput): Promise<Requirement> {
    // Use Prisma.sql with explicit UUID casts
    const requiredDocsJson = JSON.stringify(input.requiredDocuments || [])
    const penaltyConfigJson = input.penaltyConfig ? JSON.stringify(input.penaltyConfig) : null
    const result = await prisma.$queryRaw<any[]>(
      Prisma.sql`INSERT INTO regulatory_requirements (
        company_id,
        category,
        requirement,
        description,
        due_date,
        penalty,
        penalty_base_amount,
        penalty_config,
        possible_legal_action,
        is_critical,
        financial_year,
        compliance_type,
        year_type,
        status,
        required_documents,
        created_by,
        updated_by,
        created_at,
        updated_at
      ) VALUES (
        ${input.companyId}::uuid,
        ${input.category}::text,
        ${input.requirement}::text,
        ${input.description || null}::text,
        ${input.dueDate}::date,
        ${input.penalty || null}::text,
        ${input.penaltyBaseAmount || null}::numeric,
        ${penaltyConfigJson}::jsonb,
        ${input.possibleLegalAction || null}::text,
        ${input.isCritical ?? false}::boolean,
        ${input.financialYear || null}::text,
        ${input.complianceType || 'one-time'}::text,
        ${input.yearType || 'FY'}::text,
        'not_started',
        ${requiredDocsJson}::jsonb,
        ${input.createdBy}::uuid,
        ${input.updatedBy}::uuid,
        NOW(),
        NOW()
      )
      RETURNING *`
    )

    if (!result || result.length === 0) {
      throw new Error('Failed to create requirement')
    }

    return this.mapRow(result[0])
  }

  async delete(requirementId: string, companyId?: string | null): Promise<void> {
    if (companyId) {
      // Non-superadmins must match company_id
      // Use Prisma.sql with explicit UUID cast
      await prisma.$executeRaw(
        Prisma.sql`DELETE FROM regulatory_requirements
         WHERE id = ${requirementId}::uuid AND company_id = ${companyId}::uuid`
      )
    } else {
      // Superadmins can delete any requirement
      // Use Prisma.sql with explicit UUID cast
      await prisma.$executeRaw(
        Prisma.sql`DELETE FROM regulatory_requirements
         WHERE id = ${requirementId}::uuid`
      )
    }
  }

  async update(requirementId: string, input: import('@/application/interfaces/RequirementRepository').UpdateRequirementInput): Promise<void> {
    // Build SET clause dynamically to avoid NULL type inference issues
    // Only include fields that are actually being updated (not null/undefined)
    const setClauses: string[] = []
    const params: any[] = []
    let paramIndex = 1

    // Always update timestamp
    setClauses.push('updated_at = NOW()')

    // Conditionally add fields that are being updated
    if (input.status !== null && input.status !== undefined) {
      params.push(input.status)
      setClauses.push(`status = $${paramIndex++}::text`)
    }

    if (input.statusReason !== null && input.statusReason !== undefined) {
      params.push(input.statusReason)
      setClauses.push(`status_reason = $${paramIndex++}::text`)
    }

    if (input.updatedBy !== null && input.updatedBy !== undefined) {
      params.push(input.updatedBy)
      setClauses.push(`updated_by = $${paramIndex++}::uuid`)
    }

    if (input.appUpdatedBy !== null && input.appUpdatedBy !== undefined) {
      params.push(input.appUpdatedBy)
      setClauses.push(`app_updated_by = $${paramIndex++}::uuid`)
    }

    if (input.filedBy !== null && input.filedBy !== undefined) {
      params.push(input.filedBy)
      setClauses.push(`filed_by = $${paramIndex++}::uuid`)
    }

    if (input.appFiledBy !== null && input.appFiledBy !== undefined) {
      params.push(input.appFiledBy)
      setClauses.push(`app_filed_by = $${paramIndex++}::uuid`)
    }

    if (input.filedOn !== null && input.filedOn !== undefined) {
      params.push(input.filedOn)
      setClauses.push(`filed_on = $${paramIndex++}::date`)
    }

    if (input.category !== null && input.category !== undefined) {
      params.push(input.category)
      setClauses.push(`category = $${paramIndex++}::text`)
    }

    if (input.requirement !== null && input.requirement !== undefined) {
      params.push(input.requirement)
      setClauses.push(`requirement = $${paramIndex++}::text`)
    }

    if (input.dueDate !== null && input.dueDate !== undefined) {
      params.push(input.dueDate)
      setClauses.push(`due_date = $${paramIndex++}::date`)
    }

    if (input.description !== null && input.description !== undefined) {
      params.push(input.description)
      setClauses.push(`description = $${paramIndex++}::text`)
    }

    if (input.penalty !== null && input.penalty !== undefined) {
      params.push(input.penalty)
      setClauses.push(`penalty = $${paramIndex++}::text`)
    }

    if (input.penaltyBaseAmount !== undefined) {
      params.push(input.penaltyBaseAmount)
      setClauses.push(`penalty_base_amount = $${paramIndex++}::numeric`)
    }

    if (input.penaltyConfig !== undefined) {
      params.push(JSON.stringify(input.penaltyConfig))
      setClauses.push(`penalty_config = $${paramIndex++}::jsonb`)
    }

    if (input.possibleLegalAction !== null && input.possibleLegalAction !== undefined) {
      params.push(input.possibleLegalAction)
      setClauses.push(`possible_legal_action = $${paramIndex++}::text`)
    }

    if (input.isCritical !== null && input.isCritical !== undefined) {
      params.push(input.isCritical)
      setClauses.push(`is_critical = $${paramIndex++}::boolean`)
    }

    if (input.financialYear !== null && input.financialYear !== undefined) {
      params.push(input.financialYear)
      setClauses.push(`financial_year = $${paramIndex++}::text`)
    }

    if (input.complianceType !== null && input.complianceType !== undefined) {
      params.push(input.complianceType)
      setClauses.push(`compliance_type = $${paramIndex++}::text`)
    }

    if (input.yearType !== null && input.yearType !== undefined) {
      params.push(input.yearType)
      setClauses.push(`year_type = $${paramIndex++}::text`)
    }

    if (input.requiredDocuments !== null && input.requiredDocuments !== undefined) {
      params.push(input.requiredDocuments)
      setClauses.push(`required_documents = $${paramIndex++}::text[]`)
    }

    // Add requirementId as last parameter
    params.push(requirementId)

    // Build final query with proper parameterization
    const query = `UPDATE regulatory_requirements
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}::uuid`

    await prisma.$executeRawUnsafe(query, ...params)
  }

  private mapRow(row: any): Requirement {
    return {
      id: row.id,
      company_id: row.company_id,
      template_id: row.template_id ?? null,
      category: row.category,
      requirement: row.requirement,
      description: row.description ?? null,
      status: row.status ?? 'not_started',
      due_date: row.due_date ? (row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : String(row.due_date)) : '',
      penalty: row.penalty ?? null,
      penalty_config: row.penalty_config ?? null,
      penalty_base_amount: row.penalty_base_amount != null ? Number(row.penalty_base_amount) : null,
      is_critical: row.is_critical ?? false,
      financial_year: row.financial_year ?? null,
      compliance_type: row.compliance_type ?? null,
      year_type: row.year_type ?? undefined,
      filed_on: row.filed_on ? (row.filed_on instanceof Date ? row.filed_on.toISOString().split('T')[0] : String(row.filed_on)) : null,
      filed_by: row.filed_by ?? null,
      status_reason: row.status_reason ?? null,
      required_documents: Array.isArray(row.required_documents)
        ? row.required_documents
        : row.required_documents
          ? [String(row.required_documents)]
          : [],
      possible_legal_action: row.possible_legal_action ?? null,
      created_at: row.created_at ? (row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)) : new Date().toISOString(),
      updated_at: row.updated_at ? (row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at)) : new Date().toISOString(),
      created_by: row.created_by ?? null,
      updated_by: row.updated_by ?? null,
    }
  }
}
