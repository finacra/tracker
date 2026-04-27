'use client'

import { useCallback, useRef, useState } from 'react'
import CIASidebar from './CIASidebar'
import CIAMessageList from './CIAMessageList'
import CIAInput from './CIAInput'
import { useCIAHistory, type CIAMessage } from './useCIAHistory'
import { useCIAChat, type Source } from './useCIAChat'
import { useAuth } from '@/hooks/useAuth'
import AgentAssistedUploadModal from '../AgentAssistedUploadModal'

interface Props {
  companyId: string
  isOpen: boolean
  onClose: () => void
  suggestedQuestions: string[]
}

export default function CIAChatPanel({ companyId, isOpen, onClose, suggestedQuestions }: Props) {
  const { user } = useAuth()
  const history = useCIAHistory(companyId, user?.id)
  const [streamingContent, setStreamingContent] = useState('')
  const [pendingSources, setPendingSources] = useState<Source[]>([])
  const [uploadOpen, setUploadOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const contentAccumulator = useRef('')

  // Refs mirror the active conversation + its assistant message ID so the
  // stream callbacks don't read stale React state. Without these, the
  // first message's response vanishes on done because activeConversationId
  // is still null in the closure at the moment createConversation returned.
  const activeConvIdRef = useRef<string | null>(null)
  const assistantMsgIdRef = useRef<string | null>(null)
  const historyRef = useRef(history)
  historyRef.current = history

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (activeConvIdRef.current) return activeConvIdRef.current
    if (history.activeConversationId) {
      activeConvIdRef.current = history.activeConversationId
      return history.activeConversationId
    }
    const id = await history.createConversation()
    activeConvIdRef.current = id
    return id
  }, [history])

  const chat = useCIAChat({
    companyId,
    onToken: useCallback((token: string) => {
      contentAccumulator.current += token
      setStreamingContent(contentAccumulator.current)
    }, []),
    onSources: useCallback((sources: Source[]) => {
      setPendingSources(sources)
    }, []),
    onToolResult: useCallback((_id: string, ok: boolean) => {
      if (ok && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cia:data-changed'))
      }
    }, []),
    onDone: useCallback(() => {
      const convId = activeConvIdRef.current
      const msgId = assistantMsgIdRef.current
      const finalText = contentAccumulator.current
      if (convId && finalText) {
        historyRef.current.updateLastAssistantMessage(convId, finalText, pendingSources, msgId)
      }
      contentAccumulator.current = ''
      assistantMsgIdRef.current = null
      setStreamingContent('')
      setPendingSources([])
    }, [pendingSources]),
    onTitle: useCallback((title: string) => {
      const convId = activeConvIdRef.current
      if (convId) historyRef.current.renameConversation(convId, title)
    }, []),
    onError: useCallback((message: string) => {
      const convId = activeConvIdRef.current
      const msgId = assistantMsgIdRef.current
      if (convId) historyRef.current.updateLastAssistantMessage(convId, `⚠ ${message}`, undefined, msgId)
      contentAccumulator.current = ''
      assistantMsgIdRef.current = null
      setStreamingContent('')
    }, []),
  })

  const handleSend = useCallback(
    async (text: string) => {
      const convId = await ensureConversation()

      // Build API messages from pre-existing state BEFORE we mutate it
      const conv = historyRef.current.conversations.find(c => c.id === convId)
      const apiMessages = [
        ...(conv?.messages || []).filter(m => m.content).map(m => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: text },
      ]

      // Persist the user turn AND the empty assistant placeholder before
      // streaming starts so we have DB IDs for the final update.
      historyRef.current.addMessage(convId, { role: 'user', content: text })
      const assistantDbId = await historyRef.current.addMessage(convId, { role: 'assistant', content: '' })
      assistantMsgIdRef.current = assistantDbId

      contentAccumulator.current = ''
      setStreamingContent('')
      setPendingSources([])
      chat.sendMessage(apiMessages)
    },
    [ensureConversation, chat]
  )

  const handleNewChat = useCallback(async () => {
    const id = await history.createConversation()
    activeConvIdRef.current = id
    assistantMsgIdRef.current = null
  }, [history])

  const handleSelectConversation = useCallback((id: string) => {
    history.setActiveConversationId(id)
    activeConvIdRef.current = id
    assistantMsgIdRef.current = null
  }, [history])

  const currentMessages = history.activeConversation?.messages.filter(m => m.content) || []
  const isEmpty = !history.activeConversation || currentMessages.length === 0

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed z-50 flex transform transition-all duration-300 ease-out ${
          isFullscreen
            ? 'inset-0 w-full'
            : 'inset-y-0 right-0 w-full sm:w-[520px]'
        } ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex-1 flex flex-col bg-[#0c111b] border-l border-white/10 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 1l1.5 3.5L13 6l-2.5 2.5L11 12l-3-1.5L5 12l.5-3.5L3 6l3.5-1.5L8 1z"
                    fill="white"
                    fillOpacity="0.9"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Compliance Intelligence</h2>
                <p className="text-[10px] text-gray-500">CIA Agent</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsFullscreen(v => !v)}
                title={isFullscreen ? 'Collapse to side panel' : 'Expand to fullscreen'}
                aria-label={isFullscreen ? 'Collapse chat' : 'Expand chat'}
                className="w-7 h-7 rounded-md hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              >
                {isFullscreen ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 5h-4v-4M5 9h4v4M9 5l4-4M5 9l-4 4" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 1h4v4M5 13H1V9M13 1L9 5M1 13l4-4" />
                  </svg>
                )}
              </button>
              <button
                onClick={onClose}
                aria-label="Close chat"
                className="w-7 h-7 rounded-md hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 3l8 8M11 3l-8 8" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body: sidebar + main */}
          <div className="flex-1 flex min-h-0">
            <CIASidebar
              conversations={history.conversations}
              activeId={history.activeConversationId}
              onSelect={handleSelectConversation}
              onNew={handleNewChat}
              onDelete={history.deleteConversation}
            />

            {/* Main chat area */}
            <div className="flex-1 flex flex-col min-h-0">
              {isEmpty && !chat.isStreaming ? (
                /* Empty state */
                <div className="flex-1 flex flex-col items-center justify-center px-6">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-600/20 border border-blue-500/20 flex items-center justify-center mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 2l2.5 5.5L20 9.5l-4 4L17 19l-5-2.5L7 19l1-5.5-4-4 5.5-2L12 2z"
                        stroke="#60a5fa"
                        strokeWidth="1.5"
                        fill="none"
                      />
                    </svg>
                  </div>
                  <h3 className="text-base font-medium text-white mb-1">Ask CIA anything</h3>
                  <p className="text-xs text-gray-500 text-center mb-6 max-w-[260px]">
                    Your compliance intelligence agent. Ask about filings, deadlines, penalties, or any uploaded document.
                  </p>
                </div>
              ) : (
                <CIAMessageList
                  messages={currentMessages}
                  streamingContent={streamingContent}
                  steps={chat.steps}
                  toolActivities={chat.toolActivities}
                  isStreaming={chat.isStreaming}
                />
              )}

              {/* Input */}
              <div className="px-4 pb-4 pt-2">
                <CIAInput
                  onSend={handleSend}
                  onStop={chat.abort}
                  onAttach={() => setUploadOpen(true)}
                  isStreaming={chat.isStreaming}
                  suggestedQuestions={suggestedQuestions}
                  showSuggestions={isEmpty && !chat.isStreaming}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {uploadOpen && (
        <AgentAssistedUploadModal
          isOpen={uploadOpen}
          companyId={companyId}
          onClose={() => setUploadOpen(false)}
          onFinalized={() => {
            setUploadOpen(false)
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('cia:data-changed'))
            }
          }}
        />
      )}
    </>
  )
}
