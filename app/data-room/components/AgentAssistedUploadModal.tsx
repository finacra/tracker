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
 * Agent-assisted single-file upload modal.
 *
 * Flow:
 *   1. User picks a file (any type)
 *   2. File uploaded to storage → uploadAndAnalyze creates a draft,
 *      kicks the Document Intelligence Agent, returns suggestions
 *   3. Review form pre-filled with suggestions — every field editable
 *   4. Save → finalizeDocument commits; Discard → cleans up the draft
 *
 * All file types accepted. OCR for scanned PDFs + images runs inside
 * analyzeAndStoreSuggestion before the agent is called.
 */

interface Props {
  isOpen: boolean
  onClose: () => void
  companyId: string
  onFinalized?: (documentId: string) => void
  /** Optional preset: if provided, pre-selects the folder on open. */
  defaultFolderId?: string | null
  /** Optional preset: link this document as evidence for a requirement id. */
  defaultRequirementId?: string | null
}

type Folder = { id: string; parentId: string | null; slug: string; name: string; kind: string }

type AgentSuggestion = {
  name: string | null
  folderSlug: string | null
  subFolderSlug: string | null
  documentType: string | null
  periodType: 'one-time' | 'monthly' | 'quarterly' | 'annual' | null
  periodFY: string | null
  periodKey: string | null
  periodStart: string | null
  periodEnd: string | null
  frequency: string | null
  requirementId: string | null
  registrationDate: string | null
  expiryDate: string | null
  confidence: number
  reasoning: string
  candidateSupersedesDocumentId: string | null
  facts: Array<{ kind: string; amount?: number | null; counterparty?: string | null; confidence: number }>
}

type Stage = 'picking' | 'uploading' | 'analyzing' | 'review' | 'saving'

export default function AgentAssistedUploadModal({
  isOpen,
  onClose,
  companyId,
  onFinalized,
  defaultFolderId = null,
  defaultRequirementId = null,
}: Props) {
  const { user } = useAuth()
  const [stage, setStage] = useState<Stage>('picking')
  const [file, setFile] = useState<File | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [suggestion, setSuggestion] = useState<AgentSuggestion | null>(null)
  const [analysisErrors, setAnalysisErrors] = useState<string[]>([])

  // Editable form state — seeded from suggestion, fully overridable.
  const [form, setForm] = useState({
    fileName: '',
    documentName: '',
    folderId: '',
    periodType: '' as '' | 'one-time' | 'monthly' | 'quarterly' | 'annual',
    periodFinancialYear: '',
    periodKey: '',
    periodStart: '',
    periodEnd: '',
    frequency: '',
    registrationDate: '',
    expiryDate: '',
    requirementId: '',
    supersedesDocumentId: '',
  })

  const resetAll = () => {
    setStage('picking')
    setFile(null)
    setDraftId(null)
    setSuggestion(null)
    setAnalysisErrors([])
    setForm({
      fileName: '', documentName: '', folderId: '',
      periodType: '', periodFinancialYear: '', periodKey: '',
      periodStart: '', periodEnd: '', frequency: '',
      registrationDate: '', expiryDate: '',
      requirementId: '', supersedesDocumentId: '',
    })
  }

  // Load folder tree when the modal opens.
  useEffect(() => {
    if (!isOpen) return
    listVaultFolders(companyId).then((res) => {
      if (res.success && res.folders) setFolders(res.folders)
    })
  }, [isOpen, companyId])

  // Close behaviour: if there's an unfinished draft, discard it so we
  // don't leave orphan rows + storage objects behind.
  const handleClose = async () => {
    if (draftId && stage !== 'saving') {
      try { await discardDraft(companyId, draftId) } catch { /* swallow */ }
    }
    resetAll()
    onClose()
  }

  // Seed form when a suggestion arrives. Resolve folder slug → folder id
  // against the actual folder tree for this company.
  useEffect(() => {
    if (!suggestion) return

    const findFolderBySlug = (slug: string | null): Folder | undefined =>
      slug ? folders.find((f) => f.slug === slug) : undefined

    let folderId = defaultFolderId || ''
    if (!folderId && suggestion.subFolderSlug) {
      folderId = findFolderBySlug(suggestion.subFolderSlug)?.id || ''
    }
    if (!folderId && suggestion.folderSlug) {
      folderId = findFolderBySlug(suggestion.folderSlug)?.id || ''
    }

    setForm({
      fileName: suggestion.name || file?.name.replace(/\.[^.]+$/, '') || '',
      documentName: suggestion.documentType || '',
      folderId,
      periodType: (suggestion.periodType || '') as any,
      periodFinancialYear: suggestion.periodFY || '',
      periodKey: suggestion.periodKey || '',
      periodStart: suggestion.periodStart || '',
      periodEnd: suggestion.periodEnd || '',
      frequency: suggestion.frequency || '',
      registrationDate: suggestion.registrationDate || '',
      expiryDate: suggestion.expiryDate || '',
      requirementId: defaultRequirementId || suggestion.requirementId || '',
      supersedesDocumentId: suggestion.candidateSupersedesDocumentId || '',
    })
  }, [suggestion, folders, file, defaultFolderId, defaultRequirementId])

  // Folder tree: system folders first, then user folders within their
  // parent. UI presents them as "Parent › Child" labels.
  const folderOptions = useMemo(() => {
    const byParent = new Map<string | null, Folder[]>()
    for (const f of folders) {
      const arr = byParent.get(f.parentId) || []
      arr.push(f)
      byParent.set(f.parentId, arr)
    }
    const out: Array<{ id: string; label: string }> = []
    const walk = (parentId: string | null, prefix: string) => {
      const children = byParent.get(parentId) || []
      children.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'system' ? -1 : 1))
      for (const f of children) {
        const label = prefix ? `${prefix} › ${f.name}` : f.name
        out.push({ id: f.id, label })
        walk(f.id, label)
      }
    }
    walk(null, '')
    return out
  }, [folders])

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleFilePicked = async (picked: File) => {
    setFile(picked)
    setStage('uploading')

    // Match existing upload path pattern: userId/companyId/fileName
    // Supabase storage policies enforce the userId prefix for auth.
    const sanitizedName = picked.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const uniqueName = `${Date.now()}-${sanitizedName}`
    const filePath = user?.id
      ? `${user.id}/${companyId}/${uniqueName}`
      : `${companyId}/${uniqueName}`

    console.log('[AgentUpload] uploading', { filePath, size: picked.size, type: picked.type })

    try {
      const buf = await picked.arrayBuffer()
      const up = await uploadFileToStorage(filePath, buf, picked.type || 'application/octet-stream')
      console.log('[AgentUpload] storage result', up)
      if (!up.success) throw new Error(up.error || 'Upload failed')

      setStage('analyzing')
      const analyze = await uploadAndAnalyze(companyId, { filePath, fileName: picked.name })
      console.log('[AgentUpload] analyze result', {
        success: analyze.success,
        documentId: analyze.documentId,
        hasSuggestion: !!analyze.suggestion,
        errors: analyze.analysisErrors,
      })
      if (!analyze.success || !analyze.documentId) {
        showToast(analyze.error || 'Analysis failed', 'error')
        setStage('picking')
        return
      }
      setDraftId(analyze.documentId)
      setSuggestion(analyze.suggestion || null)
      setAnalysisErrors(analyze.analysisErrors || [])
      setStage('review')
    } catch (err) {
      console.error('[AgentUpload] failed', err, (err as any)?.stack)
      showToast(err instanceof Error ? err.message : 'Upload failed', 'error')
      setStage('picking')
    }
  }

  const handleSave = async () => {
    if (!draftId) return
    if (!form.fileName.trim() || !form.documentName.trim() || !form.folderId) {
      showToast('File name, document name, and folder are required', 'error')
      return
    }
    setStage('saving')
    const res = await finalizeDocument(companyId, draftId, {
      documentName: form.documentName,
      fileName: form.fileName,
      folderId: form.folderId,
      periodType: form.periodType || undefined,
      periodFinancialYear: form.periodFinancialYear || undefined,
      periodKey: form.periodKey || undefined,
      periodStart: form.periodStart || undefined,
      periodEnd: form.periodEnd || undefined,
      frequency: form.frequency || undefined,
      registrationDate: form.registrationDate || undefined,
      expiryDate: form.expiryDate || undefined,
      requirementId: form.requirementId || undefined,
      supersedesDocumentId: form.supersedesDocumentId || undefined,
    })
    if (res.success) {
      showToast(
        res.versionNumber && res.versionNumber > 1
          ? `Saved as version ${res.versionNumber}`
          : 'Document saved',
        'success',
      )
      onFinalized?.(res.documentId!)
      resetAll()
      onClose()
    } else {
      showToast(res.error || 'Save failed', 'error')
      setStage('review')
    }
  }

  if (!isOpen) return null

  // ── Render ────────────────────────────────────────────────────────────

  const confidencePct = suggestion ? Math.round(suggestion.confidence * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
         onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}>
      <div className="w-full max-w-3xl bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-light text-white">Upload Document</h2>
            <p className="text-sm text-gray-400 mt-1">
              The agent will read the file and suggest how to file it — you can edit anything.
            </p>
          </div>
          <button onClick={handleClose} className="p-2 text-gray-500 hover:text-white" aria-label="Close">✕</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Stage: picking */}
          {stage === 'picking' && (
            <div className="border-2 border-dashed border-gray-700 rounded-xl p-10 text-center">
              <p className="text-gray-300 mb-4">Drop a file here or click to browse</p>
              <p className="text-xs text-gray-500 mb-6">PDF, Word, Excel, CSV, images — scanned PDFs are OCR'd automatically</p>
              <input
                type="file"
                id="agent-upload-input"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFilePicked(f)
                }}
              />
              <label
                htmlFor="agent-upload-input"
                className="inline-block px-6 py-3 bg-white text-black rounded-lg text-sm font-medium hover:bg-gray-200 cursor-pointer"
              >
                Choose file
              </label>
            </div>
          )}

          {/* Stage: uploading / analyzing */}
          {(stage === 'uploading' || stage === 'analyzing') && (
            <div className="text-center py-10 space-y-4">
              <div className="w-12 h-12 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-gray-300">
                {stage === 'uploading' ? 'Uploading…' : 'Agent is reading the document…'}
              </p>
              <p className="text-xs text-gray-500">{file?.name}</p>
            </div>
          )}

          {/* Stage: review */}
          {stage === 'review' && (
            <>
              {suggestion && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-gray-400">Agent suggestion</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${
                      confidencePct >= 80 ? 'bg-emerald-900/40 text-emerald-300' :
                      confidencePct >= 60 ? 'bg-amber-900/40 text-amber-300' :
                      'bg-red-900/40 text-red-300'
                    }`}>
                      {confidencePct}% confident
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">{suggestion.reasoning || '—'}</p>
                  {suggestion.candidateSupersedesDocumentId && (
                    <p className="text-xs text-amber-300">
                      Looks like a new version of an existing document — will be linked as version N+1 when you save.
                    </p>
                  )}
                  {analysisErrors.length > 0 && (
                    <p className="text-xs text-red-300">Analysis notes: {analysisErrors.join(', ')}</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Document name" required>
                  <input
                    type="text"
                    value={form.documentName}
                    onChange={(e) => setForm({ ...form, documentName: e.target.value })}
                    placeholder="e.g. GSTR-3B / PAN Card / Rent Agreement"
                    className="vault-input"
                  />
                </Field>
                <Field label="File name" required>
                  <input
                    type="text"
                    value={form.fileName}
                    onChange={(e) => setForm({ ...form, fileName: e.target.value })}
                    className="vault-input"
                  />
                </Field>

                <Field label="Folder" required className="md:col-span-2">
                  <select
                    value={form.folderId}
                    onChange={(e) => setForm({ ...form, folderId: e.target.value })}
                    className="vault-input"
                  >
                    <option value="">Select a folder…</option>
                    {folderOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Period type">
                  <select
                    value={form.periodType}
                    onChange={(e) => setForm({ ...form, periodType: e.target.value as any })}
                    className="vault-input"
                  >
                    <option value="">—</option>
                    <option value="one-time">One-time</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                  </select>
                </Field>
                <Field label="Financial year">
                  <input
                    type="text"
                    value={form.periodFinancialYear}
                    onChange={(e) => setForm({ ...form, periodFinancialYear: e.target.value })}
                    placeholder="2026-27"
                    className="vault-input"
                  />
                </Field>

                <Field label="Period key">
                  <input
                    type="text"
                    value={form.periodKey}
                    onChange={(e) => setForm({ ...form, periodKey: e.target.value })}
                    placeholder="2026-07 or 2026-Q2"
                    className="vault-input"
                  />
                </Field>
                <Field label="Frequency">
                  <input
                    type="text"
                    value={form.frequency}
                    onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                    placeholder="monthly / annual"
                    className="vault-input"
                  />
                </Field>

                <Field label="Period start">
                  <input type="date" value={form.periodStart}
                    onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
                    className="vault-input" />
                </Field>
                <Field label="Period end">
                  <input type="date" value={form.periodEnd}
                    onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
                    className="vault-input" />
                </Field>

                <Field label="Registration date">
                  <input type="date" value={form.registrationDate}
                    onChange={(e) => setForm({ ...form, registrationDate: e.target.value })}
                    className="vault-input" />
                </Field>
                <Field label="Expiry date">
                  <input type="date" value={form.expiryDate}
                    onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                    className="vault-input" />
                </Field>

                <Field label="Linked compliance rule id" className="md:col-span-2">
                  <input
                    type="text"
                    value={form.requirementId}
                    onChange={(e) => setForm({ ...form, requirementId: e.target.value })}
                    placeholder="e.g. tds-return-q1@itact2025"
                    className="vault-input font-mono text-xs"
                  />
                </Field>
              </div>

              {suggestion && suggestion.facts.length > 0 && (
                <div className="bg-gray-900/30 border border-gray-800 rounded-lg p-4">
                  <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">
                    {suggestion.facts.length} fact{suggestion.facts.length === 1 ? '' : 's'} will be recorded
                  </p>
                  <ul className="text-xs text-gray-300 space-y-1">
                    {suggestion.facts.map((f, i) => (
                      <li key={i}>
                        <span className="font-mono">{f.kind}</span>
                        {f.amount != null && <> · ₹{Number(f.amount).toLocaleString('en-IN')}</>}
                        {f.counterparty && <> · {f.counterparty}</>}
                        <span className="text-gray-500"> · {Math.round(f.confidence * 100)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* Stage: saving */}
          {stage === 'saving' && (
            <div className="text-center py-10 space-y-4">
              <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-gray-300">Saving…</p>
            </div>
          )}
        </div>

        {stage === 'review' && (
          <div className="p-6 border-t border-gray-800 flex items-center justify-between">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white"
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
              disabled={!form.fileName.trim() || !form.documentName.trim() || !form.folderId}
            >
              Save document
            </button>
          </div>
        )}
      </div>

      <style jsx global>{`
        .vault-input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          background: rgb(17, 24, 39);
          border: 1px solid rgb(55, 65, 81);
          border-radius: 0.5rem;
          color: white;
          font-size: 0.875rem;
        }
        .vault-input:focus {
          outline: none;
          border-color: rgb(107, 114, 128);
          box-shadow: 0 0 0 1px rgb(107, 114, 128);
        }
      `}</style>
    </div>
  )
}

function Field(props: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={props.className}>
      <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1">
        {props.label}
        {props.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {props.children}
    </div>
  )
}
