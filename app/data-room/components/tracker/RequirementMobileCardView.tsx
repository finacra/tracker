'use client'

import React from 'react'
import { IRegulatoryService } from '../../services/RegulatoryService'
import { showToast } from '@/components/ui/Toast'

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
  [key: string]: any
}

interface RequirementMobileCardViewProps {
  groupedByCategory: Array<{
    category: string
    items: Requirement[]
  }>
  canEdit: boolean
  canManage?: boolean
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
  // Utility functions
  calculateDelay: (dueDate: string, status: string) => number | null
  calculatePenalty: (penalty: string | null | undefined, daysDelayed: number | null, penaltyBaseAmount?: number | null, penaltyConfig?: Record<string, unknown> | null) => string
  getFormFrequency: (requirement: string) => string | null
  getRelevantLegalSections: (requirement: string, category: string | null | undefined) => string[]
  getAuthorityForCategory: (category: string | null | undefined) => string | null
}

export default function RequirementMobileCardView({
  groupedByCategory,
  canEdit,
  canManage,
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
  calculateDelay,
  calculatePenalty,
  getFormFrequency,
  getRelevantLegalSections,
  getAuthorityForCategory
}: RequirementMobileCardViewProps) {
  return (
    <div className="block sm:hidden space-y-3">
      {groupedByCategory.map((group, groupIndex) => (
        <div key={group.category}>
          {/* Category Header */}
          <div className="mb-2">
            <h3 className="text-fg-primary font-semibold text-base">
              {group.category}
            </h3>
            {groupIndex > 0 && (
              <div className="h-0.5 bg-gradient-to-r from-transparent via-white/30 to-transparent my-2"></div>
            )}
          </div>
          {/* Category Items as Cards */}
          <div className="space-y-3">
            {group.items.map((req, itemIndex) => {
              const daysDelayed = calculateDelay(req.dueDate, req.status)
              const calculatedPenalty = calculatePenalty(req.penalty, daysDelayed, req.penalty_base_amount, req.penalty_config)
              const complianceType = req.compliance_type
              const formFreq = getFormFrequency(req.requirement)
              const legalSections = getRelevantLegalSections(req.requirement, req.category)
              const authority = getAuthorityForCategory(req.category)

              return (
                <div key={`${group.category}-${req.id}-${itemIndex}`} className="bg-black border border-white/10 rounded-lg p-3 space-y-2">
                  {/* Requirement Header with Checkbox */}
                  <div className="flex items-start gap-2">
                    {canEdit && (
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
                        className="mt-1 w-4 h-4 rounded border-line/30 bg-bg-elevated text-fg-primary focus:ring-white/40 focus:ring-2 cursor-pointer"
                      />
                    )}
                    {(req.isCritical || req.status === 'overdue') && (
                      <svg
                        width="16"
                        height="16"
                        className="flex-shrink-0 mt-0.5 text-red-500"
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
                        <div className="text-fg-primary font-medium text-sm break-words">{req.requirement}</div>
                        {formFreq && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${formFreq === 'monthly' ? 'bg-blue-500/20 text-blue-400' :
                              formFreq === 'quarterly' ? 'bg-purple-500/20 text-purple-400' :
                                formFreq === 'annual' ? 'bg-green-500/20 text-green-400' :
                                  'bg-bg-hover/20 text-fg-muted'
                            }`}>
                            {formFreq.toUpperCase()}
                          </span>
                        )}
                      </div>
                      {req.description && (
                        <div className="text-fg-muted text-xs break-words mt-1">{req.description}</div>
                      )}
                      {(formFreq || authority || legalSections.length > 0) && (
                        <button
                          onClick={() => setComplianceDetailsModal(req)}
                          className="mt-2 text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 transition-colors"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                          </svg>
                          View Details
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Status and Type Row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {canEdit ? (
                      <select
                        value={req.status}
                        onChange={(e) => handleStatusChange(req.id, e.target.value as 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed')}
                        className={`px-2 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${req.status === 'completed'
                            ? 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30'
                            : req.status === 'overdue'
                              ? 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30'
                              : req.status === 'pending'
                                ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30'
                                : req.status === 'upcoming'
                                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30'
                                  : 'bg-bg-elevated text-fg-muted border-line/15 hover:bg-bg-hover'
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
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${req.status === 'completed'
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : req.status === 'overdue'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : req.status === 'pending'
                                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                : req.status === 'upcoming'
                                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                  : 'bg-bg-elevated text-fg-muted border border-line/15'
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
                    {complianceType && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${complianceType === 'one-time' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                          complianceType === 'annual' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                            complianceType === 'monthly' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                              complianceType === 'quarterly' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                                'bg-bg-hover/20 text-fg-primary border border-line/40/30'
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
                    )}
                  </div>

                  {/* Filing Month + Due Date */}
                  {(() => {
                    const rawPeriod = (req.period_label || req.period_key || '').trim()
                    const filingPeriod = rawPeriod ? rawPeriod.replace(/^For\s+/i, '') : ''
                    return (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-primary">
                        {filingPeriod && (
                          <div className="flex items-center gap-1.5">
                            <svg
                              width="14"
                              height="14"
                              className="flex-shrink-0 text-fg-muted"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <span className="text-xs">Filing: {filingPeriod}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <svg
                            width="14"
                            height="14"
                            className="flex-shrink-0 text-fg-muted"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          <span className="text-xs">Due: {req.dueDate}</span>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Delayed, Penalty, Calculated Penalty */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {daysDelayed !== null && (
                      <div>
                        <span className="text-fg-muted">Delayed:</span>
                        <span className="text-red-400 font-medium ml-1">
                          {daysDelayed} {daysDelayed === 1 ? 'day' : 'days'}
                        </span>
                      </div>
                    )}
                    {req.penalty && (
                      <div>
                        <span className="text-fg-muted">Penalty:</span>
                        <span className="text-red-400 ml-1 break-words">{req.penalty}</span>
                      </div>
                    )}
                    {calculatedPenalty !== '-' && (
                      <div className="col-span-2">
                        <span className="text-fg-muted">Calculated Penalty:</span>
                        <span className="text-red-400 font-semibold ml-1">
                          {calculatedPenalty}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Audit Trail */}
                  {(req.filed_on || req.filed_by || req.status_reason) && (
                    <div className="pt-2 border-t border-white/10 space-y-1.5">
                      {req.filed_on && (
                        <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          <span>Filed on: {new Date(req.filed_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                      )}
                      {req.filed_by && (
                        <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          <span>Filed by: {req.filed_by_name || 'User'}</span>
                        </div>
                      )}
                      {req.status_reason && (
                        <div className="flex items-start gap-1.5 text-xs text-fg-muted">
                          <svg width="12" height="12" className="mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                          </svg>
                          <span>Reason: {req.status_reason}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  {canEdit && (
                    <div className="flex items-center gap-2 pt-2 border-t border-white/10">
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
                              financial_year: originalReq.financial_year || '',
                              status: originalReq.status,
                              compliance_type: originalReq.compliance_type || 'one-time',
                              year: new Date().getFullYear().toString()
                            })
                            setIsEditModalOpen(true)
                          }
                        }}
                        className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                        className="p-1.5 text-orange-400 hover:text-orange-300 hover:bg-orange-500/20 rounded-lg transition-colors"
                        title="Remove from this company (hide from tracker)"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                          className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
                          title="Delete permanently"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
