'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { showToast } from '@/components/ui/Toast'
import {
  listVaultTree,
  createVaultFolder,
  renameVaultFolder,
  deleteVaultFolder,
  renameDocument,
  moveDocument,
  deleteDocument,
  bulkDeleteDocuments,
} from '@/app/data-room/actions-vault'
import VersionHistoryModal from './VersionHistoryModal'
import { useRotatingLoadingMessage } from '@/hooks/useRotatingLoadingMessage'
import { DOCUMENTS_VAULT_LOADING_MESSAGES } from '@/lib/ui/loading-messages'

/**
 * Data-driven vault UI. Reads vault_folders + company_documents_internal
 * via one server action and renders the full nested taxonomy
 * (Constitutional → MOA / AOA / COI / PAN / TAN / Share Certificates /
 * DIN Certificates, Statutory Compliances → Advance Tax / TDS / ITR /
 * Tax Audit / GST, plus Licences / Financials / MCA Filings).
 *
 * Supports: expand/collapse, create sub-folder (any depth), rename user
 * folder, delete user folder, per-document rename / move / delete, and
 * bulk select + bulk delete across any mix of folders.
 */

interface Folder {
  id: string
  parentId: string | null
  slug: string
  name: string
  kind: string
  sortOrder: number
}

interface Doc {
  id: string
  folderId: string | null
  folderName: string | null
  fileName: string | null
  documentType: string | null
  createdAt: string | null
  updatedAt: string | null
  requirementId: string | null
  isLatest: boolean
  versionNumber: number
}

interface Props {
  companyId: string
  canEdit: boolean
  onUploadToFolder?: (folderId: string, folderName: string) => void
  onPreviewDocument?: (doc: Doc) => void
  /**
   * Called when the user picks "Upload new version" from a doc's menu.
   * Parent opens the agent modal with defaultSupersedesDocumentId set
   * so the next upload chains onto this document.
   */
  onUploadNewVersion?: (doc: Doc) => void
}

export default function VaultTreeView({ companyId, canEdit, onUploadToFolder, onPreviewDocument, onUploadNewVersion }: Props) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [documents, setDocuments] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [versionHistoryDoc, setVersionHistoryDoc] = useState<Doc | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Prevent the previous company's response from overwriting the new one
  // when the user switches companies mid-flight. Stamp every load with
  // the companyId it's for; drop stale results.
  const activeCompanyRef = useRef<string>(companyId)

  const load = useCallback(async () => {
    activeCompanyRef.current = companyId
    setLoading(true)
    try {
      const res = await listVaultTree(companyId)
      // Discard if company changed while this request was in flight
      if (activeCompanyRef.current !== companyId) return
      if (res.success) {
        setFolders(res.folders || [])
        setDocuments(res.documents || [])
        setExpanded(prev => {
          if (prev.size > 0) return prev
          const next = new Set<string>()
          ;(res.folders || []).filter(f => f.parentId === null).forEach(f => next.add(f.id))
          return next
        })
      } else {
        showToast(res.error || 'Failed to load vault', 'error')
      }
    } finally {
      if (activeCompanyRef.current === companyId) setLoading(false)
    }
  }, [companyId])

  // Company switch: reset everything + reload. Avoids showing stale data
  // between the old company's response and the new one.
  useEffect(() => {
    setFolders([])
    setDocuments([])
    setSelected(new Set())
    setExpanded(new Set())
    load()
  }, [companyId, load])

  // Refresh when an external upload or Claris mutation happens
  useEffect(() => {
    const h = () => load()
    window.addEventListener('cia:data-changed', h)
    window.addEventListener('vault:data-changed', h)
    return () => {
      window.removeEventListener('cia:data-changed', h)
      window.removeEventListener('vault:data-changed', h)
    }
  }, [load])

  // Build parent → children map once per folders change
  const { childrenOf, docsInFolder, rootFolders } = useMemo(() => {
    const childrenOf = new Map<string | null, Folder[]>()
    for (const f of folders) {
      const key = f.parentId
      if (!childrenOf.has(key)) childrenOf.set(key, [])
      childrenOf.get(key)!.push(f)
    }
    // Sort children: system first (by sortOrder), then user (alphabetical)
    for (const [, arr] of childrenOf) {
      arr.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'system' ? -1 : 1
        if (a.kind === 'system') return a.sortOrder - b.sortOrder
        return a.name.localeCompare(b.name)
      })
    }

    const docsInFolder = new Map<string | null, Doc[]>()
    for (const d of documents) {
      if (!docsInFolder.has(d.folderId)) docsInFolder.set(d.folderId, [])
      docsInFolder.get(d.folderId)!.push(d)
    }

    const rootFolders = childrenOf.get(null) || []
    return { childrenOf, docsInFolder, rootFolders }
  }, [folders, documents])

  const toggleExpand = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const clearSelection = () => setSelected(new Set())

  // ── Optimistic mutations ───────────────────────────────────────────────
  // Every mutation updates local state immediately, then fires the server
  // action in the background. On failure we reconcile with a full load()
  // so the user sees the real state. No full refetch on success → UI
  // stays snappy even with a slow network.

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} document${selected.size === 1 ? '' : 's'}? This can be restored from the audit log.`)) return
    const ids = Array.from(selected)
    const idSet = new Set(ids)
    setDocuments(prev => prev.filter(d => !idSet.has(d.id)))
    clearSelection()
    showToast(`Deleted ${ids.length} document${ids.length === 1 ? '' : 's'}`, 'success')
    const res = await bulkDeleteDocuments(companyId, ids)
    if (!res.success) {
      showToast(res.error || 'Delete failed — reloading', 'error')
      load()
    }
  }

  const handleCreateFolder = async (parentId: string | null) => {
    const name = prompt('Folder name')
    if (!name || !name.trim()) return
    const trimmed = name.trim()
    showToast('Folder created', 'success')
    if (parentId) setExpanded(prev => new Set(prev).add(parentId))
    const res = await createVaultFolder(companyId, parentId, trimmed)
    if (res.success && res.folderId) {
      // Insert the new folder into local state without refetching.
      setFolders(prev => [
        ...prev,
        {
          id: res.folderId!,
          parentId,
          slug: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64),
          name: trimmed,
          kind: 'user',
          sortOrder: 0,
        },
      ])
    } else if (!res.success) {
      showToast(res.error || 'Failed to create folder — reloading', 'error')
      load()
    }
  }

  const handleRenameFolder = async (folder: Folder) => {
    if (folder.kind === 'system') {
      showToast('System folders cannot be renamed', 'info')
      return
    }
    const name = prompt('Rename folder', folder.name)
    if (!name || !name.trim() || name.trim() === folder.name) return
    const newName = name.trim()
    setFolders(prev => prev.map(f => f.id === folder.id ? { ...f, name: newName } : f))
    const res = await renameVaultFolder(companyId, folder.id, newName)
    if (!res.success) {
      setFolders(prev => prev.map(f => f.id === folder.id ? { ...f, name: folder.name } : f))
      showToast(res.error || 'Rename failed', 'error')
    }
  }

  const handleDeleteFolder = async (folder: Folder) => {
    if (folder.kind === 'system') {
      showToast('System folders cannot be deleted', 'info')
      return
    }
    if (!confirm(`Delete folder "${folder.name}"? Any contents will move to the parent folder.`)) return
    // Optimistic: re-parent children + docs to this folder's parent, then
    // drop this folder. Matches deleteUserFolder's server-side behaviour.
    setFolders(prev =>
      prev
        .filter(f => f.id !== folder.id)
        .map(f => (f.parentId === folder.id ? { ...f, parentId: folder.parentId } : f)),
    )
    setDocuments(prev => prev.map(d => (d.folderId === folder.id ? { ...d, folderId: folder.parentId } : d)))
    showToast('Folder deleted', 'success')
    const res = await deleteVaultFolder(companyId, folder.id)
    if (!res.success) {
      showToast(res.error || 'Delete failed — reloading', 'error')
      load()
    }
  }

  const handleRenameDoc = async (doc: Doc) => {
    const name = prompt('Rename document', doc.fileName || '')
    if (!name || !name.trim() || name.trim() === doc.fileName) return
    const newName = name.trim()
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, fileName: newName } : d))
    const res = await renameDocument(companyId, doc.id, newName)
    if (!res.success) {
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, fileName: doc.fileName } : d))
      showToast(res.error || 'Rename failed', 'error')
    }
  }

  const handleDeleteDoc = async (doc: Doc) => {
    if (!confirm(`Delete "${doc.fileName || 'document'}"?`)) return
    setDocuments(prev => prev.filter(d => d.id !== doc.id))
    showToast('Document deleted', 'success')
    const res = await deleteDocument(companyId, doc.id)
    if (!res.success) {
      showToast(res.error || 'Delete failed — reloading', 'error')
      load()
    }
  }

  const handleMoveDoc = async (doc: Doc) => {
    const flat: Array<{ id: string; label: string }> = []
    const walk = (parentId: string | null, depth: number) => {
      const kids = childrenOf.get(parentId) || []
      for (const k of kids) {
        flat.push({ id: k.id, label: `${'  '.repeat(depth)}${k.name}` })
        walk(k.id, depth + 1)
      }
    }
    walk(null, 0)
    const options = flat.map((f, i) => `${i + 1}. ${f.label}${f.id === doc.folderId ? '  (current)' : ''}`).join('\n')
    const raw = prompt(`Move "${doc.fileName || 'document'}" to which folder?\n\n${options}\n\nEnter number:`)
    if (!raw) return
    const idx = parseInt(raw, 10) - 1
    if (isNaN(idx) || idx < 0 || idx >= flat.length) {
      showToast('Invalid selection', 'error')
      return
    }
    const target = flat[idx]
    if (target.id === doc.folderId) return
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, folderId: target.id } : d))
    showToast(`Moved to ${target.label.trim()}`, 'success')
    const res = await moveDocument(companyId, doc.id, target.id)
    if (!res.success) {
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, folderId: doc.folderId } : d))
      showToast(res.error || 'Move failed', 'error')
    }
  }

  if (loading) {
    return <VaultLoadingState />
  }

  return (
    <div className="space-y-3">
      {/* Bulk action bar + top-level "New folder" */}
      <div className="flex items-center justify-between px-1">
        <div className="text-xs text-gray-400">
          {folders.length} folder{folders.length === 1 ? '' : 's'} · {documents.length} document{documents.length === 1 ? '' : 's'}
          {selected.size > 0 && <span className="ml-3 text-amber-300">{selected.size} selected</span>}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && canEdit && (
            <button
              onClick={handleBulkDelete}
              className="text-[11px] px-2.5 py-1 border border-red-500/40 text-red-300 rounded hover:bg-red-500/10"
            >
              Delete {selected.size}
            </button>
          )}
          {selected.size > 0 && (
            <button
              onClick={clearSelection}
              className="text-[11px] px-2.5 py-1 border border-white/10 text-gray-400 rounded hover:text-white hover:border-white/20"
            >
              Clear
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => handleCreateFolder(null)}
              className="text-[11px] px-2.5 py-1 border border-white/10 text-gray-300 rounded hover:text-white hover:border-white/20"
            >
              + New folder
            </button>
          )}
        </div>
      </div>

      {/* Root folders */}
      <div className="space-y-2">
        {rootFolders.map(folder => (
          <FolderNode
            key={folder.id}
            folder={folder}
            depth={0}
            childrenOf={childrenOf}
            docsInFolder={docsInFolder}
            expanded={expanded}
            selected={selected}
            canEdit={canEdit}
            onToggleExpand={toggleExpand}
            onToggleSelect={toggleSelect}
            onCreateSubfolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onRenameDoc={handleRenameDoc}
            onDeleteDoc={handleDeleteDoc}
            onMoveDoc={handleMoveDoc}
            onShowVersions={setVersionHistoryDoc}
            onUploadNewVersion={onUploadNewVersion}
            onUploadToFolder={onUploadToFolder}
            onPreviewDocument={onPreviewDocument}
          />
        ))}
      </div>

      {versionHistoryDoc && (
        <VersionHistoryModal
          isOpen={true}
          onClose={() => setVersionHistoryDoc(null)}
          companyId={companyId}
          documentId={versionHistoryDoc.id}
          documentName={versionHistoryDoc.fileName || 'Document'}
          onUploadNewVersion={() => {
            const doc = versionHistoryDoc
            setVersionHistoryDoc(null)
            if (doc && onUploadNewVersion) onUploadNewVersion(doc)
          }}
        />
      )}
    </div>
  )
}

// ── Folder node (recursive) ──────────────────────────────────────────────

function FolderNode({
  folder,
  depth,
  childrenOf,
  docsInFolder,
  expanded,
  selected,
  canEdit,
  onToggleExpand,
  onToggleSelect,
  onCreateSubfolder,
  onRenameFolder,
  onDeleteFolder,
  onRenameDoc,
  onDeleteDoc,
  onMoveDoc,
  onShowVersions,
  onUploadNewVersion,
  onUploadToFolder,
  onPreviewDocument,
}: {
  folder: Folder
  depth: number
  childrenOf: Map<string | null, Folder[]>
  docsInFolder: Map<string | null, Doc[]>
  expanded: Set<string>
  selected: Set<string>
  canEdit: boolean
  onToggleExpand: (id: string) => void
  onToggleSelect: (id: string) => void
  onCreateSubfolder: (parentId: string | null) => void
  onRenameFolder: (f: Folder) => void
  onDeleteFolder: (f: Folder) => void
  onRenameDoc: (d: Doc) => void
  onDeleteDoc: (d: Doc) => void
  onMoveDoc: (d: Doc) => void
  onShowVersions: (d: Doc) => void
  onUploadNewVersion?: (d: Doc) => void
  onUploadToFolder?: (folderId: string, folderName: string) => void
  onPreviewDocument?: (doc: Doc) => void
}) {
  const kids = childrenOf.get(folder.id) || []
  const docs = docsInFolder.get(folder.id) || []
  const isExpanded = expanded.has(folder.id)
  const hasContents = kids.length > 0 || docs.length > 0
  const [menuOpen, setMenuOpen] = useState(false)

  // Count totals recursively (for the badge on collapsed folders)
  const totalDocs = useMemo(() => {
    let total = docs.length
    const walk = (parentId: string | null) => {
      const list = childrenOf.get(parentId) || []
      for (const c of list) {
        total += (docsInFolder.get(c.id) || []).length
        walk(c.id)
      }
    }
    walk(folder.id)
    return total
  }, [folder.id, docs.length, childrenOf, docsInFolder])

  const depthPadding = depth === 0 ? '' : `pl-${Math.min(depth * 4, 16)}`
  const bgColor = depth === 0 ? 'bg-gray-900/40' : 'bg-gray-900/20'
  const borderColor = depth === 0 ? 'border-white/10' : 'border-white/5'

  return (
    <div className={`border ${borderColor} rounded-lg ${bgColor} overflow-hidden`} style={{ marginLeft: depth > 0 ? `${depth * 16}px` : 0 }}>
      {/* Folder header row */}
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-white/[0.02] transition-colors">
        <button
          onClick={() => onToggleExpand(folder.id)}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-500 hover:text-white"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
            <path d="M4 2l4 4-4 4V2z" />
          </svg>
        </button>

        {/* Folder icon */}
        <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>

        <button
          onClick={() => onToggleExpand(folder.id)}
          className="flex-1 text-left min-w-0 flex items-center gap-2"
        >
          <span className={`text-sm ${depth === 0 ? 'text-white font-medium' : 'text-gray-200'} truncate`}>
            {folder.name}
          </span>
          {folder.kind === 'user' && (
            <span className="text-[9px] uppercase tracking-wider text-gray-500 border border-gray-700 px-1 rounded flex-shrink-0">Custom</span>
          )}
          <span className="text-[10px] text-gray-500 flex-shrink-0">
            {totalDocs} {totalDocs === 1 ? 'doc' : 'docs'}
          </span>
        </button>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {canEdit && onUploadToFolder && (
            <button
              onClick={() => onUploadToFolder(folder.id, folder.name)}
              className="text-[11px] px-2 py-1 text-gray-400 hover:text-white"
              title="Upload to this folder"
            >
              ↑ Upload
            </button>
          )}
          {canEdit && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-white rounded"
                aria-label="Folder actions"
              >
                ⋯
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl py-1 text-xs">
                    <button
                      onClick={() => { setMenuOpen(false); onCreateSubfolder(folder.id) }}
                      className="w-full text-left px-3 py-1.5 text-gray-200 hover:bg-white/5"
                    >
                      + New sub-folder
                    </button>
                    {folder.kind === 'user' && (
                      <>
                        <button
                          onClick={() => { setMenuOpen(false); onRenameFolder(folder) }}
                          className="w-full text-left px-3 py-1.5 text-gray-200 hover:bg-white/5"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => { setMenuOpen(false); onDeleteFolder(folder) }}
                          className="w-full text-left px-3 py-1.5 text-red-300 hover:bg-red-500/10"
                        >
                          Delete folder
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expanded contents */}
      {isExpanded && (
        <div className="border-t border-white/5">
          {docs.length > 0 && (
            <div className="divide-y divide-white/[0.03]">
              {docs.map(doc => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  depth={depth}
                  selected={selected.has(doc.id)}
                  canEdit={canEdit}
                  onToggleSelect={onToggleSelect}
                  onRename={onRenameDoc}
                  onDelete={onDeleteDoc}
                  onMove={onMoveDoc}
                  onPreview={onPreviewDocument}
                  onShowVersions={onShowVersions}
                  onUploadNewVersion={onUploadNewVersion}
                />
              ))}
            </div>
          )}

          {kids.length > 0 && (
            <div className="p-2 space-y-1.5">
              {kids.map(child => (
                <FolderNode
                  key={child.id}
                  folder={child}
                  depth={depth + 1}
                  childrenOf={childrenOf}
                  docsInFolder={docsInFolder}
                  expanded={expanded}
                  selected={selected}
                  canEdit={canEdit}
                  onToggleExpand={onToggleExpand}
                  onToggleSelect={onToggleSelect}
                  onCreateSubfolder={onCreateSubfolder}
                  onRenameFolder={onRenameFolder}
                  onDeleteFolder={onDeleteFolder}
                  onRenameDoc={onRenameDoc}
                  onDeleteDoc={onDeleteDoc}
                  onMoveDoc={onMoveDoc}
                  onShowVersions={onShowVersions}
                  onUploadNewVersion={onUploadNewVersion}
                  onUploadToFolder={onUploadToFolder}
                  onPreviewDocument={onPreviewDocument}
                />
              ))}
            </div>
          )}

          {!hasContents && (
            <div className="px-6 py-4 text-[11px] text-gray-500 italic">
              Empty. {canEdit && 'Upload a document or create a sub-folder to get started.'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Document row ──────────────────────────────────────────────────────────

function DocumentRow({
  doc,
  depth,
  selected,
  canEdit,
  onToggleSelect,
  onRename,
  onDelete,
  onMove,
  onPreview,
  onShowVersions,
  onUploadNewVersion,
}: {
  doc: Doc
  depth: number
  selected: boolean
  canEdit: boolean
  onToggleSelect: (id: string) => void
  onRename: (d: Doc) => void
  onDelete: (d: Doc) => void
  onMove: (d: Doc) => void
  onPreview?: (d: Doc) => void
  onShowVersions: (d: Doc) => void
  onUploadNewVersion?: (d: Doc) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const formatted = doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  const hasVersionHistory = doc.versionNumber > 1

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] transition-colors ${selected ? 'bg-blue-500/[0.06]' : ''}`}
      style={{ paddingLeft: `${32 + depth * 16}px` }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(doc.id)}
        disabled={!canEdit}
        className="w-3.5 h-3.5 rounded border-gray-600 bg-transparent text-blue-500 focus:ring-blue-500/30 focus:ring-1 cursor-pointer disabled:cursor-not-allowed"
      />

      <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>

      <button
        onClick={() => onPreview?.(doc)}
        className="flex-1 text-left min-w-0 flex items-center gap-2"
        disabled={!onPreview}
      >
        <span className="text-xs text-gray-200 truncate">{doc.fileName || 'Unnamed document'}</span>
        {hasVersionHistory && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onShowVersions(doc) }}
            className="text-[9px] text-blue-300 border border-blue-500/30 px-1 rounded flex-shrink-0 hover:bg-blue-500/10"
            title={`v${doc.versionNumber} — click for history`}
          >
            v{doc.versionNumber}
          </button>
        )}
      </button>

      <span className="text-[10px] text-gray-500 flex-shrink-0">{formatted}</span>

      {canEdit && (
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-white rounded"
            aria-label="Document actions"
          >
            ⋯
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl py-1 text-xs">
                {onUploadNewVersion && (
                  <button
                    onClick={() => { setMenuOpen(false); onUploadNewVersion(doc) }}
                    className="w-full text-left px-3 py-1.5 text-gray-200 hover:bg-white/5"
                  >
                    Upload new version
                  </button>
                )}
                <button
                  onClick={() => { setMenuOpen(false); onShowVersions(doc) }}
                  className="w-full text-left px-3 py-1.5 text-gray-200 hover:bg-white/5"
                >
                  Version history
                </button>
                <div className="h-px bg-white/5 my-1" />
                <button
                  onClick={() => { setMenuOpen(false); onRename(doc) }}
                  className="w-full text-left px-3 py-1.5 text-gray-200 hover:bg-white/5"
                >
                  Rename
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onMove(doc) }}
                  className="w-full text-left px-3 py-1.5 text-gray-200 hover:bg-white/5"
                >
                  Move to…
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onDelete(doc) }}
                  className="w-full text-left px-3 py-1.5 text-red-300 hover:bg-red-500/10"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}


function VaultLoadingState() {
  const message = useRotatingLoadingMessage({
    active: true,
    messages: DOCUMENTS_VAULT_LOADING_MESSAGES,
  })
  return (
    <div className="p-6 text-center text-gray-400">
      <div className="w-6 h-6 border-2 border-gray-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
      <span key={message}>{message}</span>
    </div>
  )
}
