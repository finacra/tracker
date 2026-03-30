'use client'

import { useState, useEffect, useRef } from 'react'
import { type CIAConversation } from './useCIAHistory'

interface Props {
  conversations: CIAConversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

/** Typewriter hook: animates name char-by-char when it changes from "New Chat" */
function useTypewriter(text: string, speed: number = 40) {
  const [displayed, setDisplayed] = useState(text)
  const prevText = useRef(text)

  useEffect(() => {
    // Only animate when transitioning from "New Chat" to a real name
    if (prevText.current === 'New Chat' && text !== 'New Chat') {
      setDisplayed('')
      let i = 0
      const interval = setInterval(() => {
        i++
        setDisplayed(text.slice(0, i))
        if (i >= text.length) clearInterval(interval)
      }, speed)
      prevText.current = text
      return () => clearInterval(interval)
    }
    prevText.current = text
    setDisplayed(text)
  }, [text, speed])

  return displayed
}

function ConversationItem({
  conv,
  isActive,
  onSelect,
  onDelete,
}: {
  conv: CIAConversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const displayName = useTypewriter(conv.name)
  const [showDelete, setShowDelete] = useState(false)

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-all duration-150 group relative ${
        isActive
          ? 'bg-white/10 text-white'
          : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
      }`}
    >
      <span className="truncate block pr-5">{displayName}</span>
      {showDelete && (
        <span
          onClick={e => {
            e.stopPropagation()
            onDelete()
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-400 transition-colors"
          title="Delete chat"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </span>
      )}
    </button>
  )
}

export default function CIASidebar({ conversations, activeId, onSelect, onNew, onDelete }: Props) {
  return (
    <div className="w-[160px] flex-shrink-0 border-r border-white/5 flex flex-col h-full">
      {/* New Chat button */}
      <div className="p-2">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M6 2v8M2 6h8" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 scrollbar-thin">
        {conversations.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-4">No conversations yet</p>
        ) : (
          conversations.map(conv => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              isActive={conv.id === activeId}
              onSelect={() => onSelect(conv.id)}
              onDelete={() => onDelete(conv.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
