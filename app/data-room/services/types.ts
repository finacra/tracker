/**
 * Service interfaces for dependency injection (DIP compliance)
 */

export interface RegulatoryRequirement {
  id: string
  requirement?: string | null
  description?: string | null
  category?: string | null
  due_date?: string | null
  penalty?: string | null
  penalty_base_amount?: number | null
  is_critical?: boolean
  financial_year?: string | null
  status?: string | null
  compliance_type?: string | null
  year?: string | null
  [key: string]: any
}

export interface ServiceResult<T = any> {
  success: boolean
  data?: T
  error?: string
}
