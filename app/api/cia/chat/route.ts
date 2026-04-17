import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/passport-session'
import { buildCIAContext } from '@/lib/cia/context-builder'
import { buildSystemPrompt, TITLE_GENERATION_PROMPT } from '@/lib/cia/system-prompt'
import {
  streamToolChatCompletion,
  chatCompletion,
  type ChatMessage,
  type ToolSchema,
} from '@/lib/api/openai'
import { TOOLS, runTool, type ToolContext } from '@/lib/cia/tools'

interface RequestBody {
  messages: { role: 'user' | 'assistant'; content: string }[]
  companyId: string
}

const MAX_TOOL_ROUNDS = 4

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

const TOOL_SCHEMAS: ToolSchema[] = TOOLS.map(t => ({
  type: 'function' as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters as Record<string, unknown>,
  },
}))

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })

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
  const toolCtx: ToolContext = { companyId, userId: session.appUserId }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEvent(data)))
      }

      try {
        send({ type: 'step', step: 'searching', label: 'Searching your documents...' })
        const ctx = await buildCIAContext(companyId, latestUserMessage)
        send({ type: 'step', step: 'analyzing', label: 'Analyzing compliance data...' })

        if (ctx.documentChunks.length > 0) {
          const sources = ctx.documentChunks.map(chunk => ({
            name: (chunk.metadata?.source || 'Unknown').split('/').pop() || 'Document',
            similarity: Math.round(chunk.similarity * 100),
          }))
          send({ type: 'sources', sources })
        }

        send({ type: 'step', step: 'generating', label: 'Generating response...' })

        const systemPrompt = buildSystemPrompt(ctx)
        const chatMessages: ChatMessage[] = [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ]

        // Tool-call loop: model can call tools; we run them server-side and
        // feed results back. Cap rounds to avoid infinite loops.
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          let pendingToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = []
          let assistantContent = ''
          let assistantToolCalls: ChatMessage['tool_calls']

          for await (const ev of streamToolChatCompletion(chatMessages, TOOL_SCHEMAS)) {
            if (ev.type === 'token') {
              send({ type: 'token', content: ev.content })
            } else if (ev.type === 'tool_call') {
              pendingToolCalls.push({ id: ev.id, name: ev.name, args: ev.args })
              send({ type: 'tool_call', id: ev.id, name: ev.name, args: ev.args })
            } else if (ev.type === 'assistant_message') {
              assistantContent = ev.content
              assistantToolCalls = ev.tool_calls
            } else if (ev.type === 'error') {
              send({ type: 'error', message: ev.message })
              controller.close()
              return
            }
          }

          // Push the assistant turn into the history (with tool_calls if any)
          chatMessages.push({
            role: 'assistant',
            content: assistantContent || null,
            tool_calls: assistantToolCalls,
          })

          if (pendingToolCalls.length === 0) {
            // Plain text answer — we're done
            break
          }

          // Execute each tool and append a tool-role message so the next
          // round can use the result
          for (const call of pendingToolCalls) {
            const result = await runTool(call.name, call.args, toolCtx)
            send({
              type: 'tool_result',
              id: call.id,
              name: call.name,
              ok: result.ok,
              summary: result.summary,
            })
            chatMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: call.name,
              content: JSON.stringify({
                ok: result.ok,
                summary: result.summary,
                data: result.data ?? null,
                error: result.error ?? null,
              }),
            })
          }
          // Loop continues — model sees tool results, may call more or answer
        }

        send({ type: 'done' })

        if (messages.filter(m => m.role === 'user').length === 1) {
          try {
            const title = await chatCompletion([
              { role: 'system', content: TITLE_GENERATION_PROMPT },
              { role: 'user', content: latestUserMessage },
            ])
            if (title) send({ type: 'title', title: title.trim() })
          } catch {
            // best-effort
          }
        }
      } catch (error) {
        console.error('[CIA Route] threw',
          error instanceof Error ? error.message : String(error),
          error instanceof Error ? error.stack : '')
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
