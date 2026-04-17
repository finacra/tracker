'use client'

import { useCallback, useEffect, useState } from 'react'
import { initializeAndListFilings, updateFiling } from '../../actions-filings'
import { showToast } from '@/components/ui/Toast'
import AgentAssistedUploadModal from '../AgentAssistedUploadModal'

/**
 * Compliance Filing Register — the spreadsheet-style tracker view
 * from the CA's compliance template. Shows per-rule × per-period
 * filing status with editable financial columns.
 *
 * Data flows:
 *   initializeAndListFilings → auto-generates filing rows from
 *   applicable assessments → returns filings with rule metadata
 *   → this component groups + renders them.
 *
 * Upload button per row opens the agent modal pre-locked to the
 * rule's folder + requirement ID (Step 5.2 wiring).
 */

interface Props {
  companyId: string
  financialYear: string
  categoryFilter?: string
}

type Filing = Awaited<ReturnType<typeof initializeAndListFilings>>['filings'] extends (infer T)[] | undefined ? T : never

type EditingCell = {
  filingId: string
  field: string
  value: string
}

export default function ComplianceFilingView({ companyId, financialYear, categoryFilter }: Props) {
  const [filings, setFilings] = useState<Filing[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EditingCell | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [uploadForFiling, setUploadForFiling] = useState<Filing | null>(null)

  const fetchFilings = useCallback(async () => {
    setLoading(true)
    const res = await initializeAndListFilings(companyId, financialYear, categoryFilter || undefined)
    if (res.success && res.filings) {
      setFilings(res.filings)
      if (res.generated && res.generated.created > 0) {
        showToast(`${res.generated.created} new filing rows generated`, 'info')
      }
    }
    setLoading(false)
  }, [companyId, financialYear, categoryFilter])

  useEffect(() => { fetchFilings() }, [fetchFilings])

  // Group filings by category → rule name
  const grouped = filings.reduce((acc, f) => {
    const cat = f.rule.category
    if (!acc[cat]) acc[cat] = {}
    const ruleName = f.rule.name
    if (!acc[cat][ruleName]) acc[cat][ruleName] = { rule: f.rule, ruleId: f.ruleId, filings: [] }
    acc[cat][ruleName].filings.push(f)
    return acc
  }, {} as Record<string, Record<string, { rule: Filing['rule']; ruleId: string; filings: Filing[] }>>)

  const handleSaveCell = async (filingId: string, field: string, value: string) => {
    setSavingId(filingId)
    const data: Record<string, any> = {}

    if (['amountPayable', 'amountPaid', 'interestOnShort', 'interestOnLate'].includes(field)) {
      data[field] = value ? parseFloat(value) : null
    } else if (['dateOfPayment', 'dateOfFiling'].includes(field)) {
      data[field] = value || null
    } else {
      data[field] = value || null
    }

    const res = await updateFiling(companyId, filingId, data)
    if (res.success) {
      // Refresh to get auto-computed fields (days_delay, short_deduction)
      await fetchFilings()
    } else {
      showToast(res.error || 'Save failed', 'error')
    }
    setSavingId(null)
    setEditing(null)
  }

  const handleStatusChange = async (filingId: string, status: string) => {
    setSavingId(filingId)
    await updateFiling(companyId, filingId, { status })
    await fetchFilings()
    setSavingId(null)
  }

  const statusColor = (s: string) => {
    switch (s) {
      case 'filed': return 'bg-emerald-900/40 text-emerald-300'
      case 'overdue': return 'bg-red-900/40 text-red-300'
      case 'partially_filed': return 'bg-amber-900/40 text-amber-300'
      case 'not_due': return 'bg-gray-800 text-gray-400'
      default: return 'bg-gray-800 text-gray-300'
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-400">
        <div className="w-8 h-8 border-2 border-gray-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        Generating filing register...
      </div>
    )
  }

  if (filings.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        <p>No applicable filings for {financialYear}.</p>
        <p className="text-xs mt-2">Run the applicability evaluator first to determine which compliances apply to this company.</p>
      </div>
    )
  }

  const categories = Object.keys(grouped).sort()

  return (
    <div className="space-y-6">
      {categories.map(category => (
        <div key={category} className="border border-gray-800 rounded-xl overflow-hidden">
          {/* Category header */}
          <div className="bg-gray-900/70 px-4 py-3 border-b border-gray-800">
            <h3 className="text-sm font-medium text-white">{category}</h3>
            <span className="text-[10px] text-gray-500">
              {Object.keys(grouped[category]).length} compliance{Object.keys(grouped[category]).length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Rules within category */}
          {Object.entries(grouped[category]).map(([ruleName, { rule, ruleId, filings: ruleFilings }]) => (
            <div key={ruleId} className="border-b border-gray-800/50 last:border-b-0">
              {/* Rule sub-header */}
              <div className="px-4 py-2 bg-gray-900/30 flex items-center justify-between">
                <div>
                  <span className="text-xs text-white font-medium">{ruleName}</span>
                  <span className="text-[10px] text-gray-500 ml-2">{rule.sectionRef}</span>
                  {rule.isCritical && <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-red-900/30 text-red-300 rounded">Critical</span>}
                </div>
                <span className="text-[10px] text-gray-500">{rule.dueDescription}</span>
              </div>

              {/* Filing rows table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 text-[10px] uppercase tracking-wider">
                      <th className="px-3 py-2 text-left w-20">Period</th>
                      <th className="px-3 py-2 text-left w-24">Due Date</th>
                      <th className="px-3 py-2 text-left w-20">Status</th>
                      <th className="px-3 py-2 text-right w-24">Payable</th>
                      <th className="px-3 py-2 text-right w-24">Paid</th>
                      <th className="px-3 py-2 text-right w-20">Short</th>
                      <th className="px-3 py-2 text-left w-24">Date Filed</th>
                      <th className="px-3 py-2 text-right w-16">Delay</th>
                      <th className="px-3 py-2 text-right w-20">Interest</th>
                      <th className="px-3 py-2 text-left w-28">Challan</th>
                      <th className="px-3 py-2 text-left w-28">Ack/SRN</th>
                      <th className="px-3 py-2 text-left w-24">Working</th>
                      <th className="px-3 py-2 text-center w-16">Doc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ruleFilings.map(f => (
                      <tr key={f.id} className="border-t border-gray-800/30 hover:bg-gray-900/20">
                        <td className="px-3 py-2 text-gray-300 font-mono">{f.periodKey}</td>
                        <td className="px-3 py-2 text-gray-400">{f.dueDate || '—'}</td>
                        <td className="px-3 py-2">
                          <select
                            value={f.status}
                            onChange={e => handleStatusChange(f.id, e.target.value)}
                            disabled={savingId === f.id}
                            className={`text-[10px] px-1.5 py-0.5 rounded border-0 cursor-pointer ${statusColor(f.status)}`}
                          >
                            <option value="pending">Pending</option>
                            <option value="filed">Filed</option>
                            <option value="overdue">Overdue</option>
                            <option value="partially_filed">Partial</option>
                            <option value="not_due">Not Due</option>
                          </select>
                        </td>
                        <EditableCell filing={f} field="amountPayable" type="number" editing={editing} setEditing={setEditing} onSave={handleSaveCell} savingId={savingId} />
                        <EditableCell filing={f} field="amountPaid" type="number" editing={editing} setEditing={setEditing} onSave={handleSaveCell} savingId={savingId} />
                        <td className="px-3 py-2 text-right text-gray-400">
                          {f.shortDeduction != null ? `₹${f.shortDeduction.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <EditableCell filing={f} field="dateOfFiling" type="date" editing={editing} setEditing={setEditing} onSave={handleSaveCell} savingId={savingId} />
                        <td className="px-3 py-2 text-right">
                          {f.daysDelay != null ? (
                            <span className={f.daysDelay > 0 ? 'text-red-300' : 'text-emerald-300'}>
                              {f.daysDelay > 0 ? `${f.daysDelay}d` : 'On time'}
                            </span>
                          ) : '—'}
                        </td>
                        <EditableCell filing={f} field="interestOnLate" type="number" editing={editing} setEditing={setEditing} onSave={handleSaveCell} savingId={savingId} />
                        <EditableCell filing={f} field="challanNumber" type="text" editing={editing} setEditing={setEditing} onSave={handleSaveCell} savingId={savingId} />
                        <EditableCell filing={f} field="acknowledgement" type="text" editing={editing} setEditing={setEditing} onSave={handleSaveCell} savingId={savingId} />
                        <EditableCell filing={f} field="workingNotes" type="text" editing={editing} setEditing={setEditing} onSave={handleSaveCell} savingId={savingId} />
                        <td className="px-3 py-2 text-center">
                          {f.documentId ? (
                            <span className="text-emerald-300 text-[10px]" title="Document linked">✓</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setUploadForFiling(f)}
                              className="text-[10px] text-gray-400 hover:text-white px-1.5 py-0.5 border border-gray-700 rounded hover:border-gray-500 transition-colors"
                              title="Upload document for this filing"
                            >
                              ↑
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Step 5.2: Upload modal pre-locked to the selected filing's rule */}
      {uploadForFiling && (
        <AgentAssistedUploadModal
          isOpen={true}
          companyId={companyId}
          defaultRequirementId={uploadForFiling.ruleId}
          onClose={() => setUploadForFiling(null)}
          onFinalized={() => {
            setUploadForFiling(null)
            fetchFilings()
          }}
        />
      )}
    </div>
  )
}

// ── Inline editable cell ──────────────────────────────────────────────────

function EditableCell({ filing, field, type, editing, setEditing, onSave, savingId }: {
  filing: Filing
  field: string
  type: 'text' | 'number' | 'date'
  editing: EditingCell | null
  setEditing: (e: EditingCell | null) => void
  onSave: (filingId: string, field: string, value: string) => void
  savingId: string | null
}) {
  const rawValue = (filing as any)[field]
  const displayValue = type === 'number' && rawValue != null
    ? `₹${Number(rawValue).toLocaleString('en-IN')}`
    : rawValue || '—'

  const isEditing = editing?.filingId === filing.id && editing.field === field
  const isSaving = savingId === filing.id

  if (isEditing) {
    return (
      <td className="px-1 py-1">
        <input
          type={type}
          defaultValue={rawValue ?? ''}
          autoFocus
          className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-xs"
          onBlur={e => onSave(filing.id, field, e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onSave(filing.id, field, (e.target as HTMLInputElement).value)
            if (e.key === 'Escape') setEditing(null)
          }}
        />
      </td>
    )
  }

  return (
    <td
      className={`px-3 py-2 cursor-pointer hover:bg-gray-800/50 transition-colors ${
        type === 'number' ? 'text-right' : 'text-left'
      } ${rawValue ? 'text-gray-300' : 'text-gray-600'}`}
      onClick={() => !isSaving && setEditing({ filingId: filing.id, field, value: String(rawValue ?? '') })}
      title="Click to edit"
    >
      {displayValue}
    </td>
  )
}
