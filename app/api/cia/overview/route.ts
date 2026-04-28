import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/passport-session'
import { prisma } from '@/lib/prisma'
import { streamChatCompletion, type ChatMessage } from '@/lib/api/openai'

/**
 * Streaming AI Overview for the document vault. Reads through Prisma
 * (Supabase admin client returns empty in this env — same root-cause as
 * the context builder). Generates a brief markdown summary streamed to
 * the client as plain text.
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

  const [docs, reqs, company] = await Promise.all([
    prisma.companyDocument.findMany({
      where: { company_id: companyId, deleted_at: null, is_draft: false },
      select: { file_name: true, folder_name: true, document_type: true },
    }).catch(err => {
      console.error('[CIA Overview] docs query threw', err instanceof Error ? err.message : String(err))
      return [] as Array<{ file_name: string | null; folder_name: string | null; document_type: string | null }>
    }),
    prisma.$queryRawUnsafe<Array<{ category: string; requirement: string; status: string; due_date: Date | null; penalty: string | null }>>(
      `SELECT category, requirement, status, due_date, penalty
       FROM regulatory_requirements
       WHERE company_id = $1::uuid`,
      companyId,
    ).catch(err => {
      console.error('[CIA Overview] reqs query threw', err instanceof Error ? err.message : String(err))
      return [] as any[]
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, type: true },
    }).catch(err => {
      console.error('[CIA Overview] company query threw', err instanceof Error ? err.message : String(err))
      return null
    }),
  ])

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

  const total = reqs.length
  const completed = reqs.filter(r => r.status === 'completed').length
  const overdue = reqs.filter(r => r.status === 'overdue').length
  const pending = reqs.filter(r => r.status === 'pending').length

  const contextBlock = `Company: ${company?.name || 'Unknown'} (${company?.type || 'N/A'})

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
      content: `You are a compliance intelligence agent for Indian private limited companies. Generate a brief AI Overview (3-5 short paragraphs) of this company's document vault and compliance status.

Rules:
- Reference only the vault taxonomy used by this product: Constitutional Documents, Licences, Statutory Compliances, Financials, MCA Filings (and their sub-folders like MOA, AOA, COI, PAN, TAN, Advance Tax, TDS, ITR, Tax Audit, GST). NEVER mention generic Western categories like "Policies, Legal, HR, Security, Finance" — those do not exist here.
- Be specific: mention exact document counts, the actual folder names above, what's uploaded, what's missing, and highlight any overdue / pending compliance items.
- Use markdown: **bold** key numbers and folder names.
- No headings/headers. Flowing paragraphs. Bullet points only where they help.
- Address the user directly ("You have…", "Your vault…").
- If the vault is empty, say so honestly and suggest the first 2-3 documents to upload (start with MOA, AOA, COI under Constitutional).`,
    },
    { role: 'user', content: contextBlock },
  ]

  // Pre-flight: try to OPEN the LLM stream synchronously. If we can
  // get a stream handle without throwing, we promote to streaming
  // response. If it throws here (auth, missing deployment, rate limit
  // at the door), return a real HTTP 500 + JSON so the client can show
  // a retry UI rather than "Failed to generate overview." being
  // injected as the AI's content.
  let tokenStream: AsyncIterable<string> | null = null
  try {
    tokenStream = await streamChatCompletion(messages)
  } catch (error) {
    console.error('[CIA Overview] stream open threw',
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error.stack : '')
    return Response.json(
      { error: 'unavailable', message: 'Overview generator is temporarily unavailable.' },
      { status: 503 },
    )
  }
  if (!tokenStream) {
    return Response.json(
      { error: 'unavailable', message: 'Overview generator returned no stream.' },
      { status: 503 },
    )
  }

  // Mid-stream errors: we've already started writing to the client and
  // can't change the HTTP status. Use a sentinel marker the client
  // splits on, then renders "couldn't finish" UI instead of treating
  // the trailing text as content.
  const STREAM_ERROR_SENTINEL = '​[STREAM_ERROR]​'
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const token of tokenStream as AsyncIterable<string>) {
          controller.enqueue(encoder.encode(token))
        }
      } catch (error) {
        console.error('[CIA Overview] stream mid-flight threw',
          error instanceof Error ? error.message : String(error),
          error instanceof Error ? error.stack : '')
        controller.enqueue(encoder.encode(STREAM_ERROR_SENTINEL))
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
