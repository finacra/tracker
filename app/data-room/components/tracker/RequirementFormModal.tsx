'use client'

import React from 'react'
import { IRegulatoryService } from '../../services/RegulatoryService'

interface RequirementForm {
  category: string
  requirement: string
  description: string
  due_date: string
  penalty: string
  penalty_base_amount: number | null
  is_critical: boolean
  financial_year: string
  status: string
  compliance_type: string
  year: string
}

interface RequirementFormModalProps {
  isOpen: boolean
  isEdit: boolean
  requirementForm: RequirementForm
  setRequirementForm: (form: RequirementForm | ((prev: RequirementForm) => RequirementForm)) => void
  onClose: () => void
  onSuccess: () => void
  regulatoryService: IRegulatoryService
  currentCompany: { id: string } | null
  complianceCategories: string[]
  regulatoryRequirements: Array<{ category?: string | null }>
  financialYears: string[]
  countryCode: string
  countryConfig: {
    name: string
    dateFormat: string
    currency: { symbol: string }
  }
  editingRequirement: { id: string } | null
  setRegulatoryRequirements: (requirements: any[]) => void
}

export default function RequirementFormModal({
  isOpen,
  isEdit,
  requirementForm,
  setRequirementForm,
  onClose,
  onSuccess,
  regulatoryService,
  currentCompany,
  complianceCategories,
  regulatoryRequirements,
  financialYears,
  countryCode,
  countryConfig,
  editingRequirement,
  setRegulatoryRequirements
}: RequirementFormModalProps) {
  if (!isOpen) return null

  const handleSubmit = async () => {
    if (!currentCompany) return
    if (!requirementForm.category || !requirementForm.requirement || !requirementForm.due_date) {
      alert('Please fill all required fields')
      return
    }

    try {
      let result
      if (isEdit && editingRequirement) {
        result = await regulatoryService.updateRequirement(
          editingRequirement.id,
          currentCompany.id,
          requirementForm
        )
      } else {
        result = await regulatoryService.createRequirement(currentCompany.id, requirementForm)
      }

      if (result.success) {
        // Refresh requirements
        const refreshResult = await regulatoryService.getRequirements(currentCompany.id)
        if (refreshResult.success && refreshResult.data) {
          setRegulatoryRequirements(refreshResult.data)
        }
        onSuccess()
        alert(isEdit ? 'Requirement updated successfully' : 'Requirement created successfully')
      } else {
        alert(`Failed: ${result.error}`)
      }
    } catch (error: any) {
      console.error('Error saving requirement:', error)
      alert(`Error: ${error.message}`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-light text-white">
              {isEdit ? 'Edit Compliance Requirement' : 'Create Compliance Requirement'}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Category *
            </label>
            <select
              value={requirementForm.category || ''}
              onChange={(e) => setRequirementForm((prev: RequirementForm) => ({ ...prev, category: e.target.value }))}
              className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
            >
              <option value="">Select Category</option>
              {complianceCategories.map((cat: string) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              {(() => {
                const allCategories = Array.from(new Set((regulatoryRequirements || []).map(req => req.category).filter(Boolean))) as string[]
                const defaultCats = new Set(complianceCategories)
                const additionalCats = allCategories.filter((cat): cat is string => !!cat && !defaultCats.has(cat)).sort()
                return additionalCats.length > 0 ? (
                  <>
                    {additionalCats.length > 0 && <option disabled>--- Other Categories ---</option>}
                    {additionalCats.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </>
                ) : null
              })()}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Categories are specific to {countryConfig.name}
            </p>
          </div>

          {/* Requirement Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Requirement *
            </label>
            <input
              type="text"
              value={requirementForm.requirement}
              onChange={(e) => setRequirementForm((prev: RequirementForm) => ({ ...prev, requirement: e.target.value }))}
              className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
              placeholder={
                countryCode === 'IN'
                  ? 'e.g., TDS Payment - Monthly'
                  : countryCode === 'US'
                    ? 'e.g., Federal Tax Return - Quarterly'
                    : ['AE', 'SA', 'OM', 'QA', 'BH'].includes(countryCode || '')
                      ? 'e.g., VAT Return - Monthly'
                      : 'e.g., Tax Return - Monthly'
              }
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={requirementForm.description || ''}
              onChange={(e) => setRequirementForm((prev: RequirementForm) => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
              rows={3}
              placeholder="Brief description of the requirement"
            />
          </div>

          {/* Compliance Type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Compliance Type *
            </label>
            <select
              value={requirementForm.compliance_type}
              onChange={(e) => setRequirementForm((prev: RequirementForm) => ({ ...prev, compliance_type: e.target.value }))}
              className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
            >
              <option value="one-time">One-time</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </div>

          {/* Year Selection */}
          {(requirementForm.compliance_type === 'monthly' ||
            requirementForm.compliance_type === 'quarterly' ||
            requirementForm.compliance_type === 'annual') && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Year *
                </label>
                <select
                  value={requirementForm.year}
                  onChange={(e) => setRequirementForm((prev: RequirementForm) => ({ ...prev, year: e.target.value }))}
                  className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                >
                  {Array.from({ length: 5 }, (_, i) => {
                    const year = new Date().getFullYear() - 2 + i
                    return (
                      <option key={year} value={year.toString()}>
                        {year}
                      </option>
                    )
                  })}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Select the year for which this compliance applies
                </p>
              </div>
            )}

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Due Date *
            </label>
            <input
              type="date"
              value={requirementForm.due_date}
              onChange={(e) => setRequirementForm((prev: RequirementForm) => ({ ...prev, due_date: e.target.value }))}
              className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
            />
            <p className="text-xs text-gray-400 mt-1">
              Date format: {countryConfig.dateFormat}
              {requirementForm.compliance_type !== 'one-time' && (
                <span className="block mt-1">
                  For {requirementForm.compliance_type} compliances, this is the base due date. The system will generate requirements for all applicable periods.
                </span>
              )}
            </p>
          </div>

          {/* Penalty */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Penalty
            </label>
            <input
              type="text"
              value={requirementForm.penalty || ''}
              onChange={(e) => setRequirementForm((prev: RequirementForm) => ({ ...prev, penalty: e.target.value }))}
              className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
              placeholder={`e.g., Late fee ${countryConfig.currency.symbol}200/day or Interest @ 1%/month`}
            />
            <p className="text-xs text-gray-400 mt-1">
              {countryCode === 'IN'
                ? 'For interest-based penalties, include the rate (e.g., "Interest @ 1%/month" or "u/s 234B & 234C")'
                : `For interest-based penalties, include the rate (e.g., "Interest @ 1%/month"). Use ${countryConfig.currency.symbol} for amounts.`
              }
            </p>
          </div>

          {/* Base Amount for Interest Calculations */}
          {((requirementForm.penalty || '').toLowerCase().includes('interest') ||
            (requirementForm.penalty || '').includes('234B') ||
            (requirementForm.penalty || '').includes('234C') ||
            (requirementForm.penalty || '').includes('u/s 234')) && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Base Amount (Principal) <span className="text-yellow-400">*</span>
                </label>
                <input
                  type="number"
                  value={requirementForm.penalty_base_amount ?? ''}
                  onChange={(e) => {
                    const value = e.target.value === '' ? null : parseFloat(e.target.value)
                    setRequirementForm((prev: RequirementForm) => ({ ...prev, penalty_base_amount: value }))
                  }}
                  className="w-full px-4 py-3 bg-black border border-yellow-500/30 rounded-lg text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-colors"
                  placeholder="e.g., 100000"
                  min="0"
                  step="0.01"
                />
                <p className="text-xs text-yellow-400 mt-1">
                  Required for interest calculation. Enter the principal amount on which interest is calculated (e.g., unpaid tax amount).
                </p>
              </div>
            )}

          {/* Financial Year */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Financial Year
            </label>
            <select
              value={requirementForm.financial_year || ''}
              onChange={(e) => setRequirementForm((prev: RequirementForm) => ({ ...prev, financial_year: e.target.value }))}
              className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
            >
              <option value="">Select Financial Year</option>
              {financialYears.map((fy) => (
                <option key={fy} value={fy}>{fy}</option>
              ))}
            </select>
          </div>

          {/* Status (only for edit) */}
          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Status
              </label>
              <select
                value={requirementForm.status}
                onChange={(e) => setRequirementForm((prev: RequirementForm) => ({ ...prev, status: e.target.value }))}
                className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
              >
                <option value="not_started">Not Started</option>
                <option value="upcoming">Upcoming</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          )}

          {/* Is Critical */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_critical"
              checked={requirementForm.is_critical}
              onChange={(e) => setRequirementForm((prev: RequirementForm) => ({ ...prev, is_critical: e.target.checked }))}
              className="w-4 h-4 text-white bg-gray-900 border-gray-700 rounded focus:ring-white/40"
            />
            <label htmlFor="is_critical" className="text-sm font-medium text-gray-300">
              Mark as Critical
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4">
            <button
              onClick={handleSubmit}
              className="flex-1 bg-white text-black px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors font-medium"
            >
              {isEdit ? 'Update' : 'Create'}
            </button>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
