'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { uploadFileToStorage } from '../document-actions'
import {
  uploadAndAnalyze,
  finalizeDocument,
  discardDraft,
} from '../actions-document-agent'
import { listVaultFolders } from '../actions-vault'
import { showToast } from '@/components/ui/Toast'

/**
 * Agent-assisted bulk upload.
 *
 * Flow:
 *   1. User picks many files (any type)
 *   2. All files uploaded + analyzed in parallel, limited to a small
 *      concurrency so we don't swamp Azure OpenAI / storage
 *   3. Review table — one editable row per file with the agent's
 *      suggestions prefilled (file name, folder, document type, period,
 *      requirement id)
 *   4. "Save all" finalizes every row; errors on individual rows don't
 *      block the others
 *   5. Discarding the modal cleans up any draft rows we created
 */

interface Props {
  isOpen: boolean
  onClose: () => void
  companyId: string
  onFinalized?: () => void
}

type Folder = { id: string; parentId: string | null; slug: string; name: string; kind: string }

type DraftRow = {
  documentId: string
  fileName: string
  originalFileName: string
  documentName: string
  folderId: string
  folderSlug: string | null
  subFolderSlug: string | null
  periodType: '' | 'one-time' | 'monthly' | 'quarterly' | 'annual'
  periodFinancialYear: string
  periodKey: string
  periodStart: string
  periodEnd: string
  frequency: string
  registrationDate: string
  expiryDate: string
  requirementId: string
  supersedesDocumentId: string
  confidence: number
  reasoning: string
  status: 'pending' | 'analyzing' | 'ready' | 'saving' | 'saved' | 'error'
  error?: string
}

const ANALYSIS_CONCURRENCY = 3

export default function AgentAssistedBulkUploadModal({
  isOpen,
  onClose,
  companyId,
  onFinalized,
}: Props) {
  const { user } = useAuth()
  const [stage, setStage] = useState<'picking' | 'processing' | 'review' | 'saving' | 'done'>('picking')
  const [rows, setRows] = useState<DraftRow[]>([])
  const [folders, setFolders] = useState<Folder[]>([])

  const resetAll = () => {
    setStage('picking')
    setRows([])
  }

  useEffect(() => {
    if (!isOpen) return
    listVaultFolders(companyId).then((res) => {
      if (res.success && res.folders) setFolders(res.folders)
    })
  }, [isOpen, companyId])

  const folderOptions = useMemo(() => {
    const byParent = new Map<string | null, Folder[]>()
    for (const f of folders) {
      const arr = byParent.get(f.parentId) || []
      arr.push(f)
      byParent.set(f.parentId, arr)
    }
    const out: Array<{ id: string; label: string }> = []
    const walk = (parentId: string | null, prefix: string) => {
      const kids = byParent.get(parentId) || []
      kids.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'system' ? -1 : 1))
      for (const f of kids) {
        const label = prefix ? `${prefix} › ${f.name}` : f.name
        out.push({ id: f.id, label })
        walk(f.id, label)
      }
    }
    walk(null, '')
    return out
  }, [folders])

  // ── File picking + per-file analysis with small concurrency ──────────

  const handleFilesPicked = async (files: File[]) => {
    if (!files.length) return
    setStage('processing')

    // Seed pending rows up front so the UI shows progress.
    const initial: DraftRow[] = files.map((f) => ({
      documentId: '',
      fileName: f.name.replace(/\.[^.]+$/, ''),
      originalFileName: f.name,
      documentName: '',
      folderId: '',
      folderSlug: null,
      subFolderSlug: null,
      periodType: '',
      periodFinancialYear: '',
      periodKey: '',
      periodStart: '',
      periodEnd: '',
      frequency: '',
      registrationDate: '',
      expiryDate: '',
      requirementId: '',
      supersedesDocumentId: '',
      confidence: 0,
      reasoning: '',
      status: 'pending',
    }))
    setRows(initial)

    // Helper that owns a single-file analyze pipeline. We match rows by
    // index because names can repeat.
    const analyzeOne = async (file: File, index: number) => {
      setRows((prev) => prev.map((r, i) => i === index ? { ...r, status: 'analyzing' } : r))

      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const uniqueName = `${Date.now()}-${sanitizedName}`
      const filePath = user?.id
        ? `${user.id}/${companyId}/${uniqueName}`
        : `${companyId}/${uniqueName}`

      try {
        const buf = await file.arrayBuffer()
        const up = await uploadFileToStorage(filePath, buf, file.type || 'application/octet-stream')
        if (!up.success) throw new Error(up.error || 'Upload failed')

        console.log('[BulkAgent] calling uploadAndAnalyze', { filePath, fileName: file.name })
        let a: Awaited<ReturnType<typeof uploadAndAnalyze>>
        try {
          a = await uploadAndAnalyze(companyId, { filePath, fileName: file.name })
        } catch (rpcErr) {
          // Server action itself failed (400 / network / stale cache) — still
          // mark as ready with empty fields so the user can fill manually.
          console.error('[BulkAgent] uploadAndAnalyze RPC threw', rpcErr)
          a = { success: false, error: rpcErr instanceof Error ? rpcErr.message : 'Analysis unavailable' }
        }
        console.log('[BulkAgent] result', { success: a.success, documentId: a.documentId, error: a.error, hasSuggestion: !!a.suggestion, errors: a.analysisErrors })

        const s = a.suggestion
        const findFolderBySlug = (slug: string | null) =>
          slug ? folders.find((f) => f.slug === slug)?.id || '' : ''
        const folderId = findFolderBySlug(s?.subFolderSlug ?? null) || findFolderBySlug(s?.folderSlug ?? null) || ''

        setRows((prev) => prev.map((r, i) => i === index ? {
          ...r,
          documentId: a.documentId || '',
          fileName: s?.name || r.fileName,
          documentName: s?.documentType || '',
          folderId,
          folderSlug: s?.folderSlug ?? null,
          subFolderSlug: s?.subFolderSlug ?? null,
          periodType: (s?.periodType || '') as any,
          periodFinancialYear: s?.periodFY || '',
          periodKey: s?.periodKey || '',
          periodStart: s?.periodStart || '',
          periodEnd: s?.periodEnd || '',
          frequency: s?.frequency || '',
          registrationDate: s?.registrationDate || '',
          expiryDate: s?.expiryDate || '',
          requirementId: s?.requirementId || '',
          supersedesDocumentId: s?.candidateSupersedesDocumentId || '',
          confidence: s?.confidence || 0,
          reasoning: a.success ? (s?.reasoning || '') : (a.error || 'Agent unavailable — fill fields manually'),
          status: 'ready',
        } : r))
      } catch (err) {
        console.error('[BulkAgent] fatal error for file', file.name, err)
        setRows((prev) => prev.map((r, i) => i === index ? {
          ...r, status: 'error', error: err instanceof Error ? err.message : 'Failed'
        } : r))
      }
    }

    // Small concurrency pool — don't drown Azure with 30 parallel LLM calls.
    let cursor = 0
    const workers = Array.from({ length: Math.min(ANALYSIS_CONCURRENCY, files.length) }, async () => {
      while (cursor < files.length) {
        const myIndex = cursor++
        await analyzeOne(files[myIndex], myIndex)
      }
    })
    await Promise.all(workers)

    setStage('review')
  }

  // ── Saving all rows ──────────────────────────────────────────────────

  const handleSaveAll = async () => {
    const savable = rows.filter((r) => r.status === 'ready' && r.documentName && r.folderId && r.fileName)
    if (!savable.length) {
      showToast('Nothing to save — make sure each row has a document name and a folder.', 'info')
      return
    }
    setStage('saving')

    let ok = 0
    let bad = 0
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (r.status !== 'ready') continue
      if (!r.documentName || !r.folderId || !r.fileName) {
        bad++
        setRows((prev) => prev.map((x, idx) => idx === i ? { ...x, status: 'error', error: 'Missing required fields' } : x))
        continue
      }
      setRows((prev) => prev.map((x, idx) => idx === i ? { ...x, status: 'saving' } : x))
      const res = await finalizeDocument(companyId, r.documentId, {
        documentName: r.documentName,
        fileName: r.fileName,
        folderId: r.folderId,
        periodType: r.periodType || undefined,
        periodFinancialYear: r.periodFinancialYear || undefined,
        periodKey: r.periodKey || undefined,
        periodStart: r.periodStart || undefined,
        periodEnd: r.periodEnd || undefined,
        frequency: r.frequency || undefined,
        registrationDate: r.registrationDate || undefined,
        expiryDate: r.expiryDate || undefined,
        requirementId: r.requirementId || undefined,
        supersedesDocumentId: r.supersedesDocumentId || undefined,
      })
      if (res.success) {
        ok++
        setRows((prev) => prev.map((x, idx) => idx === i ? { ...x, status: 'saved' } : x))
      } else {
        bad++
        setRows((prev) => prev.map((x, idx) => idx === i ? { ...x, status: 'error', error: res.error || 'Save failed' } : x))
      }
    }
    setStage('done')
    onFinalized?.()
    if (bad === 0) {
      showToast(`Saved ${ok} document${ok === 1 ? '' : 's'}`, 'success')
    } else {
      showToast(`${ok} saved, ${bad} failed — review the highlighted rows`, 'info')
    }
  }

  const handleClose = async () => {
    // Clean up any drafts that never got saved.
    const drafts = rows.filter((r) => r.documentId && r.status !== 'saved')
    await Promise.all(drafts.map((r) => discardDraft(companyId, r.documentId).catch(() => null)))
    resetAll()
    onClose()
  }

  if (!isOpen) return null

  const totals = {
    total: rows.length,
    analyzing: rows.filter((r) => r.status === 'analyzing' || r.status === 'pending').length,
    ready: rows.filter((r) => r.status === 'ready').length,
    saved: rows.filter((r) => r.status === 'saved').length,
    error: rows.filter((r) => r.status === 'error').length,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
         onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}>
      <div className="w-full max-w-6xl bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-light text-white">Bulk Upload · with Agent</h2>
            <p className="text-sm text-gray-400 mt-1">
              Drop many files. The agent reads each one and fills the fields — you just review and save.
            </p>
          </div>
          <button onClick={handleClose} className="p-2 text-gray-500 hover:text-white">✕</button>
        </div>

        <div className="p-6 space-y-5">
          {stage === 'picking' && (
            <div className="border-2 border-dashed border-gray-700 rounded-xl p-10 text-center">
              <p className="text-gray-300 mb-4">Drop files here or click to browse</p>
              <p className="text-xs text-gray-500 mb-6">PDF, Word, Excel, CSV, images — scanned PDFs are OCR'd automatically</p>
              <input
                type="file"
                id="bulk-agent-upload-input"
                className="hidden"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || [])
                  if (files.length) handleFilesPicked(files)
                }}
              />
              <label
                htmlFor="bulk-agent-upload-input"
                className="inline-block px-6 py-3 bg-white text-black rounded-lg text-sm font-medium hover:bg-gray-200 cursor-pointer"
              >
                Choose files
              </label>
            </div>
          )}

          {(stage === 'processing' || stage === 'review' || stage === 'saving' || stage === 'done') && (
            <>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>Total: <span className="text-white">{totals.total}</span></span>
                {totals.analyzing > 0 && <span>Analyzing: <span className="text-white">{totals.analyzing}</span></span>}
                <span>Ready: <span className="text-emerald-300">{totals.ready}</span></span>
                {totals.saved > 0 && <span>Saved: <span className="text-emerald-300">{totals.saved}</span></span>}
                {totals.error > 0 && <span>Errors: <span className="text-red-300">{totals.error}</span></span>}
              </div>

              <div className="overflow-x-auto border border-gray-800 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-900/50 border-b border-gray-800">
                    <tr className="text-left text-gray-400">
                      <th className="p-2">Status</th>
                      <th className="p-2">File</th>
                      <th className="p-2">Document name</th>
                      <th className="p-2">Folder</th>
                      <th className="p-2">Period</th>
                      <th className="p-2">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => (
                      <tr key={idx} className={`border-b border-gray-800/50 ${r.status === 'error' ? 'bg-red-900/10' : r.status === 'saved' ? 'bg-emerald-900/10' : ''}`}>
                        <td className="p-2 text-[10px]">
                          <StatusBadge status={r.status} error={r.error} />
                        </td>
                        <td className="p-2 min-w-[180px]">
                          <input
                            type="text"
                            value={r.fileName}
                            disabled={r.status === 'saving' || r.status === 'saved'}
                            onChange={(e) => setRows((prev) => prev.map((x, i) => i === idx ? { ...x, fileName: e.target.value } : x))}
                            className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white"
                          />
                          <div className="text-[10px] text-gray-500 mt-0.5 truncate">{r.originalFileName}</div>
                        </td>
                        <td className="p-2 min-w-[160px]">
                          <input
                            type="text"
                            value={r.documentName}
                            disabled={r.status === 'saving' || r.status === 'saved'}
                            placeholder="e.g. GSTR-3B"
                            onChange={(e) => setRows((prev) => prev.map((x, i) => i === idx ? { ...x, documentName: e.target.value } : x))}
                            className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white"
                          />
                        </td>
                        <td className="p-2 min-w-[200px]">
                          <select
                            value={r.folderId}
                            disabled={r.status === 'saving' || r.status === 'saved'}
                            onChange={(e) => setRows((prev) => prev.map((x, i) => i === idx ? { ...x, folderId: e.target.value } : x))}
                            className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white"
                          >
                            <option value="">Select…</option>
                            {folderOptions.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
                          </select>
                        </td>
                        <td className="p-2 min-w-[140px]">
                          <input
                            type="text"
                            value={r.periodKey}
                            disabled={r.status === 'saving' || r.status === 'saved'}
                            placeholder="YYYY-MM or YYYY-Q1"
                            onChange={(e) => setRows((prev) => prev.map((x, i) => i === idx ? { ...x, periodKey: e.target.value } : x))}
                            className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white"
                          />
                        </td>
                        <td className="p-2 min-w-[80px]">
                          {r.status === 'ready' || r.status === 'saved' ? (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              r.confidence >= 0.8 ? 'bg-emerald-900/40 text-emerald-300' :
                              r.confidence >= 0.6 ? 'bg-amber-900/40 text-amber-300' :
                              'bg-gray-900/40 text-gray-400'
                            }`}>
                              {Math.round(r.confidence * 100)}%
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {stage === 'review' && (
          <div className="p-6 border-t border-gray-800 flex items-center justify-between">
            <button onClick={handleClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
              Discard all
            </button>
            <button
              onClick={handleSaveAll}
              className="px-6 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
              disabled={totals.ready === 0}
            >
              Save {totals.ready} document{totals.ready === 1 ? '' : 's'}
            </button>
          </div>
        )}

        {stage === 'done' && (
          <div className="p-6 border-t border-gray-800 flex items-center justify-end">
            <button
              onClick={handleClose}
              className="px-6 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status, error }: { status: DraftRow['status']; error?: string }) {
  if (status === 'pending' || status === 'analyzing') {
    return (
      <span className="inline-flex items-center gap-1 text-gray-300">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        {status === 'pending' ? 'Queued' : 'Reading…'}
      </span>
    )
  }
  if (status === 'ready') return <span className="text-emerald-300">Ready</span>
  if (status === 'saving') return <span className="text-blue-300">Saving…</span>
  if (status === 'saved') return <span className="text-emerald-300">Saved</span>
  if (status === 'error') return (
    <div>
      <span className="text-red-300">Error</span>
      {error && <div className="text-red-400 text-[9px] mt-0.5 max-w-[200px] break-words">{error}</div>}
    </div>
  )
  return null
}
