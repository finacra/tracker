'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

export interface CIAMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: { name: string; similarity: number }[]
  timestamp: number
}

export interface CIAConversation {
  id: string
  name: string
  messages: CIAMessage[]
  createdAt: number
  updatedAt: number
}

interface StoredHistory {
  conversations: CIAConversation[]
}

function storageKey(companyId: string): string {
  return `cia-history-${companyId}`
}

function loadHistory(companyId: string): CIAConversation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(storageKey(companyId))
    if (!raw) return []
    const parsed: StoredHistory = JSON.parse(raw)
    return parsed.conversations || []
  } catch {
    return []
  }
}

function saveHistory(companyId: string, conversations: CIAConversation[]) {
  if (typeof window === 'undefined') return
  try {
    const data: StoredHistory = { conversations }
    localStorage.setItem(storageKey(companyId), JSON.stringify(data))
  } catch {
    // localStorage full or unavailable
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function useCIAHistory(companyId: string) {
  const [conversations, setConversations] = useState<CIAConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const initialized = useRef(false)

  // Load on mount / company change
  useEffect(() => {
    const loaded = loadHistory(companyId)
    setConversations(loaded)
    setActiveConversationId(null)
    initialized.current = true
  }, [companyId])

  // Persist whenever conversations change (after init)
  useEffect(() => {
    if (initialized.current) {
      saveHistory(companyId, conversations)
    }
  }, [conversations, companyId])

  const activeConversation = conversations.find(c => c.id === activeConversationId) || null

  const createConversation = useCallback((): string => {
    const id = generateId()
    const conv: CIAConversation = {
      id,
      name: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setConversations(prev => [conv, ...prev])
    setActiveConversationId(id)
    return id
  }, [])

  const addMessage = useCallback((conversationId: string, message: Omit<CIAMessage, 'id' | 'timestamp'>) => {
    const newMsg: CIAMessage = {
      ...message,
      id: generateId(),
      timestamp: Date.now(),
    }
    setConversations(prev =>
      prev.map(c =>
        c.id === conversationId
          ? { ...c, messages: [...c.messages, newMsg], updatedAt: Date.now() }
          : c
      )
    )
    return newMsg.id
  }, [])

  const updateLastAssistantMessage = useCallback((conversationId: string, content: string, sources?: { name: string; similarity: number }[]) => {
    setConversations(prev =>
      prev.map(c => {
        if (c.id !== conversationId) return c
        const msgs = [...c.messages]
        // Find last assistant message
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant') {
            msgs[i] = { ...msgs[i], content, ...(sources ? { sources } : {}) }
            break
          }
        }
        return { ...c, messages: msgs, updatedAt: Date.now() }
      })
    )
  }, [])

  const renameConversation = useCallback((conversationId: string, name: string) => {
    setConversations(prev =>
      prev.map(c => (c.id === conversationId ? { ...c, name } : c))
    )
  }, [])

  const deleteConversation = useCallback((conversationId: string) => {
    setConversations(prev => prev.filter(c => c.id !== conversationId))
    if (activeConversationId === conversationId) {
      setActiveConversationId(null)
    }
  }, [activeConversationId])

  return {
    conversations: conversations.sort((a, b) => b.updatedAt - a.updatedAt),
    activeConversation,
    activeConversationId,
    setActiveConversationId,
    createConversation,
    addMessage,
    updateLastAssistantMessage,
    renameConversation,
    deleteConversation,
  }
}
