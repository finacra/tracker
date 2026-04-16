import { searchDocumentChunks, type SearchResult } from './vector-search'
import { createAdminClient } from '@/utils/supabase/admin'

export interface CIAContext {
  documentChunks: SearchResult[]
  complianceSummary: ComplianceSummary
  companyProfile: CompanyProfile
  documentInventory: DocumentInventory
}

interface DocumentInventory {
  totalDocuments: number
  folders: { name: string; count: number; files: string[] }[]
}

interface ComplianceSummary {
  total: number
  completed: number
  overdue: number
  pending: number
  notStarted: number
  topOverdue: { requirement: string; category: string; dueDate: string; penalty: string | null }[]
  totalPenaltyEstimate: string
}

interface CompanyProfile {
  name: string
  companyType: string | null
  nicCode: string | null
  state: string | null
  incorporationDate: string | null
  country: string | null
}

/**
 * Build full context for the CIA agent: document RAG + compliance data + company profile.
 * All fetches run in parallel for speed.
 */
export async function buildCIAContext(companyId: string, query: string): Promise<CIAContext> {
  const [documentChunks, complianceSummary, companyProfile, documentInventory] = await Promise.all([
    searchDocumentChunks(query, companyId, 12).catch(() => [] as SearchResult[]),
    fetchComplianceSummary(companyId).catch(() => defaultComplianceSummary()),
    fetchCompanyProfile(companyId).catch(() => defaultCompanyProfile()),
    fetchDocumentInventory(companyId).catch(() => ({ totalDocuments: 0, folders: [] })),
  ])

  return { documentChunks, complianceSummary, companyProfile, documentInventory }
}

/**
 * Format the context into a string for the LLM system prompt.
 */
export function formatContextForPrompt(ctx: CIAContext): string {
  const parts: string[] = []

  // Company profile
  const p = ctx.companyProfile
  parts.push(`## Company Profile
- Name: ${p.name}
- Type: ${p.companyType || 'N/A'}
- NIC Code: ${p.nicCode || 'N/A'}
- State: ${p.state || 'N/A'}
- Incorporation Date: ${p.incorporationDate || 'N/A'}
- Country: ${p.country || 'India'}`)

  // Compliance summary
  const s = ctx.complianceSummary
  parts.push(`## Compliance Status
- Total requirements: ${s.total}
- Completed: ${s.completed}
- Overdue: ${s.overdue}
- Pending: ${s.pending}
- Not Started: ${s.notStarted}
- Estimated penalty exposure: ${s.totalPenaltyEstimate}`)

  if (s.topOverdue.length > 0) {
    parts.push(`### Top Overdue Items`)
    s.topOverdue.forEach((item, i) => {
      parts.push(`${i + 1}. ${item.requirement} (${item.category}) — Due: ${item.dueDate}${item.penalty ? `, Penalty: ${item.penalty}` : ''}`)
    })
  }

  // Document inventory (all uploaded files)
  const inv = ctx.documentInventory
  if (inv.totalDocuments > 0) {
    parts.push(`## Uploaded Documents (${inv.totalDocuments} total)`)
    inv.folders.forEach(folder => {
      parts.push(`### ${folder.name} (${folder.count} files)\n${folder.files.map(f => `- ${f}`).join('\n')}`)
    })
  }

  // Document excerpts from RAG
  if (ctx.documentChunks.length > 0) {
    parts.push(`## Relevant Document Excerpts`)
    ctx.documentChunks.forEach((chunk, i) => {
      const source = chunk.metadata?.source || 'Unknown document'
      const fileName = source.split('/').pop() || source
      parts.push(`### Source ${i + 1}: ${fileName} (relevance: ${Math.round(chunk.similarity * 100)}%)
${chunk.content}`)
    })
  }

  return parts.join('\n\n')
}

async function fetchComplianceSummary(companyId: string): Promise<ComplianceSummary> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('regulatory_requirements')
    .select('id, category, requirement, status, due_date, penalty')
    .eq('company_id', companyId)

  if (error || !data) return defaultComplianceSummary()

  const total = data.length
  const completed = data.filter((r: any) => r.status === 'completed').length
  const overdue = data.filter((r: any) => r.status === 'overdue').length
  const pending = data.filter((r: any) => r.status === 'pending').length
  const notStarted = data.filter((r: any) => r.status === 'not_started').length

  // Top overdue items
  const overdueItems = data
    .filter((r: any) => r.status === 'overdue' || (r.status !== 'completed' && r.due_date && new Date(r.due_date) < new Date()))
    .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, 5)
    .map((r: any) => ({
      requirement: r.requirement,
      category: r.category,
      dueDate: r.due_date,
      penalty: r.penalty,
    }))

  return {
    total,
    completed,
    overdue,
    pending,
    notStarted,
    topOverdue: overdueItems,
    totalPenaltyEstimate: overdue > 0 ? `${overdue} items with potential penalties` : 'No penalties',
  }
}

async function fetchCompanyProfile(companyId: string): Promise<CompanyProfile> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('companies')
    .select('name, company_type, nic_code, state, incorporation_date, country')
    .eq('id', companyId)
    .single()

  if (error || !data) return defaultCompanyProfile()

  const row = data as any
  return {
    name: row.name || 'Unknown',
    companyType: row.company_type,
    nicCode: row.nic_code,
    state: row.state,
    incorporationDate: row.incorporation_date,
    country: row.country,
  }
}

async function fetchDocumentInventory(companyId: string): Promise<DocumentInventory> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('company_documents_internal')
    .select('file_name, folder_name, document_type')
    .eq('company_id', companyId)
    .eq('is_draft', false)
    .is('deleted_at', null)

  if (error || !data) return { totalDocuments: 0, folders: [] }

  const rows = data as any[]
  const folderMap = new Map<string, string[]>()
  for (const doc of rows) {
    const folder = doc.folder_name || doc.document_type || 'Uncategorized'
    const name = doc.file_name || 'Unnamed file'
    if (!folderMap.has(folder)) folderMap.set(folder, [])
    folderMap.get(folder)!.push(name)
  }

  const folders = Array.from(folderMap.entries()).map(([name, files]) => ({
    name,
    count: files.length,
    files,
  }))

  return { totalDocuments: rows.length, folders }
}

function defaultComplianceSummary(): ComplianceSummary {
  return { total: 0, completed: 0, overdue: 0, pending: 0, notStarted: 0, topOverdue: [], totalPenaltyEstimate: 'N/A' }
}

function defaultCompanyProfile(): CompanyProfile {
  return { name: 'Unknown', companyType: null, nicCode: null, state: null, incorporationDate: null, country: 'India' }
}
