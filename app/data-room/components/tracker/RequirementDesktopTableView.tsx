'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { IRegulatoryService } from '../../services/RegulatoryService'
import { showToast } from '@/components/ui/Toast'
import { updateRequirement } from '@/app/data-room/actions'
import { stripPeriodSuffix } from '@/lib/utils/strip-period-suffix'
import { getDocumentSignedUrl } from '@/app/data-room/actions-vault'

async function openDocInNewTab(companyId: string, documentId: string) {
  const res = await getDocumentSignedUrl(companyId, documentId).catch(() => null)
  if (!res || !res.success || !res.url) {
    showToast(res?.error || 'Could not open document', 'error')
    return
  }
  window.open(res.url, '_blank', 'noopener,noreferrer')
}

interface Requirement {
  id: string
  requirement: string
  description?: string | null
  category?: string | null
  status: string
  dueDate: string
  penalty?: string | null
  penalty_base_amount?: number | null
  isCritical?: boolean
  compliance_type?: string | null
  filed_on?: string | null
  filed_by?: string | null
  filed_by_name?: string | null
  status_reason?: string | null
  possible_legal_action?: string | null
  amount_payable?: number | null
  amount_paid?: number | null
  filing_document_id?: string | null
  [key: string]: any
}

interface RequirementDesktopTableViewProps {
  groupedByCategory: Array<{
    category: string
    items: Requirement[]
  }>
  filteredRequirements: Requirement[]
  canEdit: boolean
  canManage?: boolean
  vaultDocuments?: any[]
  selectedRequirements: Set<string>
  setSelectedRequirements: (updater: (prev: Set<string>) => Set<string>) => void
  handleStatusChange: (requirementId: string, newStatus: 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed') => Promise<void>
  regulatoryService: IRegulatoryService
  currentCompany: { id: string } | null
  setHiddenCompliances: (updater: (prev: Set<string>) => Set<string>) => void
  setRegulatoryRequirements: React.Dispatch<React.SetStateAction<any[]>>
  regulatoryRequirements: Requirement[]
  setEditingRequirement: (req: Requirement | null) => void
  setRequirementForm: (form: any) => void
  setIsEditModalOpen: (open: boolean) => void
  setComplianceDetailsModal: (req: Requirement | null) => void
  setDocumentUploadModal: (modal: any) => void
  calculateDelay: (dueDate: string, status: string) => number | null
  calculatePenalty: (penaltyStr: string | null, daysDelayed: number | null, penaltyBaseAmount?: number | null, penaltyConfig?: Record<string, unknown> | null) => any
  getFormFrequency: (requirement: string) => string | null
  getRelevantLegalSections: (requirement: string, category: string | null | undefined) => string[]
  getAuthorityForCategory: (category: string | null | undefined) => string | null
}

export default function RequirementDesktopTableView({
  groupedByCategory,
  filteredRequirements,
  canEdit,
  canManage,
  vaultDocuments = [],
  selectedRequirements,
  setSelectedRequirements,
  handleStatusChange,
  regulatoryService,
  currentCompany,
  setHiddenCompliances,
  setRegulatoryRequirements,
  regulatoryRequirements,
  setEditingRequirement,
  setRequirementForm,
  setIsEditModalOpen,
  setComplianceDetailsModal,
  setDocumentUploadModal,
  calculateDelay,
  calculatePenalty,
  getFormFrequency,
  getRelevantLegalSections,
  getAuthorityForCategory
}: RequirementDesktopTableViewProps) {
  const [baseAmountInputs, setBaseAmountInputs] = useState<Record<string, string>>({})
  const [savingBaseAmount, setSavingBaseAmount] = useState<Record<string, boolean>>({})
  const [openDocChecklist, setOpenDocChecklist] = useState<string | null>(null)
  // Coords for the doc-checklist popover. Computed from the trigger
  // button's bounding rect at click time. The popover uses
  // position:fixed so it escapes the form-bucket card's
  // `overflow-hidden` (which previously clipped it — the user saw
  // half the popover hidden behind the next row).
  const [docChecklistCoords, setDocChecklistCoords] = useState<{ top: number; left: number } | null>(null)

  // Match a vault doc against a required-doc slot. The agent's
  // `document_type` (e.g. "Form 26Q", "PAN Card") is a SHORT label;
  // the rule's `required_documents` entries are LONG descriptive
  // strings (e.g. "Form 140 (salary + non-salary TDS; formerly 24Q/26Q)").
  // Pure exact-string matching never connects them — even when the
  // doc is correctly linked to the requirement.
  //
  // Token-overlap match: tokenize both, require the SHORTER side's
  // distinctive tokens (length ≥ 2, alphanumeric) to all appear in
  // the LONGER side. Stop-words (form, the, of, etc.) are excluded
  // so "Form 26Q" still demands "26q" present in the required text,
  // and matches "...formerly 24Q/26Q" because "26q" appears there.
  const STOP = new Set(['form', 'the', 'of', 'and', 'or', 'a', 'an', 'for', 'in', 'to'])
  function tokensOf(s: string): string[] {
    return (s || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(t => t.length >= 2 && !STOP.has(t))
  }
  function docMatchesSlot(docType: string, requiredName: string): boolean {
    const dt = tokensOf(docType)
    const rn = tokensOf(requiredName)
    if (dt.length === 0 || rn.length === 0) return false
    // All distinctive tokens of the shorter side must appear in the longer.
    const shorter = dt.length <= rn.length ? dt : rn
    const longerSet = new Set(dt.length <= rn.length ? rn : dt)
    return shorter.every(t => longerSet.has(t))
  }

  const isDocUploaded = (reqId: string, requiredName: string): boolean => {
    return !!findDocForSlot(reqId, requiredName)
  }

  /**
   * Returns the first vault doc satisfying a (requirement, slot) pair.
   * Used to wire the "View" link in the doc-checklist popover so the
   * user can open the actual file behind a checked slot.
   */
  function findDocForSlot(reqId: string, requiredName: string): any | null {
    for (const d of vaultDocuments) {
      const rid = d.requirement_id || d.requirementId
      if (rid !== reqId) continue
      if (docMatchesSlot(d.document_type || '', requiredName)) return d
    }
    return null
  }

  const docsByRequirement = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const d of vaultDocuments) {
      const rid = d.requirement_id || d.requirementId
      if (!rid) continue
      if (!map.has(rid)) map.set(rid, [])
      map.get(rid)!.push(d)
    }
    return map
  }, [vaultDocuments])

  const saveAmount = async (req: Requirement, field: 'amount_payable' | 'amount_paid', raw: string) => {
    const parsed = raw.trim() === '' ? null : Number(raw)
    if (parsed !== null && (isNaN(parsed) || parsed < 0)) {
      showToast('Enter a valid amount', 'error')
      return
    }
    // Optimistic: update the row immediately so Payable/Paid/Auto-calc
    // all reflect the new number before the DB round trip completes.
    // Previously this waited ~200-500ms on Vercel which felt broken.
    const prevValue = (req as any)[field] ?? null
    setRegulatoryRequirements(prev => prev.map(r => r.id === req.id ? { ...r, [field]: parsed } : r))
    const result = await updateRequirement(req.id, currentCompany?.id || null, { [field]: parsed } as any)
    if (!result.success) {
      // Roll back on failure and surface the error
      setRegulatoryRequirements(prev => prev.map(r => r.id === req.id ? { ...r, [field]: prevValue } : r))
      showToast(result.error || 'Failed to save', 'error')
    }
  }

  const computeAutoCalc = (req: Requirement) => {
    const payable = typeof req.amount_payable === 'number' ? req.amount_payable : null
    const paid = typeof req.amount_paid === 'number' ? req.amount_paid : null
    const short = payable != null && paid != null ? Math.max(0, payable - paid) : null
    const delay = calculateDelay(req.dueDate, req.status) ?? 0
    const monthsLate = Math.max(1, Math.ceil(delay / 30))
    // IT Act rates used by filing register: 1.5% p.m. interest on late deposit, 1% p.m. on short
    const interestLate = delay > 0 && paid ? Math.round(paid * 0.015 * monthsLate) : 0
    const interestShort = short && short > 0 ? Math.round(short * 0.01 * monthsLate) : 0
    return { short, delay, interestLate, interestShort, total: interestLate + interestShort }
  }

  return (
    <table className="hidden sm:table w-full">
      <thead className="bg-black border-b border-white/10">
        <tr>
          {canEdit && (
            <th className="px-4 py-4 text-left text-xs font-medium text-fg-muted uppercase tracking-wider w-12">
              <input
                type="checkbox"
                checked={filteredRequirements.length > 0 && filteredRequirements.every((req: Requirement) => selectedRequirements.has(req.id))}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedRequirements(() => new Set(filteredRequirements.map((req: Requirement) => req.id)))
                  } else {
                    setSelectedRequirements(() => new Set())
                  }
                }}
                className="w-4 h-4 rounded border-line/30 bg-bg-elevated text-white focus:ring-white/40 focus:ring-2 cursor-pointer"
              />
            </th>
          )}
          <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase tracking-wider">
            REQUIREMENT
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase tracking-wider">
            STATUS
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase tracking-wider">
            DUE DATE
          </th>
          <th className="px-4 py-4 text-right text-xs font-medium text-fg-muted uppercase tracking-wider">
            PAYABLE (₹)
          </th>
          <th className="px-4 py-4 text-right text-xs font-medium text-fg-muted uppercase tracking-wider">
            PAID (₹)
          </th>
          <th className="px-4 py-4 text-right text-xs font-medium text-fg-muted uppercase tracking-wider hidden md:table-cell">
            AUTO-CALC
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase tracking-wider hidden md:table-cell">
            DOCS
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase tracking-wider hidden lg:table-cell">
            PENALTY
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase tracking-wider hidden lg:table-cell">
            CALC PENALTY
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase tracking-wider hidden xl:table-cell">
            LEGAL ACTION
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase tracking-wider hidden lg:table-cell">
            FILED ON
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase tracking-wider hidden xl:table-cell">
            FILED BY
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase tracking-wider hidden xl:table-cell">
            STATUS REASON
          </th>
          {canEdit && (
            <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase tracking-wider">
              ACTIONS
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {groupedByCategory.map((group, groupIndex) => (
          <React.Fragment key={group.category}>
            {/* Visual Separator between categories */}
            {groupIndex > 0 && (
              <tr>
                <td colSpan={canEdit ? 14 : 13} className="px-0 py-0">
                  <div className="h-0.5 bg-gradient-to-r from-transparent via-white/30 to-transparent my-2"></div>
                </td>
              </tr>
            )}
            {/* Category Items */}
            {group.items.map((req: Requirement, itemIndex: number) => {
              const formFreq = getFormFrequency(req.requirement)
              const legalSections = getRelevantLegalSections(req.requirement, req.category)
              const authority = getAuthorityForCategory(req.category)

              return (
                <tr key={`${group.category}-${req.id}-${itemIndex}`} className="hover:bg-black/50 transition-colors border-t border-white/10">
                  {canEdit && (
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedRequirements.has(req.id)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedRequirements)
                          if (e.target.checked) {
                            newSelected.add(req.id)
                          } else {
                            newSelected.delete(req.id)
                          }
                          setSelectedRequirements(() => newSelected)
                        }}
                        className="w-4 h-4 rounded border-line/30 bg-bg-elevated text-white focus:ring-white/40 focus:ring-2 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <div className="flex items-start gap-2">
                      {(req.isCritical || req.status === 'overdue') && (
                        <svg
                          width="16"
                          height="16"
                          className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      )}
                      <div className="min-w-0 flex-1">
                        <div
                          className="text-white font-medium text-sm leading-snug truncate"
                          title={req.requirement}
                        >
                          {stripPeriodSuffix(req.requirement) || req.requirement}
                        </div>
                        {(formFreq || authority || legalSections.length > 0 || req.description) && (
                          <button
                            onClick={() => setComplianceDetailsModal(req)}
                            className="mt-1 text-fg-muted hover:text-fg-secondary text-[11px] flex items-center gap-1 transition-colors"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="16" x2="12" y2="12" />
                              <line x1="12" y1="8" x2="12.01" y2="8" />
                            </svg>
                            Details
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {canEdit ? (
                      <select
                        value={req.status}
                        onChange={(e) => handleStatusChange(req.id, e.target.value as 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed')}
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-normal transition-colors cursor-pointer ${req.status === 'completed'
                            ? 'bg-green-500/10 text-green-400/90 hover:bg-green-500/20'
                            : req.status === 'overdue'
                              ? 'bg-red-500/10 text-red-400/90 hover:bg-red-500/20'
                              : req.status === 'pending'
                                ? 'bg-yellow-500/10 text-yellow-400/90 hover:bg-yellow-500/20'
                                : req.status === 'upcoming'
                                  ? 'bg-blue-500/10 text-blue-400/90 hover:bg-blue-500/20'
                                  : 'bg-white/5 text-fg-muted hover:bg-white/10'
                          }`}
                        style={{
                          appearance: 'none',
                          backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 6px center',
                          paddingRight: '22px'
                        }}
                      >
                        <option value="not_started">NOT STARTED</option>
                        <option value="upcoming">UPCOMING</option>
                        <option value="pending">PENDING</option>
                        <option value="overdue">OVERDUE</option>
                        <option value="completed">COMPLETED</option>
                      </select>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-normal ${req.status === 'completed'
                            ? 'bg-green-500/10 text-green-400/90'
                            : req.status === 'overdue'
                              ? 'bg-red-500/10 text-red-400/90'
                              : req.status === 'pending'
                                ? 'bg-yellow-500/10 text-yellow-400/90'
                                : req.status === 'upcoming'
                                  ? 'bg-blue-500/10 text-blue-400/90'
                                  : 'bg-white/5 text-fg-muted'
                          }`}
                      >
                        {req.status === 'completed'
                          ? 'COMPLETED'
                          : req.status === 'overdue'
                            ? 'OVERDUE'
                            : req.status === 'pending'
                              ? 'PENDING'
                              : req.status === 'upcoming'
                                ? 'UPCOMING'
                                : 'NOT STARTED'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {(() => {
                      if (!req.dueDate) {
                        return <span className="text-fg-muted text-sm italic">No due date</span>
                      }
                      const daysDelayed = calculateDelay(req.dueDate, req.status)
                      return (
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2 text-white">
                            <svg
                              width="16"
                              height="16"
                              className="w-4 h-4 flex-shrink-0 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                            <span className="text-sm font-mono tabular-nums whitespace-nowrap">{req.dueDate}</span>
                          </div>
                          {daysDelayed !== null && daysDelayed > 0 && (
                            <div className="text-red-400 text-xs mt-1 ml-6">
                              Delayed by {daysDelayed} {daysDelayed === 1 ? 'day' : 'days'}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </td>
                  {/* PAYABLE (₹) — inline editable */}
                  <td className="px-4 py-4 text-right align-middle">
                    <AmountInputCell
                      value={req.amount_payable ?? null}
                      canEdit={canEdit}
                      placeholder="₹ 0"
                      onSave={(raw) => saveAmount(req, 'amount_payable', raw)}
                    />
                  </td>
                  {/* PAID (₹) — always-on inline input */}
                  <td className="px-4 py-4 text-right align-middle">
                    <AmountInputCell
                      value={req.amount_paid ?? null}
                      canEdit={canEdit}
                      placeholder="₹ 0"
                      onSave={(raw) => saveAmount(req, 'amount_paid', raw)}
                    />
                  </td>
                  {/* AUTO-CALC: delay, short, interest */}
                  <td className="px-4 py-4 text-right text-xs hidden md:table-cell">
                    {(() => {
                      const calc = computeAutoCalc(req)
                      const nothing = calc.short === null && calc.delay === 0 && calc.total === 0
                      if (nothing) return <span className="text-fg-muted/60">—</span>
                      return (
                        <div className="space-y-0.5 text-[11px]">
                          {calc.short != null && calc.short > 0 && (
                            <div className="text-amber-400">Short: ₹{calc.short.toLocaleString('en-IN')}</div>
                          )}
                          {calc.delay > 0 && (
                            <div className="text-red-300">Delay: {calc.delay}d</div>
                          )}
                          {calc.total > 0 && (
                            <div className="text-fg-secondary">Interest: ₹{calc.total.toLocaleString('en-IN')}</div>
                          )}
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell">
                    {/* Documents Required Column — clickable checklist */}
                    {(() => {
                      const requiredDocs = (req as any).required_documents || []
                      if (!Array.isArray(requiredDocs) || requiredDocs.length === 0) {
                        return <div className="text-fg-muted text-sm">-</div>
                      }
                      const slotMatchCount = requiredDocs.filter((doc: string) => isDocUploaded(req.id, doc)).length
                      // If the doc is linked to the requirement but doesn't
                      // match a specific required-doc slot (agent
                      // document_type vs CA-friendly long names), we still
                      // want the count to reflect "user uploaded something".
                      // Cap at requiredDocs.length so the chip never overflows.
                      const linkedDocsCount = (docsByRequirement.get(req.id) || []).length
                      const uploadedCount = Math.min(
                        Math.max(slotMatchCount, linkedDocsCount),
                        requiredDocs.length
                      )
                      const allDone = uploadedCount === requiredDocs.length
                      const isOpen = openDocChecklist === req.id
                      return (
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              if (isOpen) {
                                setOpenDocChecklist(null)
                                setDocChecklistCoords(null)
                              } else {
                                const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                                // Default: anchor the popover's top-left to
                                // the button's bottom-left + 4px gap. Cap
                                // left so a 320px-wide popover stays in
                                // viewport (16px right margin).
                                const popoverWidth = 320
                                const maxLeft = window.innerWidth - popoverWidth - 16
                                setDocChecklistCoords({
                                  top: Math.round(r.bottom + 4),
                                  left: Math.max(8, Math.min(Math.round(r.left), maxLeft)),
                                })
                                setOpenDocChecklist(req.id)
                              }
                            }}
                            className={`px-2.5 py-1.5 text-xs rounded-lg border flex items-center gap-1.5 transition-colors ${
                              allDone
                                ? 'bg-green-500/15 text-green-400 border-green-500/30'
                                : uploadedCount > 0
                                  ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                                  : 'bg-bg-elevated text-fg-muted border-line/15 hover:border-line/40 hover:text-white'
                            }`}
                            title={allDone ? 'All required documents uploaded' : 'Click to upload required documents'}
                          >
                            {allDone ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              // Cloud-upload icon — reads clearly as "upload here"
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 15a4 4 0 004 4h10a5 5 0 001-9.9A6 6 0 007 10a4 4 0 00-4 5z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 12v6m0-6l-2.5 2.5M12 12l2.5 2.5" />
                              </svg>
                            )}
                            <span className="font-medium">
                              {allDone ? 'All uploaded' : `${uploadedCount}/${requiredDocs.length} · Upload`}
                            </span>
                          </button>
                          {/* Click popup checklist — position:fixed so it
                              escapes the form-bucket card's overflow-hidden.
                              Coords were captured from the trigger's
                              bounding rect at click time. */}
                          {isOpen && docChecklistCoords && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => { setOpenDocChecklist(null); setDocChecklistCoords(null) }} />
                              <div
                                className="fixed z-50 w-80 bg-bg-card border border-line/15 rounded-xl shadow-2xl p-4"
                                style={{ top: docChecklistCoords.top, left: docChecklistCoords.left }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="text-sm font-medium text-fg-secondary flex items-center gap-2">
                                    <svg className="w-4 h-4 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                    Required Documents
                                  </div>
                                  <button onClick={() => { setOpenDocChecklist(null); setDocChecklistCoords(null) }} className="text-fg-muted hover:text-fg-secondary p-0.5">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                </div>
                                <div className="text-[10px] text-fg-muted mb-3">{uploadedCount} of {requiredDocs.length} uploaded</div>
                                <div className="space-y-2">
                                  {requiredDocs.map((doc: string, idx: number) => {
                                    const matchedDoc = findDocForSlot(req.id, doc)
                                    const uploaded = !!matchedDoc
                                    return (
                                      <div key={idx} className={`flex items-start gap-2.5 p-2 rounded-lg ${uploaded ? 'bg-green-500/5' : 'bg-bg-elevated/50'}`}>
                                        {uploaded ? (
                                          <svg className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                        ) : (
                                          <div className="w-4 h-4 rounded border border-line/30 flex-shrink-0 mt-0.5" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <div className={`text-xs ${uploaded ? 'text-green-400/90' : 'text-fg-secondary'}`}>{doc}</div>
                                          {!uploaded && (
                                            <button
                                              onClick={() => {
                                                setOpenDocChecklist(null)
                                                setDocChecklistCoords(null)
                                                setDocumentUploadModal({
                                                  isOpen: true,
                                                  requirementId: req.id,
                                                  requirement: req.requirement,
                                                  category: req.category,
                                                  documentName: doc,
                                                  complianceType: req.compliance_type || 'one-time',
                                                  dueDate: req.dueDate,
                                                  financialYear: (req as any).financial_year || null,
                                                  allRequiredDocs: requiredDocs
                                                })
                                              }}
                                              className="text-[11px] text-blue-400 hover:text-blue-300 mt-0.5 flex items-center gap-1"
                                            >
                                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                              Upload
                                            </button>
                                          )}
                                          {uploaded && matchedDoc && currentCompany && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                openDocInNewTab(currentCompany.id, matchedDoc.id)
                                              }}
                                              className="text-[11px] text-blue-400 hover:text-blue-300 mt-0.5 flex items-center gap-1"
                                            >
                                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                              View
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell">
                    <div
                      className="text-fg-muted text-xs truncate max-w-[140px]"
                      title={req.penalty || ''}
                    >
                      {req.penalty || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell">
                    {(() => {
                      const daysDelayed = calculateDelay(req.dueDate, req.status)
                      const calculatedPenalty = calculatePenalty(req.penalty || null, daysDelayed, req.penalty_base_amount, req.penalty_config)
                      const needsBaseAmount =
                        calculatedPenalty.startsWith('Cannot calculate - Please provide') ||
                        calculatedPenalty.includes('Needs')
                      if (needsBaseAmount && canEdit) {
                        const inputVal = baseAmountInputs[req.id] ?? ''
                        const isSaving = savingBaseAmount[req.id] ?? false
                        return (
                          <div className="space-y-1.5 min-w-[160px]">
                            <div className="text-yellow-400 text-[10px] leading-tight">Base amount required</div>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={inputVal}
                                onChange={e => setBaseAmountInputs(prev => ({ ...prev, [req.id]: e.target.value }))}
                                placeholder="e.g. 50000"
                                className="w-24 px-2 py-1 text-xs bg-bg-elevated border border-line/30 rounded text-white placeholder:text-fg-muted focus:outline-none focus:border-white/40"
                                onKeyDown={async e => {
                                  if (e.key === 'Enter') {
                                    const amount = parseFloat(inputVal)
                                    if (!isNaN(amount) && amount > 0) {
                                      setSavingBaseAmount(prev => ({ ...prev, [req.id]: true }))
                                      try {
                                        const result = await updateRequirement(req.id, currentCompany?.id || null, { penalty_base_amount: amount })
                                        if (result.success) {
                                          setRegulatoryRequirements(prev => prev.map(r => r.id === req.id ? { ...r, penalty_base_amount: amount } : r))
                                          setBaseAmountInputs(prev => { const n = { ...prev }; delete n[req.id]; return n })
                                          showToast('Base amount saved', 'success')
                                        } else {
                                          showToast(result.error || 'Failed to save', 'error')
                                        }
                                      } catch {
                                        showToast('Failed to save base amount', 'error')
                                      } finally {
                                        setSavingBaseAmount(prev => ({ ...prev, [req.id]: false }))
                                      }
                                    }
                                  }
                                }}
                              />
                              <button
                                disabled={isSaving || !inputVal}
                                onClick={async () => {
                                  const amount = parseFloat(inputVal)
                                  if (isNaN(amount) || amount <= 0) return
                                  setSavingBaseAmount(prev => ({ ...prev, [req.id]: true }))
                                  try {
                                    const result = await updateRequirement(req.id, currentCompany?.id || null, { penalty_base_amount: amount })
                                    if (result.success) {
                                      setRegulatoryRequirements(prev => prev.map(r => r.id === req.id ? { ...r, penalty_base_amount: amount } : r))
                                      setBaseAmountInputs(prev => { const n = { ...prev }; delete n[req.id]; return n })
                                      showToast('Base amount saved', 'success')
                                    } else {
                                      showToast(result.error || 'Failed to save', 'error')
                                    }
                                  } catch {
                                    showToast('Failed to save base amount', 'error')
                                  } finally {
                                    setSavingBaseAmount(prev => ({ ...prev, [req.id]: false }))
                                  }
                                }}
                                className="px-2 py-1 text-[10px] bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded transition-colors"
                              >
                                {isSaving ? '...' : 'Save'}
                              </button>
                            </div>
                          </div>
                        )
                      }
                      if (calculatedPenalty === '-') {
                        return <div className="text-fg-muted text-sm">-</div>
                      }
                      if (needsBaseAmount || calculatedPenalty.startsWith('Cannot calculate') || calculatedPenalty.startsWith('Refer')) {
                        return (
                          <div className="text-yellow-400 text-xs max-w-xs" title={calculatedPenalty}>
                            {calculatedPenalty}
                          </div>
                        )
                      }
                      return (
                        <div className="text-red-400 text-sm font-semibold">
                          {calculatedPenalty}
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-6 py-4 hidden xl:table-cell">
                    {/* Possible Legal Action Column */}
                    {(() => {
                      const legalAction = req.possible_legal_action
                      if (!legalAction) {
                        return <div className="text-fg-muted text-sm">-</div>
                      }
                      return (
                        <div
                          className="text-fg-muted text-xs truncate max-w-[140px]"
                          title={legalAction}
                        >
                          {legalAction}
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell">
                    {/* Filed On Column */}
                    {(() => {
                      const filedOn = req.filed_on
                      if (!filedOn) {
                        return <div className="text-fg-muted text-sm">-</div>
                      }
                      return (
                        <div className="text-green-400 text-sm">
                          {new Date(filedOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-6 py-4 hidden xl:table-cell">
                    {/* Filed By Column */}
                    {(() => {
                      const filedBy = req.filed_by
                      if (!filedBy) {
                        return <div className="text-fg-muted text-sm">-</div>
                      }
                      return (
                        <div className="text-blue-400 text-sm">
                          {req.filed_by_name || 'User'}
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-6 py-4 hidden xl:table-cell">
                    {/* Status Reason Column */}
                    {(() => {
                      const statusReason = req.status_reason
                      if (!statusReason) {
                        return <div className="text-fg-muted text-sm">-</div>
                      }
                      return (
                        <div className="text-yellow-400 text-xs max-w-[200px]" title={statusReason}>
                          {statusReason.length > 30 ? statusReason.substring(0, 30) + '...' : statusReason}
                        </div>
                      )
                    })()}
                  </td>
                  {canEdit && (
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const originalReq = regulatoryRequirements.find(r => r.id === req.id)
                            if (originalReq) {
                              setEditingRequirement(originalReq)
                              setRequirementForm({
                                category: originalReq.category,
                                requirement: originalReq.requirement,
                                description: originalReq.description || '',
                                due_date: originalReq.due_date,
                                penalty: originalReq.penalty || '',
                                penalty_base_amount: originalReq.penalty_base_amount || null,
                                penalty_config: (originalReq as any).penalty_config || null,
                                possible_legal_action: (originalReq as any).possible_legal_action || '',
                                required_documents: Array.isArray((originalReq as any).required_documents) ? (originalReq as any).required_documents : [],
                                required_documents_input: '',
                                is_critical: originalReq.is_critical,
                                financial_year: (originalReq as any).financial_year || '',
                                status: originalReq.status,
                                compliance_type: originalReq.compliance_type || 'one-time',
                                year: new Date().getFullYear().toString()
                              })
                              setIsEditModalOpen(true)
                            }
                          }}
                          className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <svg width="16" height="16" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Are you sure you want to remove "${req.requirement}" from this company? This will hide it from the tracker and exclude it from penalty calculations and reports, but it won't be deleted.`)) return
                            if (!currentCompany) return

                            try {
                              const result = await regulatoryService.hideCompliance(currentCompany.id, req.id)
                              if (result.success) {
                                setHiddenCompliances(prev => {
                                  const newSet = new Set(prev)
                                  newSet.add(req.id)
                                  return newSet
                                })
                                showToast(`"${req.requirement}" removed from tracker`, 'success')
                              } else {
                                showToast(result.error || 'Failed to remove compliance', 'error')
                              }
                            } catch (error) {
                              console.error('Error hiding compliance:', error)
                              showToast('Failed to remove compliance', 'error')
                            }
                          }}
                          className="p-2 text-orange-400 hover:text-orange-300 hover:bg-orange-500/20 rounded-lg transition-colors"
                          title="Remove from this company (hide from tracker)"
                        >
                          <svg width="16" height="16" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                        {canManage && (
                          <button
                            onClick={async () => {
                              if (!confirm('Are you sure you want to delete this compliance requirement permanently?')) return
                              if (!currentCompany) return

                              try {
                                const result = await regulatoryService.deleteRequirement(req.id, currentCompany.id)
                                if (result.success) {
                                  const refreshResult = await regulatoryService.getRequirements(currentCompany.id)
                                  if (refreshResult.success && refreshResult.data) {
                                    setRegulatoryRequirements(refreshResult.data)
                                  }
                                  showToast('Requirement deleted successfully', 'success')
                                } else {
                                  showToast(result.error || 'Failed to delete', 'error')
                                }
                              } catch (error) {
                                console.error('Error deleting requirement:', error)
                                showToast(error instanceof Error ? error.message : 'Error deleting requirement', 'error')
                              }
                            }}
                            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
                            title="Delete permanently"
                          >
                            <svg width="16" height="16" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  )
}

// ── Always-on inline amount cell ───────────────────────────────────────
// Previously this was click-to-edit with an em-dash + native-tooltip
// "Click to edit" — felt unlabelled and the browser tooltip was ugly.
// Now it's a persistent input that matches the table row height, shows
// ₹ prefix, saves on blur / Enter, and rolls back on Escape.

function AmountInputCell({
  value,
  canEdit,
  placeholder,
  onSave,
}: {
  value: number | null
  canEdit: boolean
  placeholder: string
  onSave: (raw: string) => void | Promise<void>
}) {
  // `display` holds the formatted value shown when the cell is idle
  // (₹1,23,456). `focused` swaps it for the raw number so the user can
  // edit without commas getting in the way. Blur or Enter commits and
  // re-formats; Escape reverts.
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState<string>(value != null ? String(value) : '')

  useEffect(() => {
    if (!focused) setDraft(value != null ? String(value) : '')
  }, [value, focused])

  if (!canEdit) {
    return (
      <span className={value != null ? 'text-white text-sm' : 'text-fg-muted/60 text-sm'}>
        {value != null ? `₹${Number(value).toLocaleString('en-IN')}` : '—'}
      </span>
    )
  }

  const formatted = value != null ? `₹${Number(value).toLocaleString('en-IN')}` : ''
  const shown = focused ? draft : formatted

  return (
    <input
      type="text"
      inputMode="decimal"
      value={shown}
      placeholder={placeholder}
      onFocus={() => { setDraft(value != null ? String(value) : ''); setFocused(true) }}
      onChange={e => {
        const raw = e.target.value
        // Accept digits, one dot, optional leading minus (we reject negatives on save)
        if (raw === '' || /^-?\d*\.?\d*$/.test(raw)) setDraft(raw)
      }}
      onBlur={e => {
        setFocused(false)
        const stripped = e.target.value.trim()
        const cleaned = stripped === '' ? '' : String(Number(stripped))
        const prev = value != null ? String(value) : ''
        if (cleaned !== prev) onSave(cleaned)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setDraft(value != null ? String(value) : '')
          setFocused(false)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      className={`w-28 px-2.5 py-1.5 text-sm rounded-md text-right bg-transparent border transition-colors focus:outline-none ${
        focused
          ? 'border-blue-400/60 bg-bg-card/80 text-white'
          : value != null
            ? 'border-white/10 text-white hover:border-white/25'
            : 'border-dashed border-white/10 text-fg-muted hover:border-white/25 hover:text-fg-secondary'
      }`}
    />
  )
}
