'use client'

import { useEffect, useState } from 'react'
import { showToast } from '@/components/ui/Toast'
import {
  getReviewCandidatesForDocument,
  linkDocumentToRequirement,
} from '@/app/data-room/actions-ingest-jobs'

/**
 * Review-and-link modal for documents that the background ingest
 * worker couldn't auto-link (status = needs_review). Surfaces the
 * agent's extracted metadata + a ranked list of candidate
 * requirements; user picks one and the document is linked.
 *
 * Triggered from the yellow "Needs review" chip on a vault tile.
 *
 * Why a modal (not an inline picker): the candidate list can be 10–25
 * rows with category headers; an inline expansion would push the
 * vault tree around. A modal keeps the vault layout stable and gives
 * room for the agent's reasoning + match scores.
 */
interface Props {
  companyId: string
  documentId: string
  onClose: () => void
  onLinked?: () => void
}

interface Candidate {
  id: string
  requirement: string
  category: string | null
  periodKey: string | null
  periodLabel: string | null
  dueDate: string | null
  status: string | null
  matchScore: number
}

interface AgentMeta {
  documentType: string | null
  periodKey: string | null
  periodFY: string | null
  confidence: number | null
  folderSlug: string | null
  reasoning: string | null
}

export default function ReviewIngestModal({ companyId, documentId, onClose, onLinked }: Props) {
  const [loading, setLoading] = useState(true)
  const [linking, setLinking] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [agent, setAgent] = useState<AgentMeta | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getReviewCandidatesForDocument(companyId, documentId)
      .then(res => {
        if (cancelled) return
        if (!res.success) {
          showToast(res.error || 'Failed to load candidates', 'error')
          return
        }
        setFileName(res.fileName ?? null)
        setAgent(res.agent ?? null)
        setCandidates(res.candidates ?? [])
        // Auto-select the highest-scoring candidate so Enter / Save
        // works without a click in the common case.
        const top = (res.candidates || []).find(c => c.matchScore >= 0.6)
        if (top) setPickedId(top.id)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [companyId, documentId])

  async function onSave() {
    if (!pickedId) return
    setLinking(true)
    const res = await linkDocumentToRequirement({
      companyId,
      documentId,
      requirementId: pickedId,
    }).catch(err => ({ success: false, error: err instanceof Error ? err.message : String(err) }))
    setLinking(false)
    if (!res.success) {
      showToast(res.error || 'Failed to link', 'error')
      return
    }
    showToast('Document linked', 'success')
    onLinked?.()
    onClose()
  }

  const filtered = search.trim()
    ? candidates.filter(c =>
        c.requirement.toLowerCase().includes(search.toLowerCase()) ||
        (c.category || '').toLowerCase().includes(search.toLowerCase()))
    : candidates

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0e0e0e] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-yellow-400">Review pending</span>
              {agent?.confidence != null && (
                <span className="text-[10px] text-fg-muted">
                  · agent confidence {Math.round(agent.confidence * 100)}%
                </span>
              )}
            </div>
            <h2 className="text-base font-medium text-white truncate" title={fileName || ''}>
              {fileName || 'Document'}
            </h2>
            {agent && (agent.documentType || agent.periodFY || agent.periodKey) && (
              <p className="text-xs text-fg-muted mt-1">
                Agent suggests:{' '}
                <span className="text-fg-secondary">
                  {agent.documentType || '—'}
                  {agent.periodFY ? ` · FY ${agent.periodFY}` : agent.periodKey ? ` · ${agent.periodKey}` : ''}
                </span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-fg-muted hover:text-white transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Reasoning (collapsible if long) */}
        {agent?.reasoning && (
          <div className="px-6 py-3 border-b border-white/5 text-[12px] text-fg-muted bg-white/[0.02]">
            <span className="text-fg-muted">Reasoning: </span>
            {agent.reasoning}
          </div>
        )}

        {/* Search */}
        <div className="px-6 py-3 border-b border-white/5">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter requirements…"
            className="w-full px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder:text-fg-muted focus:outline-none focus:border-white/30"
          />
        </div>

        {/* Candidate list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="px-4 py-6 text-sm text-fg-muted">Loading candidates…</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-6 text-sm text-fg-muted">
              {search ? 'No matches.' : 'No candidate requirements found for this company.'}
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map(c => {
                const picked = pickedId === c.id
                const scoreColor =
                  c.matchScore >= 0.9 ? 'text-green-400' :
                  c.matchScore >= 0.6 ? 'text-blue-400' :
                  c.matchScore >= 0.4 ? 'text-fg-muted' :
                  'text-fg-muted/60'
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setPickedId(c.id)}
                      className={`w-full text-left px-4 py-2.5 rounded-lg border transition-colors ${
                        picked
                          ? 'bg-blue-500/10 border-blue-500/40'
                          : 'border-transparent hover:bg-white/[0.04] hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white truncate" title={c.requirement}>
                            {c.requirement}
                          </div>
                          <div className="text-[11px] text-fg-muted flex items-center gap-2 mt-0.5">
                            {c.category && <span>{c.category}</span>}
                            {c.periodKey && <span>· {c.periodLabel || c.periodKey}</span>}
                            {c.dueDate && <span>· due {c.dueDate}</span>}
                            {c.status && <span>· {c.status}</span>}
                          </div>
                        </div>
                        {c.matchScore > 0 && (
                          <span className={`text-[10px] font-mono ${scoreColor} flex-shrink-0`}>
                            {Math.round(c.matchScore * 100)}%
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between gap-3">
          <span className="text-[11px] text-fg-muted">
            {pickedId ? 'Press Save to link this document.' : 'Pick a requirement to link this document to.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-fg-secondary hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={!pickedId || linking}
              className="px-4 py-1.5 text-xs rounded-lg bg-white text-black hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {linking ? 'Linking…' : 'Link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
