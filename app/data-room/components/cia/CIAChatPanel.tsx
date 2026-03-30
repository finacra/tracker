'use client'

import { useCallback, useRef, useState } from 'react'
import CIASidebar from './CIASidebar'
import CIAMessageList from './CIAMessageList'
import CIAInput from './CIAInput'
import { useCIAHistory, type CIAMessage } from './useCIAHistory'
import { useCIAChat, type Source } from './useCIAChat'

interface Props {
  companyId: string
  isOpen: boolean
  onClose: () => void
  suggestedQuestions: string[]
}

export default function CIAChatPanel({ companyId, isOpen, onClose, suggestedQuestions }: Props) {
  const history = useCIAHistory(companyId)
  const [streamingContent, setStreamingContent] = useState('')
  const [pendingSources, setPendingSources] = useState<Source[]>([])
  const contentAccumulator = useRef('')

  const ensureConversation = useCallback((): string => {
    if (history.activeConversationId) return history.activeConversationId
    return history.createConversation()
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
    onDone: useCallback(() => {
      const convId = history.activeConversationId
      if (convId && contentAccumulator.current) {
        history.updateLastAssistantMessage(convId, contentAccumulator.current, pendingSources)
      }
      contentAccumulator.current = ''
      setStreamingContent('')
      setPendingSources([])
    }, [history, pendingSources]),
    onTitle: useCallback((title: string) => {
      if (history.activeConversationId) {
        history.renameConversation(history.activeConversationId, title)
      }
    }, [history]),
    onError: useCallback((message: string) => {
      const convId = history.activeConversationId
      if (convId) {
        history.updateLastAssistantMessage(convId, `⚠ ${message}`)
      }
      contentAccumulator.current = ''
      setStreamingContent('')
    }, [history]),
  })

  const handleSend = useCallback(
    (text: string) => {
      const convId = ensureConversation()

      // Add user message
      history.addMessage(convId, { role: 'user', content: text })

      // Add placeholder assistant message
      history.addMessage(convId, { role: 'assistant', content: '' })

      // Build messages array for the API
      const conv = history.conversations.find(c => c.id === convId)
      const apiMessages = [
        ...(conv?.messages || []).filter(m => m.content).map(m => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: text },
      ]

      contentAccumulator.current = ''
      setStreamingContent('')
      setPendingSources([])
      chat.sendMessage(apiMessages)
    },
    [ensureConversation, history, chat]
  )

  const handleNewChat = useCallback(() => {
    history.createConversation()
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
        className={`fixed inset-y-0 right-0 w-full sm:w-[520px] z-50 flex transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
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
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 3l8 8M11 3l-8 8" />
              </svg>
            </button>
          </div>

          {/* Body: sidebar + main */}
          <div className="flex-1 flex min-h-0">
            <CIASidebar
              conversations={history.conversations}
              activeId={history.activeConversationId}
              onSelect={history.setActiveConversationId}
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
                  isStreaming={chat.isStreaming}
                />
              )}

              {/* Input */}
              <div className="px-4 pb-4 pt-2">
                <CIAInput
                  onSend={handleSend}
                  onStop={chat.abort}
                  isStreaming={chat.isStreaming}
                  suggestedQuestions={suggestedQuestions}
                  showSuggestions={isEmpty && !chat.isStreaming}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
