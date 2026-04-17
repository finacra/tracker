'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface SourceDoc {
  name: string
  folder: string
  type?: string
  date?: string
}

interface Props {
  companyId: string
  documentCount: number
  onDeepDive: () => void
  recentDocuments?: SourceDoc[]
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g
  let lastIdx = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index))
    if (match[2]) parts.push(<strong key={match.index} className="font-semibold" style={{ color: '#e8eaed' }}>{match[2]}</strong>)
    else if (match[3]) parts.push(<code key={match.index} className="px-1 rounded text-[12px] font-mono" style={{ background: 'rgba(255,255,255,0.08)', color: '#93c5fd' }}>{match[3]}</code>)
    lastIdx = match.index + match[0].length
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))
  return parts
}

function renderBody(text: string) {
  const lines = text.split('\n')
  const els: React.ReactNode[] = []
  let bullets: string[] = []

  const flush = () => {
    if (!bullets.length) return
    els.push(
      <ul key={`ul-${els.length}`} style={{ margin: '6px 0', padding: 0, listStyle: 'none' }}>
        {bullets.map((b, i) => (
          <li key={i} style={{ display: 'flex', gap: '10px', margin: '4px 0', color: '#bdc1c6', fontSize: '14px', lineHeight: '1.6' }}>
            <span style={{ marginTop: '9px', flexShrink: 0, width: '5px', height: '5px', borderRadius: '50%', background: '#9aa0a6', display: 'inline-block' }} />
            <span>{renderInlineMarkdown(b)}</span>
          </li>
        ))}
      </ul>
    )
    bullets = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.match(/^[-*•]\s/)) {
      bullets.push(line.replace(/^[-*•]\s+/, ''))
    } else if (line.trim() === '') {
      flush()
      if (els.length) els.push(<div key={`sp-${i}`} style={{ height: '8px' }} />)
    } else {
      flush()
      els.push(<p key={i} style={{ margin: '4px 0', color: '#bdc1c6', fontSize: '14px', lineHeight: '1.6' }}>{renderInlineMarkdown(line)}</p>)
    }
  }
  flush()
  return els
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
}

function getPreview(text: string): string {
  const lines = text.split('\n').filter(l => l.trim() && !l.match(/^[-*•]\s/))
  const preview = lines.slice(0, 2).join(' ')
  const clean = stripMarkdown(preview)
  if (clean.length > 280) return clean.slice(0, 280).replace(/\s+\S*$/, '') + '...'
  if (lines.length > 2) return clean + '...'
  return clean
}

function formatDocDate(date?: string): string {
  if (!date) return ''
  try {
    return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date))
  } catch { return '' }
}

function SourceCard({ doc }: { doc: SourceDoc }) {
  const dateStr = formatDocDate(doc.date)
  return (
    <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p style={{ fontSize: '12.5px', color: '#e8eaed', lineHeight: '1.35', fontWeight: 500, margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {doc.name}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 1h5l2.5 2.5V10a.5.5 0 01-.5.5h-7A.5.5 0 012 10V1.5a.5.5 0 01.5-.5z" stroke="#9aa0a6" strokeWidth="1" />
          <path d="M7.5 1v2.5H10" stroke="#9aa0a6" strokeWidth="1" />
        </svg>
        <span style={{ fontSize: '11px', color: '#9aa0a6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.folder}{dateStr ? ` · ${dateStr}` : ''}</span>
      </div>
    </div>
  )
}

export default function CIAOverviewSection({ companyId, documentCount, onDeepDive, recentDocuments = [] }: Props) {
  const [overviewText, setOverviewText] = useState('')
  const [loading, setLoading] = useState(true)
  const [streaming, setStreaming] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const accumulatorRef = useRef('')
  const fetchedRef = useRef<string | null>(null)

  const generateOverview = useCallback(async () => {
    if (!companyId) return
    // Bump the cache version whenever the overview prompt or folder
    // taxonomy changes so stale summaries (with wrong category names)
    // don't persist for 5 minutes after a deploy.
    const cacheKey = `cia-overview-v2-${companyId}`
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const { text, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < 5 * 60 * 1000) {
          setOverviewText(text); setLoading(false); fetchedRef.current = companyId; return
        }
      }
    } catch {}
    setLoading(true); setStreaming(true); accumulatorRef.current = ''; setOverviewText('')
    try {
      const res = await fetch('/api/cia/overview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId }) })
      if (!res.ok) { setOverviewText('Unable to generate overview.'); setLoading(false); setStreaming(false); return }
      const reader = res.body?.getReader()
      if (!reader) return
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulatorRef.current += decoder.decode(value, { stream: true })
        setOverviewText(accumulatorRef.current)
      }
      try { localStorage.setItem(cacheKey, JSON.stringify({ text: accumulatorRef.current, timestamp: Date.now() })) } catch {}
      fetchedRef.current = companyId
    } catch { setOverviewText('Failed to generate overview. Please try again.') }
    finally { setLoading(false); setStreaming(false) }
  }, [companyId])

  useEffect(() => {
    if (companyId && fetchedRef.current !== companyId) generateOverview()
  }, [companyId, generateOverview])

  const isReady = !loading || overviewText.length > 0
  const sourceDocs = recentDocuments.slice(0, 2)

  return (
    <div style={{ padding: '16px 0 4px' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 2l1.8 4.5L16.5 8l-3.2 3.2.8 4.8L10 14l-4.1 2 .8-4.8L3.5 8l4.7-1.5L10 2z" fill="url(#hdr-grad)" />
          <defs>
            <linearGradient id="hdr-grad" x1="3" y1="2" x2="17" y2="18" gradientUnits="userSpaceOnUse">
              <stop stopColor="#4285f4" />
              <stop offset="0.5" stopColor="#1a73e8" />
              <stop offset="1" stopColor="#8ab4f8" />
            </linearGradient>
          </defs>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 600, color: '#e8eaed', letterSpacing: '-0.2px' }}>AI Overview</span>
      </div>

      {/* ── Loading skeleton ── */}
      {loading && !overviewText && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '12px' }}>
          {[100, 90, 80, 72].map((w, i) => (
            <div key={i} className="animate-pulse" style={{ height: '14px', width: `${w}%`, borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} />
          ))}
        </div>
      )}

      {/* ── Two-column content ── */}
      {isReady && (
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
          {/* Left: text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {!expanded ? (
              <div style={{ color: '#bdc1c6', fontSize: '14px', lineHeight: '1.6' }}>
                {getPreview(overviewText)}
                {streaming && <span className="animate-pulse" style={{ display: 'inline-block', width: '6px', height: '14px', borderRadius: '2px', background: '#4285f4', marginLeft: '3px', verticalAlign: 'middle' }} />}
              </div>
            ) : (
              <div style={{ animation: 'ovExpand 0.2s ease-out' }}>
                {renderBody(overviewText)}
                {streaming && <span className="animate-pulse" style={{ display: 'inline-block', width: '6px', height: '14px', borderRadius: '2px', background: '#4285f4', marginLeft: '3px', verticalAlign: 'middle' }} />}
              </div>
            )}

            {/* Dive deeper — shown in expanded */}
            {expanded && !streaming && (
              <button
                onClick={onDeepDive}
                style={{ marginTop: '14px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 16px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#bdc1c6', fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = '#e8eaed' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#bdc1c6' }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1l1.5 3.5L13 6l-2.5 2.5L11 12l-3-1.5L5 12l.5-3.5L3 6l3.5-1.5L8 1z" fill="#8ab4f8" />
                </svg>
                Dive deeper in AI Mode
              </button>
            )}
          </div>

          {/* Right: source cards — desktop only */}
          {sourceDocs.length > 0 && (
            <div className="hidden md:flex" style={{ flexShrink: 0, width: '230px', flexDirection: 'column', gap: '8px' }}>
              {sourceDocs.map((doc, i) => <SourceCard key={i} doc={doc} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Show more / Show less — Google-style outlined button ── */}
      {isReady && !streaming && (
        <div style={{ marginTop: '16px' }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#bdc1c6', fontSize: '14px', cursor: 'pointer', transition: 'background 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            {expanded ? 'Show less' : 'Show more'}
            <svg
              width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
              style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
        </div>
      )}

      <style jsx>{`
        @keyframes ovExpand {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
