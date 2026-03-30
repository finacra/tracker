'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import CIAMessageList from './CIAMessageList'
import { useCIAHistory, type CIAConversation } from './useCIAHistory'
import { useCIAChat, type Source } from './useCIAChat'

interface Props {
  companyId: string
  companyName: string
  isOpen: boolean
  onClose: () => void
  suggestedQuestions: string[]
  initialQuestion?: string
}

function useTypewriter(text: string, speed = 35) {
  const [displayed, setDisplayed] = useState(text)
  const prev = useRef(text)
  useEffect(() => {
    if (prev.current === 'New Chat' && text !== 'New Chat') {
      setDisplayed(''); let i = 0
      const iv = setInterval(() => { i++; setDisplayed(text.slice(0, i)); if (i >= text.length) clearInterval(iv) }, speed)
      prev.current = text; return () => clearInterval(iv)
    }
    prev.current = text; setDisplayed(text)
  }, [text, speed])
  return displayed
}

function SidebarConvItem({ conv, active, onSelect, onDelete }: { conv: CIAConversation; active: boolean; onSelect: () => void; onDelete: () => void }) {
  const name = useTypewriter(conv.name)
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ width: '100%', textAlign: 'left', padding: '5px 10px', borderRadius: '6px', fontSize: '13px', color: active ? '#e8e8e8' : '#888', background: active ? 'rgba(255,255,255,0.08)' : hover ? 'rgba(255,255,255,0.04)' : 'transparent', border: 'none', cursor: 'pointer', transition: 'all 0.1s', position: 'relative', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', display: 'block' }}
    >
      <span style={{ display: 'block', paddingRight: hover ? '18px' : '0', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      {hover && (
        <span onClick={e => { e.stopPropagation(); onDelete() }} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: '#555', cursor: 'pointer', display: 'flex' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#555' }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 3l6 6M9 3l-6 6" /></svg>
        </span>
      )}
    </button>
  )
}

/* Sidebar nav item */
function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '13.5px', fontWeight: active ? 500 : 400, color: active ? '#e8e8e8' : hover ? '#c8c8c8' : '#888', background: active ? 'rgba(255,255,255,0.09)' : hover ? 'rgba(255,255,255,0.05)' : 'transparent', transition: 'all 0.1s' }}
    >
      {icon}
      {label}
    </button>
  )
}

const MODELS = [
  { id: 'gpt-4o', label: 'GPT-4o', description: 'Most capable' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', description: 'Fast & efficient' },
]

/* Input box — shared between empty and chat state */
function CIAInput({ value, onChange, onSubmit, onAbort, isStreaming, placeholder, showDocs, docCount }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; onAbort: () => void;
  isStreaming: boolean; placeholder: string; showDocs?: boolean; docCount?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [selectedModel, setSelectedModel] = useState(MODELS[0])
  const [isListening, setIsListening] = useState(false)
  const [micSupported, setMicSupported] = useState(true)
  const [micError, setMicError] = useState('')
  const recognitionRef = useRef<any>(null)
  const plusRef = useRef<HTMLDivElement>(null)
  const modelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current; if (!el) return
    el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [value])

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setMicSupported(!!SR && !!navigator.mediaDevices)
  }, [])

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) setShowPlusMenu(false)
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setShowModelMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggleMic = () => {
    setMicError('')
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { setMicError('Not supported in this browser'); return }

    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-IN'
    rec.onstart = () => { setIsListening(true); setMicError('') }
    rec.onend = () => setIsListening(false)
    rec.onerror = (e: any) => {
      setIsListening(false)
      if (e.error === 'not-allowed') setMicError('Microphone access denied. Click the lock icon in your browser address bar to allow.')
      else if (e.error === 'no-speech') setMicError('No speech detected. Try again.')
      else if (e.error === 'audio-capture') setMicError('No microphone found.')
    }
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join('')
      onChange(transcript)
    }
    recognitionRef.current = rec
    try { rec.start() } catch { setMicError('Could not start microphone') }
  }

  const hasValue = !!value.trim()

  const plusOptions = [
    { icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M10 2v3h3"/><path d="M5 9h6M5 12h4"/></svg>, label: 'Reference documents', sub: 'Search your vault' },
    { icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 8h6M8 5v6"/></svg>, label: 'New conversation', sub: 'Start fresh' },
    { icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/></svg>, label: 'View history', sub: 'Past conversations' },
  ]

  return (
    <div style={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)', overflow: 'visible', position: 'relative' }}>
      {/* Textarea */}
      <div style={{ padding: '14px 16px 10px' }}>
        <textarea
          ref={ref}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit() } }}
          placeholder={placeholder}
          disabled={isStreaming}
          rows={1}
          className="cia-input"
          style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#e8e8e8', fontSize: '15px', resize: 'none', lineHeight: '1.55', maxHeight: '180px', display: 'block' }}
        />
      </div>

      {/* Toolbar */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Left: + button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div ref={plusRef} style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowPlusMenu(p => !p); setShowModelMenu(false) }}
              style={{ width: '28px', height: '28px', borderRadius: '6px', border: `1px solid ${showPlusMenu ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)'}`, background: showPlusMenu ? 'rgba(255,255,255,0.08)' : 'transparent', color: showPlusMenu ? '#e8e8e8' : '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M7 2v10M2 7h10"/></svg>
            </button>
            {showPlusMenu && (
              <div style={{ position: 'absolute', bottom: '36px', left: 0, zIndex: 100, background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '4px', minWidth: '200px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                {plusOptions.map((opt, i) => (
                  <button key={i} onClick={() => setShowPlusMenu(false)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '7px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <span style={{ color: '#888', flexShrink: 0 }}>{opt.icon}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: '13px', color: '#e8e8e8' }}>{opt.label}</p>
                      <p style={{ margin: 0, fontSize: '11px', color: '#555' }}>{opt.sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Model, Mic, Send */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Model selector */}
          <div ref={modelRef} style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowModelMenu(p => !p); setShowPlusMenu(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: showModelMenu ? 'rgba(255,255,255,0.08)' : 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: showModelMenu ? '#c8c8c8' : '#666', fontSize: '12.5px', transition: 'all 0.12s' }}
            >
              {selectedModel.label}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3 4l2 2 2-2"/></svg>
            </button>
            {showModelMenu && (
              <div style={{ position: 'absolute', bottom: '36px', right: 0, zIndex: 100, background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '4px', minWidth: '180px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                {MODELS.map(m => (
                  <button key={m.id} onClick={() => { setSelectedModel(m); setShowModelMenu(false) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '7px', border: 'none', background: 'transparent', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <div style={{ textAlign: 'left' }}>
                      <p style={{ margin: 0, fontSize: '13px', color: '#e8e8e8' }}>{m.label}</p>
                      <p style={{ margin: 0, fontSize: '11px', color: '#555' }}>{m.description}</p>
                    </div>
                    {selectedModel.id === m.id && (
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#20a0d8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 7l3.5 3.5 5.5-6"/></svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mic button */}
          <button
            onClick={micSupported ? toggleMic : undefined}
            title={!micSupported ? 'Voice input not supported in this browser' : micError || (isListening ? 'Stop listening' : 'Voice input')}
            style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isListening ? 'rgba(239,68,68,0.15)' : micError ? 'rgba(239,68,68,0.08)' : 'transparent', border: 'none', borderRadius: '6px', cursor: micSupported ? 'pointer' : 'not-allowed', color: isListening ? '#ef4444' : micError ? '#ef4444' : micSupported ? '#666' : '#333', opacity: micSupported ? 1 : 0.35, transition: 'all 0.12s' }}
          >
            {isListening ? (
              /* Animated mic when active */
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#ef4444" stroke="none">
                <rect x="9" y="2" width="6" height="12" rx="3"/>
                <path d="M5 10a7 7 0 0014 0" stroke="#ef4444" strokeWidth="2" fill="none" strokeLinecap="round"/>
                <line x1="12" y1="19" x2="12" y2="23" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
                <line x1="8" y1="23" x2="16" y2="23" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <rect x="9" y="2" width="6" height="12" rx="3"/>
                <path d="M5 10a7 7 0 0014 0M12 19v4M8 23h8"/>
              </svg>
            )}
          </button>

          {/* Send / Stop */}
          {isStreaming ? (
            <button onClick={onAbort} style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e8e8e8' }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="8" height="8" rx="1.5"/></svg>
            </button>
          ) : (
            <button onClick={onSubmit} disabled={!hasValue}
              style={{ width: '32px', height: '32px', borderRadius: '50%', background: hasValue ? '#20a0d8' : 'rgba(255,255,255,0.07)', border: 'none', cursor: hasValue ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
              onMouseEnter={e => { if (hasValue) (e.currentTarget as HTMLElement).style.background = '#38b2e8' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = hasValue ? '#20a0d8' : 'rgba(255,255,255,0.07)' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={hasValue ? '#fff' : '#555'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 11V3M3 7l4-4 4 4"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      {/* Mic error */}
      {micError && (
        <div style={{ padding: '6px 14px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="5.5"/><path d="M7 4.5v3M7 9.5v.5"/></svg>
          <span style={{ fontSize: '12px', color: '#ef4444' }}>{micError}</span>
          <button onClick={() => setMicError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#555', display: 'flex', padding: '1px' }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l6 6M8 2l-6 6"/></svg>
          </button>
        </div>
      )}
    </div>
  )
}

type Section = 'search' | 'history' | 'discover'

export default function CIAFullscreen({ companyId, companyName, isOpen, onClose, suggestedQuestions, initialQuestion }: Props) {
  const history = useCIAHistory(companyId)
  const [streamingContent, setStreamingContent] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [completedSteps, setCompletedSteps] = useState(0)
  const [inputValue, setInputValue] = useState('')
  const [activeSection, setActiveSection] = useState<Section>('search')
  const [activeTab, setActiveTab] = useState<'answer' | 'sources'>('answer')
  const [showDotsMenu, setShowDotsMenu] = useState(false)
  const dotsMenuRef = useRef<HTMLDivElement>(null)
  const [showStepsDropdown, setShowStepsDropdown] = useState(false)
  const stepsMenuRef = useRef<HTMLDivElement>(null)
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const voiceModeRef = useRef(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle')
  const voiceRecRef = useRef<any>(null)
  const contentAccumulator = useRef('')
  const sentInitialRef = useRef(false)
  const activeConvIdRef = useRef<string | null>(null)
  const pendingSourcesRef = useRef<Source[]>([])
  const historyRef = useRef(history)
  historyRef.current = history

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    setSpeakingMsgId(null)
  }, [])

  const startVoiceListen = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    voiceRecRef.current?.abort()
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = 'en-IN'
    rec.onstart = () => setVoiceState('listening')
    rec.onerror = () => { setVoiceState('idle') }
    rec.onend = () => { if (voiceModeRef.current && voiceState !== 'processing') setVoiceState('idle') }
    rec.onresult = (e: any) => {
      const transcript: string = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join('').trim()
      if (transcript) {
        setVoiceState('processing')
        // submit via the handleSend path — set input and trigger
        handleSendRef.current(transcript)
      }
    }
    voiceRecRef.current = rec
    try { rec.start() } catch { setVoiceState('idle') }
  }, [voiceState])

  const stopVoiceMode = useCallback(() => {
    voiceModeRef.current = false
    setVoiceMode(false)
    setVoiceState('idle')
    voiceRecRef.current?.abort()
    voiceRecRef.current = null
    audioRef.current?.pause(); audioRef.current = null
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    setSpeakingMsgId(null)
  }, [])

  const handleSendRef = useRef<(text: string) => void>(() => {})

  const speakText = useCallback(async (text: string, msgId = 'auto') => {
    if (typeof window === 'undefined') return

    // ── Comprehensive text cleaning ──────────────────────────────────────────
    const clean = text
      // Code blocks first (before other replacements)
      .replace(/```[\s\S]*?```/gm, '')
      .replace(/`[^`\n]+`/g, '')
      // Horizontal rules / decorative lines  ----  ====  ****  ~~~~
      .replace(/^[-*=~_]{2,}\s*$/gm, '')
      // Headings — keep text, drop the # markers
      .replace(/^#{1,6}\s+(.+)$/gm, '$1')
      // Bold / italic — extract inner text
      .replace(/\*{3}([\s\S]+?)\*{3}/g, '$1')
      .replace(/\*{2}([\s\S]+?)\*{2}/g, '$1')
      .replace(/\*([\s\S]+?)\*/g, '$1')
      .replace(/_{2}([\s\S]+?)_{2}/g, '$1')
      .replace(/_([\s\S]+?)_/g, '$1')
      // Links / images
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Tables — strip pipes, keep cell text
      .replace(/^\|[-:| ]+\|$/gm, '')
      .replace(/\|/g, ' ')
      // Blockquotes
      .replace(/^>\s*/gm, '')
      // List markers
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^[\s]*\d+[.)]\s+/gm, '')
      // Any remaining lone markdown chars
      .replace(/[*#_~`\\]/g, '')
      // Emojis (broad unicode ranges)
      .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|\u200B|\uFEFF/gu, '')
      // Symbols → spoken words
      .replace(/₹\s*/g, 'rupees ')
      .replace(/\$\s*/g, 'dollars ')
      .replace(/€\s*/g, 'euros ')
      .replace(/%/g, ' percent')
      .replace(/&amp;|&/g, ' and ')
      .replace(/→|=>/g, ' to ')
      // Natural sentence flow from newlines
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      // Clean stray punctuation
      .replace(/\s+([.,;:])/g, '$1')
      .replace(/\.{2,}/g, '.')
      .replace(/\s{2,}/g, ' ')
      .trim()

    if (!clean) return

    // Stop whatever is currently playing
    audioRef.current?.pause()
    window.speechSynthesis?.cancel()
    setSpeakingMsgId(msgId)
    if (voiceModeRef.current) setVoiceState('speaking')

    const onDone = () => {
      setSpeakingMsgId(null)
      if (voiceModeRef.current) { setVoiceState('listening'); startVoiceListen() }
    }
    const onFail = () => {
      setSpeakingMsgId(null)
      if (voiceModeRef.current) setVoiceState('idle')
    }

    // ── Try Azure TTS via server route ──────────────────────────────────────
    try {
      const res = await fetch('/api/cia/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean }),
      })
      if (res.ok && res.body) {
        // ── Streaming playback via MediaSource — audio starts before full response arrives ──
        const mime = 'audio/mpeg'
        const canStream = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(mime)
        if (canStream) {
          const ms = new MediaSource()
          const audioUrl = URL.createObjectURL(ms)
          const audio = new Audio(audioUrl)
          audioRef.current = audio
          let cleaned = false
          const cleanup = (ok: boolean) => {
            if (cleaned) return; cleaned = true
            URL.revokeObjectURL(audioUrl)
            if (ok) onDone(); else onFail()
          }
          audio.onended = () => cleanup(true)
          audio.onerror = (e) => { console.error('[CIA TTS] Audio error', e); cleanup(false) }
          // Call play() now to capture the user-gesture context before any async gap
          audio.play().catch(() => {})
          ms.addEventListener('sourceopen', async () => {
            let sb: SourceBuffer
            try { sb = ms.addSourceBuffer(mime) } catch (e) {
              console.error('[CIA TTS] addSourceBuffer failed', e); cleanup(false); return
            }
            const reader = res.body!.getReader()
            const append = (chunk: Uint8Array) => new Promise<void>((resolve, reject) => {
              const onEnd = () => resolve()
              const onErr = (e: Event) => reject(e)
              sb.addEventListener('updateend', onEnd, { once: true })
              sb.addEventListener('error', onErr, { once: true })
              try { sb.appendBuffer(chunk as unknown as ArrayBuffer) } catch (e) {
                sb.removeEventListener('updateend', onEnd)
                sb.removeEventListener('error', onErr)
                reject(e)
              }
            })
            try {
              for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                await append(value)
                // Resume play once we have buffered data (handles initial play() rejection)
                if (audio.readyState >= 2 && audio.paused) audio.play().catch(() => {})
              }
              if (ms.readyState === 'open') ms.endOfStream()
            } catch (e) { console.error('[CIA TTS] Stream pump error', e); cleanup(false) }
          })
          return
        }
        // Fallback: buffer entire response (non-MediaSource browsers)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => { URL.revokeObjectURL(url); onDone() }
        audio.onerror = (e) => { console.error('[CIA TTS] Audio playback error', e); URL.revokeObjectURL(url); onFail() }
        await audio.play()
        return
      } else {
        const errText = await res.text()
        console.error('[CIA TTS] API route failed:', res.status, errText)
      }
    } catch (e) {
      console.error('[CIA TTS] Fetch error:', e)
    }

    // ── Browser TTS fallback ─────────────────────────────────────────────────
    if (!window.speechSynthesis) { onFail(); return }
    const doSpeak = () => {
      const utter = new SpeechSynthesisUtterance(clean)
      utter.rate = 1.0; utter.pitch = 1.0
      const voices = window.speechSynthesis.getVoices()
      const picks = ['Google UK English Female', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Samantha', 'Karen']
      const voice = picks.map(n => voices.find(v => v.name.includes(n))).find(Boolean)
        || voices.find(v => v.lang.startsWith('en') && !v.localService)
        || voices.find(v => v.lang.startsWith('en')) || null
      if (voice) utter.voice = voice
      utter.onend = onDone; utter.onerror = onFail
      utteranceRef.current = utter
      window.speechSynthesis.speak(utter)
    }
    window.speechSynthesis.getVoices().length === 0
      ? (window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.onvoiceschanged = null; doSpeak() })
      : doSpeak()
  }, [startVoiceListen])

  const ensureConversation = useCallback((): string => {
    if (history.activeConversationId) { activeConvIdRef.current = history.activeConversationId; return history.activeConversationId }
    const id = history.createConversation(); activeConvIdRef.current = id; return id
  }, [history])

  const chat = useCIAChat({
    companyId,
    onToken: useCallback((token: string) => { contentAccumulator.current += token; setStreamingContent(contentAccumulator.current) }, []),
    onSources: useCallback((sources: Source[]) => { pendingSourcesRef.current = sources }, []),
    onDone: useCallback(() => {
      const convId = activeConvIdRef.current
      const finalText = contentAccumulator.current
      if (convId && finalText) historyRef.current.updateLastAssistantMessage(convId, finalText, pendingSourcesRef.current)
      contentAccumulator.current = ''; pendingSourcesRef.current = []; setStreamingContent(''); setCompletedSteps(3)
      if (finalText) speakText(finalText)
    }, [speakText]),
    onTitle: useCallback((title: string) => { const convId = activeConvIdRef.current; if (convId) historyRef.current.renameConversation(convId, title) }, []),
    onError: useCallback((message: string) => {
      const convId = activeConvIdRef.current
      if (convId) historyRef.current.updateLastAssistantMessage(convId, `Error: ${message}`)
      contentAccumulator.current = ''; setStreamingContent('')
    }, []),
  })

  const handleSend = useCallback((text: string) => {
    const convId = ensureConversation()
    stopSpeaking(); voiceRecRef.current?.abort(); setSidebarOpen(false); setShowSuggestions(false); setCompletedSteps(0); setActiveSection('search'); setActiveTab('answer')
    if (voiceModeRef.current) setVoiceState('processing')
    history.addMessage(convId, { role: 'user', content: text })
    history.addMessage(convId, { role: 'assistant', content: '' })
    const conv = history.conversations.find(c => c.id === convId)
    const apiMessages = [
      ...(conv?.messages || []).filter(m => m.content).map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: text },
    ]
    contentAccumulator.current = ''; pendingSourcesRef.current = []; setStreamingContent('')
    chat.sendMessage(apiMessages)
  }, [ensureConversation, history, chat])

  handleSendRef.current = handleSend

  const submitInput = useCallback(() => {
    const trimmed = inputValue.trim(); if (!trimmed || chat.isStreaming) return
    handleSend(trimmed); setInputValue('')
  }, [inputValue, chat.isStreaming, handleSend])

  useEffect(() => {
    if (isOpen && initialQuestion && !sentInitialRef.current) {
      sentInitialRef.current = true
      const t = setTimeout(() => handleSend(initialQuestion), 100)
      return () => clearTimeout(t)
    }
    if (!isOpen) { stopVoiceMode(); sentInitialRef.current = false; setSidebarOpen(false); setCompletedSteps(0); setShowSuggestions(false) }
  }, [isOpen, initialQuestion, handleSend, stopVoiceMode])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (showDotsMenu) { setShowDotsMenu(false); return } if (sidebarOpen) setSidebarOpen(false); else onClose() } }
    if (isOpen) window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose, sidebarOpen, showDotsMenu])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dotsMenuRef.current && !dotsMenuRef.current.contains(e.target as Node)) setShowDotsMenu(false)
      if (stepsMenuRef.current && !stepsMenuRef.current.contains(e.target as Node)) setShowStepsDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const currentMessages = history.activeConversation?.messages.filter(m => m.content) || []
  const isEmpty = !history.activeConversation || currentMessages.length === 0

  if (!isOpen) return null

  const BG = '#131313'
  const SB_BG = '#1c1c1c'

  const IconSearch = <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="9" cy="9" r="6"/><path d="M15 15l-3-3"/></svg>
  const IconNew = <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M10 5v10M5 10h10"/></svg>
  const IconHistory = <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2.5"/></svg>
  const IconStar = <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M10 2l2 5h5l-4 3 1.5 5L10 12l-4.5 3L7 10 3 7h5z"/></svg>

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', background: BG, animation: 'ciaFadeIn 0.18s ease-out', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>

      {/* Mobile backdrop */}
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.55)' }} />}

      {/* ── SIDEBAR ── */}
      <div className={`cia-sb${sidebarOpen ? ' cia-sb-open' : ''}`} style={{ background: SB_BG, borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column' }}>
        {/* Nav items */}
        <div style={{ padding: '10px 8px 4px', flexShrink: 0 }}>
          <NavItem icon={IconSearch} label="Search" active={activeSection === 'search'} onClick={() => { setActiveSection('search'); setSidebarOpen(false) }} />
          <NavItem
            icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="16" height="12" rx="2"/><path d="M6 16v2M14 16v2M8 18h4"/></svg>}
            label="Documents"
            onClick={() => { setSidebarOpen(false); onClose() }}
          />
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '6px 0' }} />
          <NavItem icon={IconNew} label="New thread" onClick={() => { history.createConversation(); setActiveSection('search'); setSidebarOpen(false) }} />
          <NavItem icon={IconHistory} label="History" active={activeSection === 'history'} onClick={() => { setActiveSection('history'); setSidebarOpen(false) }} />
          <NavItem icon={IconStar} label="Discover" active={activeSection === 'discover'} onClick={() => { setActiveSection('discover'); setSidebarOpen(false) }} />
        </div>

        {/* Recent conversations */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
          {history.conversations.length > 0 && (
            <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '10px 4px 5px', margin: 0 }}>Recent</p>
          )}
          {history.conversations.length === 0
            ? <p style={{ fontSize: '12px', color: '#3a3a3a', textAlign: 'center', paddingTop: '20px' }}>No threads yet</p>
            : history.conversations.map(conv => (
              <SidebarConvItem key={conv.id} conv={conv} active={conv.id === history.activeConversationId}
                onSelect={() => { history.setActiveConversationId(conv.id); setSidebarOpen(false) }}
                onDelete={() => history.deleteConversation(conv.id)} />
            ))
          }
        </div>

        {/* Bottom: company / user */}
        <div style={{ padding: '10px 10px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'white' }}>{companyName.slice(0, 1).toUpperCase()}</span>
            </div>
            <span style={{ fontSize: '12.5px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{companyName}</span>
          </div>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', height: '46px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* Hamburger (mobile) */}
            <button onClick={() => setSidebarOpen(true)} className="cia-hamburger"
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '6px 8px 6px 0', display: 'none', alignItems: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4h12M2 8h12M2 12h12"/></svg>
            </button>
            {!isEmpty && (() => {
              const allSources = currentMessages.flatMap(m => m.role === 'assistant' ? (m.sources || []) : [])
              const uniqueSources = allSources.filter((s, i, arr) => arr.findIndex(x => x.name === s.name) === i)
              return (
                <div style={{ display: 'flex', alignItems: 'center', height: '46px' }}>
                  <button
                    onClick={() => setActiveTab('answer')}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0 2px', height: '46px', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: activeTab === 'answer' ? '2px solid #e8e8e8' : '2px solid transparent', background: 'none', color: activeTab === 'answer' ? '#e8e8e8' : '#666', fontSize: '13.5px', fontWeight: activeTab === 'answer' ? 500 : 400, cursor: 'pointer', marginRight: '16px', transition: 'all 0.15s' }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.5 3.5L13 6l-2.5 2.5L11 12l-3-1.5L5 12l.5-3.5L3 6l3.5-1.5L8 1z" fill={activeTab === 'answer' ? '#e8e8e8' : '#666'}/></svg>
                    Answer
                  </button>
                  <button
                    onClick={() => setActiveTab('sources')}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0 2px', height: '46px', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: activeTab === 'sources' ? '2px solid #e8e8e8' : '2px solid transparent', background: 'none', color: activeTab === 'sources' ? '#e8e8e8' : '#666', fontSize: '13.5px', fontWeight: activeTab === 'sources' ? 500 : 400, cursor: 'pointer', marginRight: '16px', transition: 'all 0.15s' }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2a10 10 0 010 12M8 2a10 10 0 000 12"/></svg>
                    Sources
                    {uniqueSources.length > 0 && (
                      <span style={{ fontSize: '11px', color: '#555', background: 'rgba(255,255,255,0.08)', borderRadius: '10px', padding: '1px 6px', marginLeft: '2px' }}>{uniqueSources.length}</span>
                    )}
                  </button>
                </div>
              )
            })()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!isEmpty && (
              <div ref={dotsMenuRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowDotsMenu(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', background: showDotsMenu ? 'rgba(255,255,255,0.08)' : 'transparent', border: 'none', cursor: 'pointer', color: showDotsMenu ? '#c8c8c8' : '#555', borderRadius: '6px', transition: 'all 0.1s' }}
                  onMouseEnter={e => { if (!showDotsMenu) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLElement).style.color = '#888' } }}
                  onMouseLeave={e => { if (!showDotsMenu) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#555' } }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="3" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="13" cy="8" r="1.2" fill="currentColor"/></svg>
                </button>
                {showDotsMenu && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 200, minWidth: '190px', padding: '4px' }}>
                    <button
                      onClick={() => { history.createConversation(); setActiveSection('search'); setCompletedSteps(0); setShowSuggestions(false); setShowDotsMenu(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: '9px', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#c8c8c8', fontSize: '13px', borderRadius: '5px', textAlign: 'left' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
                      New chat
                    </button>
                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                    <button
                      onClick={() => { if (history.activeConversationId) history.deleteConversation(history.activeConversationId); setShowDotsMenu(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: '9px', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#f28b82', fontSize: '13px', borderRadius: '5px', textAlign: 'left' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(242,139,130,0.08)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/></svg>
                      Delete this chat
                    </button>
                    {history.conversations.length > 1 && (
                      <button
                        onClick={() => { const ids = history.conversations.map(c => c.id); ids.forEach(id => history.deleteConversation(id)); setShowDotsMenu(false) }}
                        style={{ display: 'flex', alignItems: 'center', gap: '9px', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#f28b82', fontSize: '13px', borderRadius: '5px', textAlign: 'left' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(242,139,130,0.08)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l12 12M14 2L2 14"/></svg>
                        Clear all history
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => { if (voiceMode) { stopVoiceMode() } else { voiceModeRef.current = true; setVoiceMode(true); setVoiceState('listening'); setTimeout(startVoiceListen, 200) } }}
              title={voiceMode ? 'Exit voice mode' : 'Voice mode'}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '8px', border: `1px solid ${voiceMode ? 'rgba(138,180,248,0.3)' : 'rgba(255,255,255,0.1)'}`, background: voiceMode ? 'rgba(138,180,248,0.1)' : 'transparent', color: voiceMode ? '#8ab4f8' : '#888', fontSize: '13px', cursor: 'pointer', transition: 'all 0.1s' }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="5" y="1" width="6" height="9" rx="3"/><path d="M2 8a6 6 0 0012 0M8 14v2M5 16h6"/></svg>
              {voiceMode ? 'Exit voice' : 'Voice mode'}
            </button>
            <button onClick={onClose}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#888', fontSize: '13px', cursor: 'pointer', transition: 'all 0.1s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#e8e8e8'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#888'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)' }}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>
              Close
            </button>
          </div>
        </div>

        {/* ── HISTORY SECTION ── */}
        {activeSection === 'history' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
            <div style={{ maxWidth: '680px', margin: '0 auto' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#e8e8e8', margin: '0 0 20px' }}>History</h2>
              {history.conversations.length === 0 ? (
                <p style={{ color: '#555', fontSize: '14px' }}>No conversations yet. Start by asking a question.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {history.conversations.map(conv => (
                    <button key={conv.id}
                      onClick={() => { history.setActiveConversationId(conv.id); setActiveSection('search') }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round"><path d="M8 3v5l3 2"/><circle cx="8" cy="8" r="6"/></svg>
                        <span style={{ fontSize: '14px', color: '#c8c8c8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.name}</span>
                      </div>
                      <span style={{ fontSize: '11.5px', color: '#444', flexShrink: 0, marginLeft: '12px' }}>
                        {new Date(conv.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── DISCOVER SECTION ── */}
        {activeSection === 'discover' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
            <div style={{ maxWidth: '680px', margin: '0 auto' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#e8e8e8', margin: '0 0 6px' }}>Discover</h2>
              <p style={{ fontSize: '13.5px', color: '#555', margin: '0 0 24px' }}>Explore compliance topics and document insights.</p>
              {[
                { category: 'Compliance Status', prompts: ['What are my overdue compliances?', 'What filings are due this month?', 'What penalties am I facing?', 'Show me my compliance completion rate'] },
                { category: 'Documents', prompts: ['Summarize my uploaded documents', 'Which document categories am I missing?', 'What is in my Income Tax folder?', 'List all my GST-related documents'] },
                { category: 'Risk & Deadlines', prompts: ['What are my highest penalty risks?', 'What deadlines are coming up in 30 days?', 'Which requirements have been pending the longest?', 'What happens if I miss my upcoming deadlines?'] },
              ].map(({ category, prompts }) => (
                <div key={category} style={{ marginBottom: '24px' }}>
                  <p style={{ fontSize: '11px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px', fontWeight: 600 }}>{category}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
                    {prompts.map(q => (
                      <button key={q} onClick={() => { handleSend(q) }}
                        style={{ textAlign: 'left', padding: '11px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#888', fontSize: '13px', cursor: 'pointer', lineHeight: '1.4', transition: 'all 0.1s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = '#e8e8e8'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#888'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)' }}
                      >{q}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SEARCH/CHAT STATE ── */}
        {activeSection === 'search' && isEmpty && !chat.isStreaming ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px 40px' }}>
            {/* Brand text */}
            <h1 style={{ fontSize: 'clamp(36px,6vw,54px)', fontWeight: 350, color: '#e8e8e8', margin: '0 0 28px', letterSpacing: '-1px', lineHeight: 1 }}>
              CIA
            </h1>

            {/* Input box */}
            <div style={{ width: '100%', maxWidth: '660px' }}>
              <CIAInput
                value={inputValue} onChange={setInputValue} onSubmit={submitInput}
                onAbort={chat.abort} isStreaming={chat.isStreaming}
                placeholder="Ask anything..." showDocs docCount={undefined}
              />
            </div>

            {/* Show suggestions */}
            <div style={{ marginTop: '14px', width: '100%', maxWidth: '660px' }}>
              {!showSuggestions ? (
                <button
                  onClick={() => setShowSuggestions(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', fontSize: '13px', padding: '4px 0', display: 'block', margin: '0 auto' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#888' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#555' }}
                >
                  Show suggestions
                </button>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                  {suggestedQuestions.map((q, i) => (
                    <button key={i} onClick={() => handleSend(q)}
                      style={{ textAlign: 'left', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#888', fontSize: '13px', cursor: 'pointer', lineHeight: '1.4', transition: 'all 0.1s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLElement).style.color = '#e8e8e8' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#888' }}
                    >{q}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activeSection === 'search' ? (
          /* ── CHAT STATE ── */
          <>
            {/* Completed steps */}
            {completedSteps > 0 && !chat.isStreaming && (
              <div style={{ padding: '6px 20px 0', flexShrink: 0 }}>
                <div style={{ maxWidth: '700px', margin: '0 auto', position: 'relative', display: 'inline-block' }} ref={stepsMenuRef}>
                  <button
                    onClick={() => setShowStepsDropdown(v => !v)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', color: showStepsDropdown ? '#888' : '#555', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 7l3.5 3.5 5.5-6"/></svg>
                    Completed {completedSteps} steps
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" style={{ transform: showStepsDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><path d="M3 4l2 2 2-2"/></svg>
                  </button>
                  {showStepsDropdown && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 200, minWidth: '220px', padding: '8px 0' }}>
                      {chat.steps.map(step => (
                        <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 14px' }}>
                          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#4ade80" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="7" cy="7" r="6"/><path d="M4.5 7l2 2 3-4"/></svg>
                          <span style={{ fontSize: '12.5px', color: '#777' }}>{step.label.replace('...', '')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'answer' ? (
              <CIAMessageList messages={currentMessages} streamingContent={streamingContent} steps={chat.steps} isStreaming={chat.isStreaming} onSpeak={(text, id) => speakText(text, id)} speakingMsgId={speakingMsgId} />
            ) : (
              /* ── SOURCES VIEW ── */
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px' }} className="scrollbar-thin">
                <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                  {(() => {
                    const allSources = currentMessages.flatMap(m => m.role === 'assistant' ? (m.sources || []) : [])
                    const unique = allSources.filter((s, i, arr) => arr.findIndex(x => x.name === s.name) === i).sort((a, b) => b.similarity - a.similarity)
                    if (unique.length === 0) return (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '60px', gap: '12px' }}>
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.4" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
                        <p style={{ color: '#444', fontSize: '14px', margin: 0 }}>No document sources used yet</p>
                        <p style={{ color: '#333', fontSize: '12.5px', margin: 0, textAlign: 'center' }}>Ask a question to see which documents CIA referenced</p>
                      </div>
                    )
                    return (
                      <>
                        <p style={{ fontSize: '12px', color: '#444', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{unique.length} document{unique.length !== 1 ? 's' : ''} referenced</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {unique.map((src, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                              {/* Rank */}
                              <span style={{ fontSize: '11px', color: '#444', width: '18px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                              {/* Doc icon */}
                              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#60a5fa" strokeWidth="1.4" strokeLinecap="round"><path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M10 2v3h3"/></svg>
                              </div>
                              {/* Name */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ margin: 0, fontSize: '13.5px', color: '#e8e8e8', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.name}</p>
                              </div>
                              {/* Similarity */}
                              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{ width: '60px', height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${src.similarity}%`, background: src.similarity >= 80 ? '#22c55e' : src.similarity >= 60 ? '#f59e0b' : '#60a5fa', borderRadius: '2px' }} />
                                </div>
                                <span style={{ fontSize: '11.5px', color: '#555', width: '30px', textAlign: 'right' }}>{src.similarity}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
            )}

            {/* Speaking indicator */}
            {speakingMsgId !== null && (
              <div style={{ padding: '0 16px 6px', flexShrink: 0 }}>
                <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '10px', background: 'rgba(138,180,248,0.06)', border: '1px solid rgba(138,180,248,0.15)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Animated waveform bars */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '16px' }}>
                      {[0.6, 1, 0.7, 1, 0.5].map((h, i) => (
                        <div key={i} style={{ width: '3px', borderRadius: '2px', background: '#8ab4f8', animation: `cia-bar ${0.7 + i * 0.1}s ease-in-out infinite alternate`, height: `${h * 16}px` }} />
                      ))}
                    </div>
                    <span style={{ fontSize: '12.5px', color: '#8ab4f8' }}>Speaking…</span>
                  </div>
                  <button onClick={stopSpeaking} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(138,180,248,0.2)', background: 'transparent', color: '#8ab4f8', fontSize: '12px', cursor: 'pointer' }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1.5" y="1.5" width="3" height="7" rx="1"/><rect x="5.5" y="1.5" width="3" height="7" rx="1"/></svg>
                    Stop
                  </button>
                </div>
              </div>
            )}

            {/* Follow-up input */}
            <div style={{ padding: '10px 16px 16px', flexShrink: 0 }}>
              <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                <CIAInput
                  value={inputValue} onChange={setInputValue} onSubmit={submitInput}
                  onAbort={chat.abort} isStreaming={chat.isStreaming}
                  placeholder="Ask a follow-up"
                />
                <p style={{ fontSize: '10.5px', color: '#333', textAlign: 'center', margin: '8px 0 0' }}>
                  CIA analyses your documents and compliance data. Always verify critical information.
                </p>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Voice mode overlay */}
      {voiceMode && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,13,13,0.96)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 300, gap: '28px' }}>
          {/* Animated orb */}
          <div style={{ position: 'relative', width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: voiceState === 'listening' ? 'rgba(239,68,68,0.12)' : voiceState === 'speaking' ? 'rgba(138,180,248,0.12)' : 'rgba(255,255,255,0.05)', animation: voiceState === 'idle' ? 'none' : 'voicePulse 1.4s ease-in-out infinite', border: `1.5px solid ${voiceState === 'listening' ? 'rgba(239,68,68,0.4)' : voiceState === 'speaking' ? 'rgba(138,180,248,0.4)' : 'rgba(255,255,255,0.12)'}` }} />
            <div style={{ position: 'absolute', inset: '14px', borderRadius: '50%', background: voiceState === 'listening' ? 'rgba(239,68,68,0.08)' : voiceState === 'speaking' ? 'rgba(138,180,248,0.08)' : 'rgba(255,255,255,0.03)', animation: voiceState === 'idle' ? 'none' : 'voicePulse 1.4s ease-in-out infinite 0.2s' }} />
            {voiceState === 'listening' ? (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="#ef4444" stroke="none"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0" stroke="#ef4444" strokeWidth="1.8" fill="none" strokeLinecap="round"/><line x1="12" y1="19" x2="12" y2="23" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/></svg>
            ) : voiceState === 'speaking' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                {[0.5, 1, 0.7, 1, 0.5].map((h, i) => (
                  <div key={i} style={{ width: '4px', borderRadius: '3px', background: '#8ab4f8', animation: `cia-bar ${0.6 + i * 0.1}s ease-in-out infinite alternate`, height: `${h * 28}px` }} />
                ))}
              </div>
            ) : voiceState === 'processing' ? (
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.15)', borderTopColor: '#8ab4f8', animation: 'spin 0.8s linear infinite' }} />
            ) : (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.6" strokeLinecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v4M8 23h8"/></svg>
            )}
          </div>
          {/* State label */}
          <p style={{ margin: 0, fontSize: '15px', color: voiceState === 'listening' ? '#ef4444' : voiceState === 'speaking' ? '#8ab4f8' : voiceState === 'processing' ? '#888' : '#444', letterSpacing: '0.02em', transition: 'color 0.3s' }}>
            {voiceState === 'listening' ? 'Listening…' : voiceState === 'speaking' ? 'Speaking…' : voiceState === 'processing' ? 'Thinking…' : 'Tap mic to speak'}
          </p>
          {/* Controls */}
          <div style={{ display: 'flex', gap: '12px' }}>
            {voiceState === 'idle' && (
              <button onClick={startVoiceListen} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', borderRadius: '20px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '13px', cursor: 'pointer' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="9" y="2" width="6" height="12" rx="3"/></svg>
                Start listening
              </button>
            )}
            <button onClick={stopVoiceMode} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#666', fontSize: '13px', cursor: 'pointer' }}>
              Exit voice mode
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes ciaFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cia-bar { from { transform: scaleY(0.4); } to { transform: scaleY(1); } }
        @keyframes voicePulse { 0%,100% { transform: scale(1); opacity:0.6; } 50% { transform: scale(1.08); opacity:1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.18s ease-out; }
        .cia-input::placeholder { color: #444; }
        .cia-input::-webkit-scrollbar { width: 0; }
        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 2px; }

        .cia-sb { width: 200px; flex-shrink: 0; overflow: hidden; }
        .cia-sb-close-btn { display: none; }

        @media (max-width: 767px) {
          .cia-sb {
            position: absolute; top: 0; left: 0; bottom: 0; z-index: 200;
            width: 240px; transform: translateX(-100%); transition: transform 0.22s ease;
          }
          .cia-sb.cia-sb-open { transform: translateX(0); }
          .cia-hamburger { display: flex !important; }
        }
      `}</style>
    </div>,
    document.body
  )
}
