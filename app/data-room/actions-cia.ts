'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { prisma } from '@/lib/prisma'

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

// ─── CIA Conversation History (DB persistence) ───

export interface DBConversation {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  messages: DBMessage[]
}

export interface DBMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: { name: string; similarity: number }[]
  timestamp: number
}

/** Load all conversations for a company+user */
export async function loadCIAHistory(companyId: string, userId: string): Promise<DBConversation[]> {
  const rows = await prisma.ciaConversation.findMany({
    where: { company_id: companyId, user_id: userId },
    include: { messages: { orderBy: { created_at: 'asc' } } },
    orderBy: { updated_at: 'desc' },
  })
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at.getTime(),
    updatedAt: r.updated_at.getTime(),
    messages: r.messages.map(m => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      sources: m.sources as any ?? undefined,
      timestamp: m.created_at.getTime(),
    })),
  }))
}

/** Create a new conversation */
export async function createCIAConversation(companyId: string, userId: string, name?: string): Promise<string> {
  const conv = await prisma.ciaConversation.create({
    data: { company_id: companyId, user_id: userId, name: name || 'New Chat' },
  })
  return conv.id
}

/** Add a message to a conversation */
export async function addCIAMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  sources?: { name: string; similarity: number }[]
): Promise<string> {
  const msg = await prisma.ciaMessage.create({
    data: {
      conversation_id: conversationId,
      role,
      content,
      sources: sources ? JSON.parse(JSON.stringify(sources)) : undefined,
    },
  })
  await prisma.ciaConversation.update({
    where: { id: conversationId },
    data: { updated_at: new Date() },
  })
  return msg.id
}

/** Update the last assistant message (after streaming completes) */
export async function updateCIAMessage(
  messageId: string,
  content: string,
  sources?: { name: string; similarity: number }[]
) {
  await prisma.ciaMessage.update({
    where: { id: messageId },
    data: {
      content,
      sources: sources ? JSON.parse(JSON.stringify(sources)) : undefined,
    },
  })
}

/** Rename a conversation */
export async function renameCIAConversation(conversationId: string, name: string) {
  await prisma.ciaConversation.update({
    where: { id: conversationId },
    data: { name },
  })
}

/** Delete a conversation (cascade deletes messages) */
export async function deleteCIAConversation(conversationId: string) {
  await prisma.ciaConversation.delete({ where: { id: conversationId } })
}
