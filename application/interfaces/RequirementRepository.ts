import type { Requirement } from '@/domain/models/Requirement'

export interface CreateRequirementInput {
  companyId: string
  category: string
  requirement: string
  description?: string | null
  dueDate: string
  penalty?: string | null
  penaltyBaseAmount?: number | null
  penaltyConfig?: Record<string, unknown> | null
  possibleLegalAction?: string | null
  isCritical?: boolean
  financialYear?: string | null
  complianceType?: 'one-time' | 'monthly' | 'quarterly' | 'annual'
  yearType?: 'FY' | 'CY'
  requiredDocuments?: string[]
  createdBy: string
  updatedBy: string
}

export interface UpdateRequirementInput {
  status?: string
  statusReason?: string | null
  updatedBy: string
  appUpdatedBy?: string | null
  filedBy?: string | null
  appFiledBy?: string | null
  filedOn?: string | null
  category?: string
  requirement?: string
  dueDate?: string | null
}

export interface RequirementRepository {
  refreshOverdueStatuses(companyId: string): Promise<void>
  refreshAllOverdueStatuses(): Promise<void>
  getByCompanyId(companyId: string): Promise<Requirement[]>
  getAll(): Promise<Requirement[]>
  getById(requirementId: string): Promise<Requirement | null>
  create(input: CreateRequirementInput): Promise<Requirement>
  update(requirementId: string, input: UpdateRequirementInput): Promise<void>
  delete(requirementId: string, companyId?: string | null): Promise<void>
}
