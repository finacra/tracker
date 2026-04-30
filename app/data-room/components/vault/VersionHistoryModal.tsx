'use client'

import { useEffect, useState } from 'react'
import { showToast } from '@/components/ui/Toast'
import { listDocumentVersions } from '@/app/data-room/actions-vault'

/**
 * Modal that shows the version chain for a single document. Walks via
 * parent_document_id so the timeline is correct even for docs with
 * many replacements. Reads only — new versions are created via the
 * "Upload new version" entry in the ⋯ menu which routes through the
 * agent modal.
 */

interface Version {
  id: string
  versionNumber: number
  fileName: string | null
  createdAt: string | null
  isLatest: boolean
  deletedAt: string | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  companyId: string
  documentId: string
  documentName: string
  onUploadNewVersion: () => void
}

export default function VersionHistoryModal({ isOpen, onClose, companyId, documentId, documentName, onUploadNewVersion }: Props) {
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isOpen || !documentId) return
    setLoading(true)
    listDocumentVersions(companyId, documentId)
      .then((res) => {
        if (res.success && res.versions) {
          // Newest first for the UI
          setVersions([...res.versions].sort((a, b) => b.versionNumber - a.versionNumber))
        } else {
          showToast(res.error || 'Failed to load versions', 'error')
        }
      })
      .finally(() => setLoading(false))
  }, [isOpen, companyId, documentId])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-xl bg-bg-card border border-line/10 rounded-2xl shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-line/10 flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-white truncate">Version history</h2>
            <p className="text-xs text-fg-muted mt-0.5 truncate">{documentName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-fg-muted hover:text-white ml-3">✕</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="text-center py-8 text-xs text-fg-muted">Loading…</div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-xs text-fg-muted">No versions found.</div>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className={`p-3 rounded-lg border ${
                    v.isLatest
                      ? 'bg-emerald-500/[0.05] border-emerald-500/20'
                      : v.deletedAt
                        ? 'bg-red-500/[0.03] border-red-500/10 opacity-60'
                        : 'bg-white/[0.02] border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                          v.isLatest
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-bg-elevated text-fg-muted border border-line/15'
                        }`}>
                          v{v.versionNumber}
                        </span>
                        {v.isLatest && <span className="text-[10px] text-emerald-400 font-medium">Current</span>}
                        {v.deletedAt && <span className="text-[10px] text-red-400">Deleted</span>}
                      </div>
                      <div className="text-xs text-fg-secondary mt-1 truncate">{v.fileName || 'Unnamed'}</div>
                      {v.createdAt && (
                        <div className="text-[10px] text-fg-muted mt-0.5">
                          {new Date(v.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-line/10 flex items-center justify-between">
          <button onClick={onClose} className="text-sm text-fg-muted hover:text-white">Close</button>
          <button
            onClick={() => { onClose(); onUploadNewVersion() }}
            className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-bg-elevated"
          >
            Upload new version
          </button>
        </div>
      </div>
    </div>
  )
}
