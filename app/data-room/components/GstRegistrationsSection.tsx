'use client'

import { useEffect, useState } from 'react'
import { parseGSTN, validateGSTN } from '@/lib/utils/gstn'
import { showToast } from '@/components/ui/Toast'
import {
  listGstRegistrations,
  addGstRegistration,
  updateGstRegistration,
  deleteGstRegistration,
  type GstRegistrationDto,
} from '../actions-gst'

interface Props {
  companyId: string
}

type EditingState = { id: string; gstin: string } | null

export default function GstRegistrationsSection({ companyId }: Props) {
  const [loading, setLoading] = useState(true)
  const [homeState, setHomeState] = useState<string | null>(null)
  const [rows, setRows] = useState<GstRegistrationDto[]>([])
  const [newGstin, setNewGstin] = useState('')
  const [editing, setEditing] = useState<EditingState>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listGstRegistrations(companyId).then((res) => {
      if (cancelled) return
      if (res.success) {
        setHomeState(res.homeState || null)
        setRows(res.registrations || [])
      } else {
        showToast(res.error || 'Failed to load GSTINs', 'error')
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [companyId])

  const classify = (state: string) => {
    if (!state || !homeState) return null
    return state.toLowerCase() === homeState.toLowerCase() ? 'within' : 'outside'
  }

  const within = rows.filter((r) => classify(r.state) === 'within')
  const outside = rows.filter((r) => classify(r.state) === 'outside')
  const unclassified = rows.filter((r) => classify(r.state) === null)

  const handleAdd = async () => {
    const gstin = newGstin.toUpperCase().trim()
    if (!validateGSTN(gstin)) {
      showToast('Invalid GSTIN format', 'error')
      return
    }
    setBusyId('__new')
    const res = await addGstRegistration(companyId, gstin)
    setBusyId(null)
    if (res.success && res.registration) {
      setRows((prev) => [...prev, res.registration!])
      setNewGstin('')
      showToast(`GSTIN added (${res.registration.state})`, 'success')
    } else {
      showToast(res.error || 'Failed to add GSTIN', 'error')
    }
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    const gstin = editing.gstin.toUpperCase().trim()
    if (!validateGSTN(gstin)) {
      showToast('Invalid GSTIN format', 'error')
      return
    }
    setBusyId(editing.id)
    const res = await updateGstRegistration(companyId, editing.id, gstin)
    setBusyId(null)
    if (res.success && res.registration) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? res.registration! : r)))
      setEditing(null)
      showToast('GSTIN updated', 'success')
    } else {
      showToast(res.error || 'Failed to update GSTIN', 'error')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this GSTIN?')) return
    setBusyId(id)
    const res = await deleteGstRegistration(companyId, id)
    setBusyId(null)
    if (res.success) {
      setRows((prev) => prev.filter((r) => r.id !== id))
      showToast('GSTIN deleted', 'success')
    } else {
      showToast(res.error || 'Failed to delete GSTIN', 'error')
    }
  }

  const renderRow = (r: GstRegistrationDto) => {
    const klass = classify(r.state)
    const isEditing = editing?.id === r.id
    return (
      <div key={r.id} className="flex items-center gap-3 px-4 py-3 bg-bg-card/50 border border-line/10 rounded-lg">
        {isEditing ? (
          <input
            type="text"
            value={editing!.gstin}
            onChange={(e) => setEditing({ id: r.id, gstin: e.target.value.toUpperCase().slice(0, 15) })}
            maxLength={15}
            className="flex-1 px-3 py-2 bg-bg-card border border-line/15 rounded text-fg-primary text-sm font-mono uppercase focus:outline-none focus:border-line/40"
            autoFocus
          />
        ) : (
          <span className="flex-1 font-mono text-sm text-fg-primary tracking-wider">{r.gstin}</span>
        )}
        <span className="w-40 text-sm text-fg-secondary truncate">{r.state || '—'}</span>
        {klass && (
          <span className={`text-[10px] px-2 py-0.5 rounded ${klass === 'within' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-amber-900/40 text-amber-300'}`}>
            {klass === 'within' ? 'Within State' : 'Outside State'}
          </span>
        )}
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={busyId === r.id}
                className="px-3 py-1 text-xs bg-white text-black rounded hover:bg-bg-elevated disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-3 py-1 text-xs text-fg-muted hover:text-fg-primary"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing({ id: r.id, gstin: r.gstin })}
                className="px-2 py-1 text-xs text-fg-muted hover:text-fg-primary transition-colors"
                aria-label={`Edit ${r.gstin}`}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleDelete(r.id)}
                disabled={busyId === r.id}
                className="px-2 py-1 text-xs text-fg-muted hover:text-red-400 transition-colors disabled:opacity-50"
                aria-label={`Delete ${r.gstin}`}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  const addPreview = newGstin.length === 15 ? parseGSTN(newGstin.toUpperCase())?.stateName : null

  return (
    <div className="bg-bg-card border border-line/10 rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-light text-fg-primary">GST Registrations</h3>
          <p className="text-fg-muted text-sm mt-1">
            {rows.length === 0
              ? 'No GSTINs yet. Add one below.'
              : `${rows.length} GSTIN${rows.length === 1 ? '' : 's'}`}
            {homeState ? ` · Home state: ${homeState}` : ' · Home state not set — classification unavailable'}
          </p>
        </div>
      </div>

      {/* Add form */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={newGstin}
          onChange={(e) => setNewGstin(e.target.value.toUpperCase().slice(0, 15))}
          placeholder="22AAAAA0000A1Z5"
          maxLength={15}
          className="flex-1 px-3 py-2 bg-bg-card border border-line/15 rounded-lg text-fg-primary text-sm font-mono uppercase focus:outline-none focus:border-line/40"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
        />
        <div className="w-40 px-3 py-2 text-xs text-fg-muted truncate">
          {addPreview || (newGstin.length === 15 ? 'Invalid GSTIN' : '—')}
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={busyId === '__new' || newGstin.length !== 15}
          className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-bg-elevated transition-colors disabled:opacity-50"
        >
          {busyId === '__new' ? 'Adding…' : 'Add GSTIN'}
        </button>
      </div>

      {/* List, grouped */}
      {loading ? (
        <div className="text-fg-muted text-sm py-4">Loading…</div>
      ) : rows.length === 0 ? null : (
        <div className="space-y-4">
          {within.length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-fg-muted mb-2">Within State</h4>
              <div className="space-y-2">{within.map(renderRow)}</div>
            </div>
          )}
          {outside.length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-fg-muted mb-2">Outside State</h4>
              <div className="space-y-2">{outside.map(renderRow)}</div>
            </div>
          )}
          {unclassified.length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-fg-muted mb-2">Unclassified</h4>
              <div className="space-y-2">{unclassified.map(renderRow)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
