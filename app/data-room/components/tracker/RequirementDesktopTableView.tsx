'use client'

import React, { useState } from 'react'
import { IRegulatoryService } from '../../services/RegulatoryService'
import { showToast } from '@/components/ui/Toast'
import { updateRequirement } from '@/app/data-room/actions'

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

  const uploadedDocSet = new Set(
    vaultDocuments
      .filter(d => d.requirement_id || d.requirementId)
      .map(d => `${d.requirement_id || d.requirementId}::${(d.document_type || '').toLowerCase().trim()}`)
  )
  const isDocUploaded = (reqId: string, docName: string) =>
    uploadedDocSet.has(`${reqId}::${docName.toLowerCase().trim()}`)

  return (
    <table className="hidden sm:table w-full">
      <thead className="bg-black border-b border-white/10">
        <tr>
          {canEdit && (
            <th className="px-4 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-12">
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
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-white focus:ring-white/40 focus:ring-2 cursor-pointer"
              />
            </th>
          )}
          <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
            CATEGORY
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
            REQUIREMENT
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
            TYPE
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
            STATUS
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
            DUE DATE
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden md:table-cell">
            DOCUMENTS
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">
            PENALTY
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">
            CALC PENALTY
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden xl:table-cell">
            LEGAL ACTION
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">
            FILED ON
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden xl:table-cell">
            FILED BY
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden xl:table-cell">
            STATUS REASON
          </th>
          {canEdit && (
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
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
                <td colSpan={canEdit ? 13 : 12} className="px-0 py-0">
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
                        className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-white focus:ring-white/40 focus:ring-2 cursor-pointer"
                      />
                    </td>
                  )}
                  {itemIndex === 0 && (
                    <td
                      className="px-6 py-4 border-r-0 border-l-0 border-t-0 border-b-0 align-top"
                      rowSpan={group.items.length}
                    >
                      <span className="text-white font-semibold text-2xl block">
                        {group.category}
                      </span>
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-white font-medium text-base break-words">{req.requirement}</div>
                          {formFreq && (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${formFreq === 'monthly' ? 'bg-blue-500/20 text-blue-400' :
                                formFreq === 'quarterly' ? 'bg-purple-500/20 text-purple-400' :
                                  formFreq === 'annual' ? 'bg-green-500/20 text-green-400' :
                                    'bg-gray-500/20 text-gray-400'
                              }`}>
                              {formFreq.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="text-gray-400 text-sm break-words">{req.description}</div>
                        {(formFreq || authority || legalSections.length > 0) && (
                          <button
                            onClick={() => setComplianceDetailsModal(req)}
                            className="mt-2 text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="16" x2="12" y2="12" />
                              <line x1="12" y1="8" x2="12.01" y2="8" />
                            </svg>
                            View Details
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {(() => {
                      const complianceType = req.compliance_type
                      if (!complianceType) return <span className="text-gray-500 text-sm">-</span>
                      return (
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${complianceType === 'one-time' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                            complianceType === 'annual' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                              complianceType === 'monthly' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                complianceType === 'quarterly' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                                  'bg-gray-500/20 text-white border border-gray-500/30'
                          }`} title={
                            complianceType === 'one-time' ? 'One-time: happens once, no recurring' :
                              complianceType === 'annual' ? 'Annual: recurs every year' :
                                complianceType === 'monthly' ? 'Monthly: recurs every month' :
                                  complianceType === 'quarterly' ? 'Quarterly: recurs every quarter' :
                                    ''
                        }>
                          {complianceType === 'one-time' ? 'ONE-TIME' :
                            complianceType === 'annual' ? 'ANNUAL' :
                              complianceType.toUpperCase()}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-6 py-4">
                    {canEdit ? (
                      <select
                        value={req.status}
                        onChange={(e) => handleStatusChange(req.id, e.target.value as 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed')}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${req.status === 'completed'
                            ? 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30'
                            : req.status === 'overdue'
                              ? 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30'
                              : req.status === 'pending'
                                ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30'
                                : req.status === 'upcoming'
                                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30'
                                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
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
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${req.status === 'completed'
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : req.status === 'overdue'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : req.status === 'pending'
                                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                : req.status === 'upcoming'
                                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                  : 'bg-gray-800 text-gray-400 border border-gray-700'
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
                        return <span className="text-gray-500 text-sm italic">No due date</span>
                      }
                      const daysDelayed = calculateDelay(req.dueDate, req.status)
                      return (
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2 text-white">
                            <svg
                              width="16"
                              height="16"
                              className="w-4 h-4 flex-shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                            <span className="text-sm whitespace-nowrap">{req.dueDate}</span>
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
                  <td className="px-6 py-4 hidden md:table-cell">
                    {/* Documents Required Column — clickable checklist */}
                    {(() => {
                      const requiredDocs = (req as any).required_documents || []
                      if (!Array.isArray(requiredDocs) || requiredDocs.length === 0) {
                        return <div className="text-gray-500 text-sm">-</div>
                      }
                      const uploadedCount = requiredDocs.filter((doc: string) => isDocUploaded(req.id, doc)).length
                      const allDone = uploadedCount === requiredDocs.length
                      const isOpen = openDocChecklist === req.id
                      return (
                        <div className="relative">
                          <button
                            onClick={() => setOpenDocChecklist(isOpen ? null : req.id)}
                            className={`px-2.5 py-1 text-xs rounded-lg border flex items-center gap-1.5 transition-colors ${
                              allDone
                                ? 'bg-green-500/15 text-green-400 border-green-500/30'
                                : uploadedCount > 0
                                  ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                            }`}
                          >
                            {allDone ? (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            )}
                            <span>{uploadedCount}/{requiredDocs.length}</span>
                          </button>
                          {/* Click popup checklist */}
                          {isOpen && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setOpenDocChecklist(null)} />
                              <div className="absolute z-50 left-0 top-full mt-1 w-80 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-2xl p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="text-sm font-medium text-gray-200 flex items-center gap-2">
                                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                    Required Documents
                                  </div>
                                  <button onClick={() => setOpenDocChecklist(null)} className="text-gray-500 hover:text-gray-300 p-0.5">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                </div>
                                <div className="text-[10px] text-gray-500 mb-3">{uploadedCount} of {requiredDocs.length} uploaded</div>
                                <div className="space-y-2">
                                  {requiredDocs.map((doc: string, idx: number) => {
                                    const uploaded = isDocUploaded(req.id, doc)
                                    return (
                                      <div key={idx} className={`flex items-start gap-2.5 p-2 rounded-lg ${uploaded ? 'bg-green-500/5' : 'bg-gray-800/50'}`}>
                                        {uploaded ? (
                                          <svg className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                        ) : (
                                          <div className="w-4 h-4 rounded border border-gray-600 flex-shrink-0 mt-0.5" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <div className={`text-xs ${uploaded ? 'text-green-400/90' : 'text-gray-300'}`}>{doc}</div>
                                          {!uploaded && (
                                            <button
                                              onClick={() => {
                                                setOpenDocChecklist(null)
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
                                          {uploaded && (
                                            <span className="text-[10px] text-green-500/60">Uploaded</span>
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
                    <div className="text-gray-300 text-sm break-words max-w-[150px]" title={req.penalty || ''}>
                      {req.penalty ? (req.penalty.length > 30 ? req.penalty.substring(0, 30) + '...' : req.penalty) : '-'}
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
                                className="w-24 px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-white/40"
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
                        return <div className="text-gray-500 text-sm">-</div>
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
                        return <div className="text-gray-500 text-sm">-</div>
                      }
                      return (
                        <div className="text-white text-xs max-w-[150px]" title={legalAction}>
                          {legalAction.length > 40 ? legalAction.substring(0, 40) + '...' : legalAction}
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell">
                    {/* Filed On Column */}
                    {(() => {
                      const filedOn = req.filed_on
                      if (!filedOn) {
                        return <div className="text-gray-500 text-sm">-</div>
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
                        return <div className="text-gray-500 text-sm">-</div>
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
                        return <div className="text-gray-500 text-sm">-</div>
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
