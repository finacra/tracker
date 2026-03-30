import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/passport-session'
import { buildCIAContext } from '@/lib/cia/context-builder'
import { buildSystemPrompt, TITLE_GENERATION_PROMPT } from '@/lib/cia/system-prompt'
import { streamChatCompletion, chatCompletion, type ChatMessage } from '@/lib/api/openai'

interface RequestBody {
  messages: { role: 'user' | 'assistant'; content: string }[]
  companyId: string
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function POST(req: NextRequest) {
  // Auth check
  const session = await getSession()
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { messages, companyId } = body
  if (!companyId || !messages || messages.length === 0) {
    return new Response('Missing companyId or messages', { status: 400 })
  }

  const latestUserMessage = messages.filter(m => m.role === 'user').pop()?.content || ''

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEvent(data)))
      }

      try {
        // Step 1: Searching documents
        send({ type: 'step', step: 'searching', label: 'Searching your documents...' })

        // Step 2: Building context (vector search + compliance data in parallel)
        const ctx = await buildCIAContext(companyId, latestUserMessage)

        send({ type: 'step', step: 'analyzing', label: 'Analyzing compliance data...' })

        // Send document sources if any
        if (ctx.documentChunks.length > 0) {
          const sources = ctx.documentChunks.map(chunk => ({
            name: (chunk.metadata?.source || 'Unknown').split('/').pop() || 'Document',
            similarity: Math.round(chunk.similarity * 100),
          }))
          send({ type: 'sources', sources })
        }

        // Step 3: Generate response
        send({ type: 'step', step: 'generating', label: 'Generating response...' })

        // Build chat messages with system prompt
        const systemPrompt = buildSystemPrompt(ctx)
        const chatMessages: ChatMessage[] = [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ]

        const tokenStream = await streamChatCompletion(chatMessages)

        if (!tokenStream) {
          send({ type: 'error', message: 'Failed to connect to AI service' })
          controller.close()
          return
        }

        // Stream tokens
        for await (const token of tokenStream) {
          send({ type: 'token', content: token })
        }

        send({ type: 'done' })

        // Auto-generate title from first user message (non-blocking)
        if (messages.filter(m => m.role === 'user').length === 1) {
          try {
            const title = await chatCompletion([
              { role: 'system', content: TITLE_GENERATION_PROMPT },
              { role: 'user', content: latestUserMessage },
            ])
            if (title) {
              send({ type: 'title', title: title.trim() })
            }
          } catch {
            // Title generation is best-effort
          }
        }
      } catch (error: any) {
        console.error('[CIA Route] Error:', error)
        send({ type: 'error', message: 'An error occurred while processing your request.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
