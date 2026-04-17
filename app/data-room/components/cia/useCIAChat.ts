'use client'

import { useState, useCallback, useRef } from 'react'

export type StepId = 'searching' | 'analyzing' | 'generating'

export interface ThinkingStep {
  id: StepId
  label: string
  status: 'pending' | 'active' | 'done'
}

export interface Source {
  name: string
  similarity: number
}

export interface ToolActivity {
  id: string
  name: string
  args?: Record<string, unknown>
  status: 'running' | 'done' | 'failed'
  summary?: string
}

interface UseCIAChatOptions {
  companyId: string
  onToken: (content: string) => void
  onSources: (sources: Source[]) => void
  onToolCall?: (activity: ToolActivity) => void
  onToolResult?: (id: string, ok: boolean, summary: string) => void
  onDone: () => void
  onTitle: (title: string) => void
  onError: (message: string) => void
}

export function useCIAChat({ companyId, onToken, onSources, onToolCall, onToolResult, onDone, onTitle, onError }: UseCIAChatOptions) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [steps, setSteps] = useState<ThinkingStep[]>([])
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const initialSteps: ThinkingStep[] = [
    { id: 'searching', label: 'Searching your documents...', status: 'pending' },
    { id: 'analyzing', label: 'Analyzing compliance data...', status: 'pending' },
    { id: 'generating', label: 'Generating response...', status: 'pending' },
  ]

  const updateStep = useCallback((stepId: StepId) => {
    setSteps(prev =>
      prev.map(s => {
        if (s.id === stepId) return { ...s, status: 'active' as const }
        // Mark all previous steps as done
        const stepOrder: StepId[] = ['searching', 'analyzing', 'generating']
        const currentIdx = stepOrder.indexOf(stepId)
        const thisIdx = stepOrder.indexOf(s.id)
        if (thisIdx < currentIdx && s.status === 'active') return { ...s, status: 'done' as const }
        return s
      })
    )
  }, [])

  const sendMessage = useCallback(
    async (messages: { role: 'user' | 'assistant'; content: string }[]) => {
      if (isStreaming) return

      abortRef.current = new AbortController()
      setIsStreaming(true)
      setSteps(initialSteps)
      setToolActivities([])

      try {
        const response = await fetch('/api/cia/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, companyId }),
          signal: abortRef.current.signal,
        })

        if (!response.ok) {
          onError(response.status === 401 ? 'Please sign in to use CIA.' : 'Failed to get response.')
          setIsStreaming(false)
          setSteps([])
          return
        }

        const reader = response.body?.getReader()
        if (!reader) {
          onError('No response stream available.')
          setIsStreaming(false)
          setSteps([])
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Parse SSE events
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const jsonStr = line.slice(6).trim()
            if (!jsonStr) continue

            try {
              const event = JSON.parse(jsonStr)

              switch (event.type) {
                case 'step':
                  updateStep(event.step as StepId)
                  break
                case 'sources':
                  onSources(event.sources)
                  break
                case 'token':
                  // Mark all steps as done on first token
                  setSteps(prev => prev.map(s => ({ ...s, status: 'done' as const })))
                  onToken(event.content)
                  break
                case 'tool_call': {
                  const activity: ToolActivity = {
                    id: event.id,
                    name: event.name,
                    args: event.args,
                    status: 'running',
                  }
                  setToolActivities(prev => [...prev, activity])
                  onToolCall?.(activity)
                  break
                }
                case 'tool_result': {
                  setToolActivities(prev =>
                    prev.map(a =>
                      a.id === event.id
                        ? { ...a, status: event.ok ? 'done' : 'failed', summary: event.summary }
                        : a,
                    ),
                  )
                  onToolResult?.(event.id, !!event.ok, event.summary || '')
                  break
                }
                case 'done':
                  onDone()
                  break
                case 'title':
                  onTitle(event.title)
                  break
                case 'error':
                  onError(event.message)
                  break
              }
            } catch {
              // Ignore malformed SSE lines
            }
          }
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          onError('Connection lost. Please try again.')
        }
      } finally {
        setIsStreaming(false)
        setSteps([])
        abortRef.current = null
      }
    },
    [companyId, isStreaming, onToken, onSources, onToolCall, onToolResult, onDone, onTitle, onError, updateStep]
  )

  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { isStreaming, steps, toolActivities, sendMessage, abort }
}
