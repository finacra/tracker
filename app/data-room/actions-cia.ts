'use server'

import { createAdminClient } from '@/utils/supabase/admin'

export interface CIAOverview {
  healthScore: number // 0-100
  totalRequirements: number
  completedCount: number
  overdueCount: number
  pendingCount: number
  topRisks: { requirement: string; category: string; dueDate: string | null; penalty: string | null }[]
  documentCount: number
  suggestedQuestions: string[]
}

/**
 * Get a quick CIA overview for the floating widget — pure data aggregation, no LLM call.
 */
export async function getCIAOverview(companyId: string): Promise<CIAOverview> {
  const supabase = createAdminClient()

  const [reqResult, docResult] = await Promise.all([
    supabase
      .from('regulatory_requirements')
      .select('id, category, requirement, status, due_date, penalty')
      .eq('company_id', companyId),
    supabase
      .from('company_documents')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId),
  ])

  const reqs = reqResult.data || []
  const documentCount = docResult.count || 0

  const total = reqs.length
  const completed = reqs.filter((r: any) => r.status === 'completed').length
  const overdue = reqs.filter((r: any) => r.status === 'overdue').length
  const pending = reqs.filter((r: any) => r.status === 'pending').length

  const healthScore = total > 0 ? Math.round((completed / total) * 100) : 100

  const topRisks = reqs
    .filter((r: any) => r.status === 'overdue' || (r.status !== 'completed' && r.due_date && new Date(r.due_date) < new Date()))
    .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, 3)
    .map((r: any) => ({
      requirement: r.requirement,
      category: r.category,
      dueDate: r.due_date,
      penalty: r.penalty,
    }))

  // Dynamic suggested questions based on company state
  const suggestedQuestions: string[] = []
  if (overdue > 0) suggestedQuestions.push(`What are my ${overdue} overdue compliances?`)
  if (documentCount > 0) suggestedQuestions.push('Summarize my uploaded documents')
  suggestedQuestions.push('What filings are due this month?')
  suggestedQuestions.push('What penalties am I facing?')
  if (documentCount === 0) suggestedQuestions.push('What documents should I upload?')

  return {
    healthScore,
    totalRequirements: total,
    completedCount: completed,
    overdueCount: overdue,
    pendingCount: pending,
    topRisks,
    documentCount,
    suggestedQuestions: suggestedQuestions.slice(0, 4),
  }
}
