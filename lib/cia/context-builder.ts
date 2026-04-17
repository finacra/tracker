import { searchDocumentChunks, type SearchResult } from './vector-search'
import { prisma } from '@/lib/prisma'

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
  // Raw SQL because Prisma schema doesn't declare all regulatory_requirements
  // columns (e.g., financial_year) but the DB has them.
  const rows = await prisma.$queryRawUnsafe<Array<{
    category: string
    requirement: string
    status: string
    due_date: Date | null
    penalty: string | null
  }>>(
    `SELECT category, requirement, status, due_date, penalty
     FROM regulatory_requirements
     WHERE company_id = $1::uuid`,
    companyId,
  ).catch(err => {
    console.error('[CIA:ctx] compliance query threw', err instanceof Error ? err.message : String(err))
    return [] as any[]
  })

  const total = rows.length
  const completed = rows.filter(r => r.status === 'completed').length
  const overdue = rows.filter(r => r.status === 'overdue').length
  const pending = rows.filter(r => r.status === 'pending').length
  const notStarted = rows.filter(r => r.status === 'not_started').length

  const overdueItems = rows
    .filter(r => r.status === 'overdue' || (r.status !== 'completed' && r.due_date && new Date(r.due_date) < new Date()))
    .sort((a, b) => {
      const ad = a.due_date ? new Date(a.due_date).getTime() : 0
      const bd = b.due_date ? new Date(b.due_date).getTime() : 0
      return ad - bd
    })
    .slice(0, 5)
    .map(r => ({
      requirement: r.requirement,
      category: r.category,
      dueDate: r.due_date ? new Date(r.due_date).toISOString().slice(0, 10) : '',
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
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      type: true,
      nic_code: true,
      state: true,
      incorporation_date: true,
      country_code: true,
    },
  }).catch(err => {
    console.error('[CIA:ctx] company query threw', err instanceof Error ? err.message : String(err))
    return null
  })

  if (!company) return defaultCompanyProfile()
  return {
    name: company.name || 'Unknown',
    companyType: company.type,
    nicCode: company.nic_code,
    state: company.state,
    incorporationDate: company.incorporation_date
      ? new Date(company.incorporation_date).toISOString().slice(0, 10)
      : null,
    country: company.country_code || 'IN',
  }
}

async function fetchDocumentInventory(companyId: string): Promise<DocumentInventory> {
  const docs = await prisma.companyDocument.findMany({
    where: {
      company_id: companyId,
      is_draft: false,
      deleted_at: null,
    },
    select: {
      file_name: true,
      folder_name: true,
      document_type: true,
    },
  }).catch(err => {
    console.error('[CIA:ctx] documents query threw', err instanceof Error ? err.message : String(err))
    return [] as Array<{ file_name: string | null; folder_name: string | null; document_type: string | null }>
  })

  const folderMap = new Map<string, string[]>()
  for (const doc of docs) {
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

  return { totalDocuments: docs.length, folders }
}

function defaultComplianceSummary(): ComplianceSummary {
  return { total: 0, completed: 0, overdue: 0, pending: 0, notStarted: 0, topOverdue: [], totalPenaltyEstimate: 'N/A' }
}

function defaultCompanyProfile(): CompanyProfile {
  return { name: 'Unknown', companyType: null, nicCode: null, state: null, incorporationDate: null, country: 'India' }
}
