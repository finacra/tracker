import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/passport-session'
import { createAdminClient } from '@/utils/supabase/admin'
import { streamChatCompletion, type ChatMessage } from '@/lib/api/openai'
import { handleAPIError } from '@/lib/errors/handle-error'

/**
 * Streaming AI Overview for the document vault.
 * Generates a brief text summary of all uploaded documents + compliance status.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })

  let companyId: string
  try {
    const body = await req.json()
    companyId = body.companyId
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  if (!companyId) return new Response('Missing companyId', { status: 400 })

  const supabase = createAdminClient()

  // Fetch document inventory + compliance summary in parallel
  const [docsResult, reqsResult, companyResult] = await Promise.all([
    supabase
      .from('company_documents_internal')
      .select('file_name, folder_name, document_type')
      .eq('company_id', companyId),
    supabase
      .from('regulatory_requirements')
      .select('category, requirement, status, due_date, penalty')
      .eq('company_id', companyId),
    supabase
      .from('companies')
      .select('name, company_type')
      .eq('id', companyId)
      .single(),
  ])

  const docs = (docsResult.data || []) as any[]
  const reqs = (reqsResult.data || []) as any[]
  const company = companyResult.data as any

  // Build document summary by folder
  const folderMap = new Map<string, string[]>()
  for (const doc of docs) {
    const folder = doc.folder_name || doc.document_type || 'Other'
    if (!folderMap.has(folder)) folderMap.set(folder, [])
    folderMap.get(folder)!.push(doc.file_name || 'Unnamed')
  }

  let docSummary = `Total documents: ${docs.length}\n`
  for (const [folder, files] of folderMap) {
    docSummary += `- ${folder}: ${files.length} files (${files.slice(0, 3).join(', ')}${files.length > 3 ? ` +${files.length - 3} more` : ''})\n`
  }

  // Compliance summary
  const total = reqs.length
  const completed = reqs.filter((r: any) => r.status === 'completed').length
  const overdue = reqs.filter((r: any) => r.status === 'overdue').length
  const pending = reqs.filter((r: any) => r.status === 'pending').length

  const contextBlock = `Company: ${company?.name || 'Unknown'} (${company?.company_type || 'N/A'})

UPLOADED DOCUMENTS:
${docSummary}
COMPLIANCE STATUS:
- Total requirements: ${total}
- Completed: ${completed}
- Overdue: ${overdue}
- Pending: ${pending}
- Not started: ${total - completed - overdue - pending}`

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a compliance intelligence agent. Generate a brief AI Overview (3-5 short paragraphs) of this company's document vault and compliance status. Be specific — mention exact document counts, folder names, what types of documents are uploaded, and highlight key compliance gaps or risks. Use markdown: **bold** key numbers and terms. Keep it concise and scannable. Do NOT use headings or headers. Write in flowing paragraph style with bullet points only where needed. Address the user directly ("You have...", "Your company...").`,
    },
    {
      role: 'user',
      content: contextBlock,
    },
  ]

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const tokenStream = await streamChatCompletion(messages)
        if (!tokenStream) {
          controller.enqueue(encoder.encode('Unable to generate overview. Please try again.'))
          controller.close()
          return
        }

        for await (const token of tokenStream) {
          controller.enqueue(encoder.encode(token))
        }
      } catch (error) {
        console.error('[CIA Overview] Error:', error)
        controller.enqueue(encoder.encode('Failed to generate overview.'))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
