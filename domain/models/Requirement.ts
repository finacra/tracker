export interface Requirement {
  id: string
  company_id: string
  template_id?: string | null
  category: string
  requirement: string
  description: string | null
  status: 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed'
  due_date: string
  penalty: string | null
  penalty_config: Record<string, unknown> | null
  penalty_base_amount: number | null
  is_critical: boolean
  financial_year: string | null
  compliance_type: 'one-time' | 'monthly' | 'quarterly' | 'annual' | null
  year_type?: 'FY' | 'CY'
  filed_on: string | null
  filed_by: string | null
  status_reason: string | null
  required_documents: string[]
  possible_legal_action: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  app_created_by?: string | null
  app_updated_by?: string | null
  app_filed_by?: string | null
}
