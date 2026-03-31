'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  loadCIAHistory,
  createCIAConversation,
  addCIAMessage,
  updateCIAMessage,
  renameCIAConversation,
  deleteCIAConversation,
  type DBConversation,
  type DBMessage,
} from '@/app/data-room/actions-cia'

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

export function useCIAHistory(companyId: string, userId?: string) {
  const [conversations, setConversations] = useState<CIAConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load from DB on mount / company change
  useEffect(() => {
    if (!companyId || !userId) return
    let cancelled = false
    setIsLoading(true)
    loadCIAHistory(companyId, userId).then((loaded) => {
      if (cancelled) return
      setConversations(loaded)
      setActiveConversationId(null)
      setIsLoading(false)
    }).catch(() => {
      if (!cancelled) setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [companyId, userId])

  const activeConversation = conversations.find(c => c.id === activeConversationId) || null

  const createConversation = useCallback(async (): Promise<string> => {
    if (!userId) return ''
    const id = await createCIAConversation(companyId, userId)
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
  }, [companyId, userId])

  const addMessage = useCallback(async (
    conversationId: string,
    message: Omit<CIAMessage, 'id' | 'timestamp'>
  ): Promise<string> => {
    // Optimistic local update with temp ID
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const newMsg: CIAMessage = { ...message, id: tempId, timestamp: Date.now() }
    setConversations(prev =>
      prev.map(c =>
        c.id === conversationId
          ? { ...c, messages: [...c.messages, newMsg], updatedAt: Date.now() }
          : c
      )
    )
    // Persist to DB
    const dbId = await addCIAMessage(conversationId, message.role, message.content, message.sources)
    // Replace temp ID with real DB ID
    setConversations(prev =>
      prev.map(c =>
        c.id === conversationId
          ? { ...c, messages: c.messages.map(m => m.id === tempId ? { ...m, id: dbId } : m) }
          : c
      )
    )
    return dbId
  }, [])

  const updateLastAssistantMessage = useCallback(async (
    conversationId: string,
    content: string,
    sources?: { name: string; similarity: number }[]
  ) => {
    // Find message ID before state update
    const conv = conversations.find(c => c.id === conversationId)
    let msgId: string | undefined
    if (conv) {
      for (let i = conv.messages.length - 1; i >= 0; i--) {
        if (conv.messages[i].role === 'assistant') { msgId = conv.messages[i].id; break }
      }
    }
    setConversations(prev =>
      prev.map(c => {
        if (c.id !== conversationId) return c
        const msgs = [...c.messages]
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant') {
            msgs[i] = { ...msgs[i], content, ...(sources ? { sources } : {}) }
            break
          }
        }
        return { ...c, messages: msgs, updatedAt: Date.now() }
      })
    )
    // Persist to DB
    if (msgId && !msgId.startsWith('temp-')) {
      await updateCIAMessage(msgId, content, sources).catch(() => {})
    }
  }, [])

  const renameConversation = useCallback(async (conversationId: string, name: string) => {
    setConversations(prev =>
      prev.map(c => (c.id === conversationId ? { ...c, name } : c))
    )
    await renameCIAConversation(conversationId, name).catch(() => {})
  }, [])

  const deleteConversation = useCallback(async (conversationId: string) => {
    setConversations(prev => prev.filter(c => c.id !== conversationId))
    if (activeConversationId === conversationId) {
      setActiveConversationId(null)
    }
    await deleteCIAConversation(conversationId).catch(() => {})
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
    isLoading,
  }
}
