'use client'

import { useState, useRef, useEffect } from 'react'

interface Props {
  onSend: (message: string) => void
  onStop: () => void
  isStreaming: boolean
  disabled?: boolean
  suggestedQuestions?: string[]
  showSuggestions?: boolean
}

export default function CIAInput({ onSend, onStop, isStreaming, disabled, suggestedQuestions, showSuggestions }: Props) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
    }
  }, [value])

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || isStreaming || disabled) return
    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Suggested questions */}
      {showSuggestions && suggestedQuestions && suggestedQuestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1">
          {suggestedQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => onSend(q)}
              disabled={isStreaming || disabled}
              className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20 transition-all duration-200 disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="relative flex items-end gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 focus-within:border-blue-500/40 transition-colors">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your compliance..."
          disabled={isStreaming || disabled}
          rows={1}
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 resize-none outline-none max-h-[120px] leading-relaxed disabled:opacity-50"
        />

        {isStreaming ? (
          <button
            onClick={onStop}
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center transition-colors"
            title="Stop generating"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="3" y="3" width="8" height="8" rx="1" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || disabled}
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-600 text-white hover:bg-blue-500 flex items-center justify-center transition-colors disabled:opacity-30 disabled:hover:bg-blue-600"
            title="Send message"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L6 8" />
              <path d="M12 2L8 12L6 8L2 6L12 2Z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
