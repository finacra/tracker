'use client'

import { useEffect, useRef } from 'react'
import { type CIAMessage } from './useCIAHistory'
import { type ThinkingStep, type ToolActivity } from './useCIAChat'
import CIAThinkingSteps from './CIAThinkingSteps'

interface Props {
  messages: CIAMessage[]
  streamingContent: string
  steps: ThinkingStep[]
  toolActivities?: ToolActivity[]
  isStreaming: boolean
  onSpeak?: (text: string, id: string) => void
  speakingMsgId?: string | null
}

const TOOL_LABELS: Record<string, string> = {
  list_requirements: 'Looking up your requirements',
  update_requirement_status: 'Updating compliance status',
  set_requirement_fields: 'Updating compliance fields',
  record_company_fact: 'Recording business fact',
  run_evaluator: 'Re-evaluating compliance applicability',
  override_assessment: 'Overriding applicability',
}

function ToolActivityList({ activities }: { activities: ToolActivity[] }) {
  if (!activities || activities.length === 0) return null
  return (
    <div className="space-y-1.5 my-2">
      {activities.map(a => {
        const label = TOOL_LABELS[a.name] || a.name
        const color =
          a.status === 'done' ? '#4ade80' : a.status === 'failed' ? '#f87171' : '#60a5fa'
        const icon =
          a.status === 'done' ? '✓' : a.status === 'failed' ? '✕' : '·'
        return (
          <div key={a.id} className="flex items-start gap-2 text-[12px]" style={{
            padding: '6px 10px',
            background: 'rgba(96,165,250,0.05)',
            border: '1px solid rgba(96,165,250,0.12)',
            borderRadius: 6,
          }}>
            <span style={{ color, fontWeight: 600, width: 12, textAlign: 'center' }}>{icon}</span>
            <div className="flex-1 min-w-0">
              <div style={{ color: '#d0d0d0' }}>{label}</div>
              {a.summary && (
                <div style={{ color: '#8a8a8a', fontSize: 11, marginTop: 2 }}>{a.summary}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Inline markdown: **bold**, `code`, [links] ── */
function formatInline(str: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g
  let lastIdx = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(str)) !== null) {
    if (match.index > lastIdx) parts.push(str.slice(lastIdx, match.index))
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold text-fg-primary">{match[2]}</strong>)
    } else if (match[3]) {
      parts.push(<code key={match.index} className="px-1.5 py-0.5 rounded text-[12px] font-mono text-blue-300" style={{ background: 'rgba(255,255,255,0.07)' }}>{match[3]}</code>)
    } else if (match[4] && match[5]) {
      parts.push(<a key={match.index} href={match[5]} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline underline-offset-2">{match[4]}</a>)
    }
    lastIdx = match.index + match[0].length
  }
  if (lastIdx < str.length) parts.push(str.slice(lastIdx))
  return parts.length === 1 ? parts[0] : <>{parts}</>
}

/* ── Strip LaTeX to plain readable text ── */
function stripLatex(text: string): string {
  return text
    // Block math: \[ ... \] or $$ ... $$
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => stripLatexInner(inner))
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => stripLatexInner(inner))
    // Inline math: \( ... \) or $ ... $
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => stripLatexInner(inner))
    .replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_, inner) => stripLatexInner(inner))
}

function stripLatexInner(tex: string): string {
  return tex
    .replace(/\\boxed\{([^}]*)\}/g, '$1')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\textbf\{([^}]*)\}/g, '$1')
    .replace(/\\mathrm\{([^}]*)\}/g, '$1')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1/$2)')
    .replace(/\\sqrt\{([^}]*)\}/g, 'sqrt($1)')
    .replace(/\\(?:times|cdot)/g, ' x ')
    .replace(/\\(?:approx)/g, ' ≈ ')
    .replace(/\\(?:neq|ne)/g, ' ≠ ')
    .replace(/\\(?:leq|le)/g, ' ≤ ')
    .replace(/\\(?:geq|ge)/g, ' ≥ ')
    .replace(/\\(?:pm)/g, ' ± ')
    .replace(/\\(?:infty)/g, '∞')
    .replace(/\\(?:sum)/g, 'Σ')
    .replace(/\\(?:prod)/g, 'Π')
    .replace(/\\(?:pi)/g, 'π')
    .replace(/\\(?:alpha)/g, 'α')
    .replace(/\\(?:beta)/g, 'β')
    .replace(/\\(?:gamma)/g, 'γ')
    .replace(/\\(?:delta)/g, 'δ')
    .replace(/\\(?:theta)/g, 'θ')
    .replace(/\\(?:lambda)/g, 'λ')
    .replace(/\\(?:sigma)/g, 'σ')
    .replace(/\\(?:mu)/g, 'μ')
    .replace(/\\[a-zA-Z]+/g, '') // strip remaining commands
    .replace(/[{}]/g, '')
    .replace(/\^(\w)/g, '$1')
    .replace(/_(\w)/g, '$1')
    .trim()
}

/* ── Full markdown renderer ── */
function renderMarkdown(text: string) {
  const lines = stripLatex(text).split('\n')
  const elements: React.ReactNode[] = []
  let ulBuffer: string[] = []
  let olBuffer: string[] = []
  // Table state: rows + whether row[0] is a header
  let tableRows: string[][] = []
  let tableHasHeader = false

  const flushUl = () => {
    if (ulBuffer.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="space-y-1 my-2 ml-1">
          {ulBuffer.map((item, i) => (
            <li key={i} className="flex gap-2 text-fg-secondary">
              <span className="text-blue-400/60 mt-[7px] flex-shrink-0">
                <svg width="5" height="5"><circle cx="2.5" cy="2.5" r="2.5" fill="currentColor"/></svg>
              </span>
              <span className="flex-1">{formatInline(item)}</span>
            </li>
          ))}
        </ul>
      )
      ulBuffer = []
    }
  }

  const flushOl = () => {
    if (olBuffer.length > 0) {
      elements.push(
        <ol key={`ol-${elements.length}`} className="space-y-1.5 my-2 ml-1">
          {olBuffer.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-fg-secondary">
              <span className="text-blue-400/80 font-medium text-[12px] mt-[1px] flex-shrink-0 w-5 text-right">{i + 1}.</span>
              <span className="flex-1">{formatInline(item)}</span>
            </li>
          ))}
        </ol>
      )
      olBuffer = []
    }
  }

  const flushTable = () => {
    if (tableRows.length === 0) return
    const rows = tableRows
    const hasHeader = tableHasHeader
    elements.push(
      <div key={`tbl-${elements.length}`} style={{ margin: '10px 0', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
        {rows.map((cells, ri) => {
          const isHeader = hasHeader && ri === 0
          const isLast = ri === rows.length - 1
          return (
            <div key={ri} style={{
              display: 'flex',
              borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.05)',
              background: isHeader ? 'rgba(255,255,255,0.05)' : ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
            }}>
              {cells.map((cell, ci) => (
                <span key={ci} style={{
                  flex: ci === 0 ? '0 0 58%' : 1,
                  padding: isHeader ? '8px 12px 6px' : '7px 12px',
                  fontSize: '13px',
                  color: isHeader ? '#9aa0a6' : ci === 0 ? '#8ab4f8' : ci === 1 ? '#f0f0f0' : '#c8c8c8',
                  fontWeight: isHeader ? 500 : ci === 1 && !isHeader ? 600 : 400,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  letterSpacing: isHeader ? '0.02em' : undefined,
                }}>
                  {isHeader ? cell.toUpperCase() : formatInline(cell)}
                </span>
              ))}
            </div>
          )
        })}
      </div>
    )
    tableRows = []
    tableHasHeader = false
  }

  const flushAll = () => { flushUl(); flushOl(); flushTable() }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Horizontal rule
    if (line.match(/^-{3,}$/) || line.match(/^\*{3,}$/)) {
      flushAll()
      elements.push(<hr key={i} className="border-white/[0.06] my-4" />)
      continue
    }

    // Headings
    if (line.startsWith('#### ')) {
      flushAll()
      elements.push(<h5 key={i} className="text-[13px] font-semibold text-fg-secondary mt-4 mb-1.5">{formatInline(line.slice(5))}</h5>)
    } else if (line.startsWith('### ')) {
      flushAll()
      elements.push(<h4 key={i} className="text-[14px] font-semibold text-fg-primary mt-5 mb-1.5 flex items-center gap-2">{formatInline(line.slice(4))}</h4>)
    } else if (line.startsWith('## ')) {
      flushAll()
      elements.push(<h3 key={i} className="text-[15px] font-bold text-fg-primary mt-5 mb-2 pb-1.5 border-b border-white/[0.06]">{formatInline(line.slice(3))}</h3>)
    } else if (line.startsWith('# ')) {
      flushAll()
      elements.push(<h2 key={i} className="text-[16px] font-bold text-fg-primary mt-5 mb-2">{formatInline(line.slice(2))}</h2>)
    }
    // Unordered list
    else if (line.match(/^[-*•]\s/)) {
      flushOl(); flushTable()
      ulBuffer.push(line.replace(/^[-*•]\s+/, ''))
    }
    // Ordered list
    else if (line.match(/^\d+[.)]\s/)) {
      flushUl(); flushTable()
      olBuffer.push(line.replace(/^\d+[.)]\s+/, ''))
    }
    // Empty line
    else if (line.trim() === '') {
      flushAll()
      if (elements.length > 0) elements.push(<div key={`sp-${i}`} className="h-1.5" />)
    }
    // Table separator row (|---|---| marks the previous row as header)
    else if (line.trim().startsWith('|') && line.match(/^\|[\s\-:|]+\|$/)) {
      flushUl(); flushOl()
      if (tableRows.length > 0) tableHasHeader = true
    }
    // Table data row
    else if (line.trim().startsWith('|') && line.includes('|')) {
      flushUl(); flushOl()
      const cells = line.split('|').filter(c => c.trim()).map(c => c.trim())
      if (cells.length > 0) tableRows.push(cells)
    }
    // Regular paragraph
    else {
      flushAll()
      elements.push(<p key={i} className="text-fg-secondary leading-relaxed my-0.5">{formatInline(line)}</p>)
    }
  }
  flushAll()

  return elements
}

/* ── Source pills ── */
function SourcePills({ sources }: { sources: { name: string; similarity: number }[] }) {
  if (!sources || sources.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/[0.04]">
      <span className="text-[10px] text-fg-muted uppercase tracking-wider mr-1 self-center">Sources</span>
      {sources.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg text-blue-300 border border-blue-500/15" style={{ background: 'rgba(59,130,246,0.06)' }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M2 1h4l2 2v5a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1z" />
          </svg>
          {s.name.replace(/^\*+/, '').replace(/_/g, ' ')}
          <span className="opacity-50">{s.similarity}%</span>
        </span>
      ))}
    </div>
  )
}

/* ── Main component ── */
export default function CIAMessageList({ messages, streamingContent, steps, toolActivities, isStreaming, onSpeak, speakingMsgId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    userScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > 80
  }

  useEffect(() => {
    if (!userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamingContent, steps])

  useEffect(() => {
    if (!isStreaming) userScrolledUp.current = false
  }, [isStreaming])

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto scrollbar-thin" style={{ padding: '0 16px' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', paddingTop: '20px', paddingBottom: '8px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {messages.map(msg => (
        <div key={msg.id} className="animate-fadeIn">
          {msg.role === 'user' ? (
            /* User message — Perplexity style: bold question, no bubble */
            <p style={{ fontSize: '20px', fontWeight: 600, color: '#f0f0f0', lineHeight: '1.35', margin: 0 }}>
              {msg.content}
            </p>
          ) : (
            <div style={{ fontSize: '15px', lineHeight: '1.7', color: '#c8c8c8' }}>
              {renderMarkdown(msg.content)}
              <SourcePills sources={msg.sources || []} />
              {msg.content && onSpeak && (
                <div style={{ marginTop: '8px' }}>
                  <button
                    onClick={() => onSpeak(msg.content, msg.id)}
                    title={speakingMsgId === msg.id ? 'Stop' : 'Read aloud'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '6px', border: `1px solid ${speakingMsgId === msg.id ? 'rgba(138,180,248,0.3)' : 'rgba(255,255,255,0.12)'}`, background: speakingMsgId === msg.id ? 'rgba(138,180,248,0.1)' : 'transparent', color: speakingMsgId === msg.id ? '#8ab4f8' : '#888', cursor: 'pointer', fontSize: '12px', transition: 'all 0.15s' }}
                    onMouseEnter={e => { if (speakingMsgId !== msg.id) { (e.currentTarget as HTMLElement).style.color = '#bbb'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.22)' } }}
                    onMouseLeave={e => { if (speakingMsgId !== msg.id) { (e.currentTarget as HTMLElement).style.color = '#888'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)' } }}
                  >
                    {speakingMsgId === msg.id ? (
                      <><svg width="11" height="11" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="3.2" height="8" rx="1"/><rect x="5.8" y="1" width="3.2" height="8" rx="1"/></svg>Stop</>
                    ) : (
                      <><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6v4h3l4 4V2L6 6H3z"/><path d="M12 5a4 4 0 010 6"/></svg>Read aloud</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Streaming state */}
      {isStreaming && (
        <div className="animate-fadeIn">
          {steps.some(s => s.status !== 'done') && <CIAThinkingSteps steps={steps} />}
          {toolActivities && toolActivities.length > 0 && (
            <ToolActivityList activities={toolActivities} />
          )}
          {streamingContent && (
            <div style={{ fontSize: '15px', lineHeight: '1.7', color: '#c8c8c8' }}>
              {renderMarkdown(streamingContent)}
              <span className="animate-pulse" style={{ display: 'inline-block', width: '6px', height: '16px', borderRadius: '2px', background: '#555', marginLeft: '3px', verticalAlign: 'middle' }} />
            </div>
          )}
        </div>
      )}

      <div ref={bottomRef} />
      </div>
    </div>
  )
}
