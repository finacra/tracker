'use client'

import React from 'react'
import { IRegulatoryService } from '../../services/RegulatoryService'
import { showToast } from '@/components/ui/Toast'

export interface RequirementForm {
  category: string
  requirement: string
  description: string
  due_date: string
  penalty: string
  penalty_base_amount: number | null
  penalty_config: Record<string, unknown> | null
  possible_legal_action: string
  required_documents: string[]
  required_documents_input: string
  is_critical: boolean
  financial_year: string
  status: string
  compliance_type: string
  year: string
}

export const EMPTY_REQUIREMENT_FORM: RequirementForm = {
  category: '',
  requirement: '',
  description: '',
  due_date: '',
  penalty: '',
  penalty_base_amount: null,
  penalty_config: null,
  possible_legal_action: '',
  required_documents: [],
  required_documents_input: '',
  is_critical: false,
  financial_year: '',
  status: 'not_started',
  compliance_type: 'one-time',
  year: new Date().getFullYear().toString(),
}

// ─── Penalty config builder types ────────────────────────────────────────────

type PenaltyConfigType = 'none' | 'flat' | 'daily' | 'interest' | 'percentage'

function buildPenaltyConfig(
  configType: PenaltyConfigType,
  fields: Record<string, string>
): Record<string, unknown> | null {
  if (configType === 'none') return null
  const rate = parseFloat(fields.rate)
  const amount = parseFloat(fields.amount)
  if (configType === 'flat') {
    if (isNaN(amount)) return null
    return { type: 'flat', amount }
  }
  if (configType === 'daily') {
    if (isNaN(rate)) return null
    const config: Record<string, unknown> = { type: 'daily', rate }
    if (fields.cap && !isNaN(parseFloat(fields.cap))) config.cap = parseFloat(fields.cap)
    return config
  }
  if (configType === 'interest') {
    if (isNaN(rate) || !fields.base || !fields.period) return null
    return { type: 'interest', rate, period: fields.period, base: fields.base }
  }
  if (configType === 'percentage') {
    if (isNaN(rate) || !fields.base) return null
    const config: Record<string, unknown> = { type: 'percentage', rate, base: fields.base }
    if (fields.cap && !isNaN(parseFloat(fields.cap))) config.cap = parseFloat(fields.cap)
    return config
  }
  return null
}

// ─── Component ────────────────────────────────────────────────────────────────

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
  setRegulatoryRequirements: React.Dispatch<React.SetStateAction<any[]>>
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
  // Penalty config builder local state (derived from requirementForm.penalty_config)
  const existingConfig = requirementForm.penalty_config as any
  const [configType, setConfigType] = React.useState<PenaltyConfigType>(
    (existingConfig?.type as PenaltyConfigType) || 'none'
  )
  const [configFields, setConfigFields] = React.useState<Record<string, string>>({
    rate: existingConfig?.rate?.toString() || '',
    amount: existingConfig?.amount?.toString() || '',
    period: existingConfig?.period || 'month',
    base: existingConfig?.base || 'tax_due',
    cap: existingConfig?.cap?.toString() || '',
  })

  // Reset builder when modal opens for a new requirement
  React.useEffect(() => {
    if (isOpen) {
      const cfg = requirementForm.penalty_config as any
      setConfigType((cfg?.type as PenaltyConfigType) || 'none')
      setConfigFields({
        rate: cfg?.rate?.toString() || '',
        amount: cfg?.amount?.toString() || '',
        period: cfg?.period || 'month',
        base: cfg?.base || 'tax_due',
        cap: cfg?.cap?.toString() || '',
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  const setField = (key: string) => (value: string) =>
    setConfigFields((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async () => {
    if (!currentCompany) return
    if (!requirementForm.category || !requirementForm.requirement || !requirementForm.due_date) {
      showToast('Please fill all required fields', 'warning')
      return
    }

    // Build penalty_config from the builder
    const builtConfig = buildPenaltyConfig(configType, configFields)

    const payload = {
      ...requirementForm,
      penalty_config: builtConfig,
    }

    try {
      let result
      if (isEdit && editingRequirement) {
        result = await regulatoryService.updateRequirement(
          editingRequirement.id,
          currentCompany.id,
          payload
        )
      } else {
        result = await regulatoryService.createRequirement(currentCompany.id, payload)
      }

      if (result.success) {
        const refreshResult = await regulatoryService.getRequirements(currentCompany.id)
        if (refreshResult.success && refreshResult.data) {
          setRegulatoryRequirements(refreshResult.data)
        }
        onSuccess()
        showToast(isEdit ? 'Requirement updated successfully' : 'Requirement created successfully', 'success')
      } else {
        showToast(`Failed: ${result.error}`, 'error')
      }
    } catch (error: any) {
      console.error('Error saving requirement:', error)
      showToast(`Error: ${error.message}`, 'error')
    }
  }

  const inputClass =
    'w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors'
  const labelClass = 'block text-sm font-medium text-gray-300 mb-2'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-light text-white">
              {isEdit ? 'Edit Compliance Requirement' : 'Create Compliance Requirement'}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* ── Category ─────────────────────────────────────────────────────── */}
          <div>
            <label className={labelClass}>Category *</label>
            <select
              value={requirementForm.category || ''}
              onChange={(e) => setRequirementForm((prev) => ({ ...prev, category: e.target.value }))}
              className={inputClass}
            >
              <option value="">Select Category</option>
              {complianceCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              {(() => {
                const all = Array.from(new Set((regulatoryRequirements || []).map((r) => r.category).filter(Boolean))) as string[]
                const defaults = new Set(complianceCategories)
                const extra = all.filter((c) => !!c && !defaults.has(c)).sort()
                return extra.length > 0 ? (
                  <>
                    <option disabled>--- Other Categories ---</option>
                    {extra.map((c) => <option key={c} value={c}>{c}</option>)}
                  </>
                ) : null
              })()}
            </select>
            <p className="text-xs text-gray-400 mt-1">Categories are specific to {countryConfig.name}</p>
          </div>

          {/* ── Requirement Name ─────────────────────────────────────────────── */}
          <div>
            <label className={labelClass}>Requirement *</label>
            <input
              type="text"
              value={requirementForm.requirement}
              onChange={(e) => setRequirementForm((prev) => ({ ...prev, requirement: e.target.value }))}
              className={inputClass}
              placeholder={
                countryCode === 'IN' ? 'e.g., TDS Payment - Monthly'
                : countryCode === 'US' ? 'e.g., Federal Tax Return - Quarterly'
                : ['AE', 'SA', 'OM', 'QA', 'BH'].includes(countryCode) ? 'e.g., VAT Return - Monthly'
                : 'e.g., Tax Return - Monthly'
              }
            />
          </div>

          {/* ── Description ──────────────────────────────────────────────────── */}
          <div>
            <label className={labelClass}>Description</label>
            <textarea
              value={requirementForm.description || ''}
              onChange={(e) => setRequirementForm((prev) => ({ ...prev, description: e.target.value }))}
              className={inputClass}
              rows={3}
              placeholder="Brief description of the requirement"
            />
          </div>

          {/* ── Compliance Type ───────────────────────────────────────────────── */}
          <div>
            <label className={labelClass}>Compliance Type *</label>
            <select
              value={requirementForm.compliance_type}
              onChange={(e) => setRequirementForm((prev) => ({ ...prev, compliance_type: e.target.value }))}
              className={inputClass}
            >
              <option value="one-time">One-time</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </div>

          {/* ── Year (for recurring types) ───────────────────────────────────── */}
          {['monthly', 'quarterly', 'annual'].includes(requirementForm.compliance_type) && (
            <div>
              <label className={labelClass}>Year *</label>
              <select
                value={requirementForm.year}
                onChange={(e) => setRequirementForm((prev) => ({ ...prev, year: e.target.value }))}
                className={inputClass}
              >
                {Array.from({ length: 5 }, (_, i) => {
                  const y = new Date().getFullYear() - 2 + i
                  return <option key={y} value={y.toString()}>{y}</option>
                })}
              </select>
            </div>
          )}

          {/* ── Due Date ─────────────────────────────────────────────────────── */}
          <div>
            <label className={labelClass}>Due Date *</label>
            <input
              type="date"
              value={requirementForm.due_date}
              onChange={(e) => setRequirementForm((prev) => ({ ...prev, due_date: e.target.value }))}
              className={inputClass}
            />
            <p className="text-xs text-gray-400 mt-1">Format: {countryConfig.dateFormat}</p>
          </div>

          {/* ── Financial Year ────────────────────────────────────────────────── */}
          <div>
            <label className={labelClass}>Financial Year</label>
            <select
              value={requirementForm.financial_year || ''}
              onChange={(e) => setRequirementForm((prev) => ({ ...prev, financial_year: e.target.value }))}
              className={inputClass}
            >
              <option value="">Select Financial Year</option>
              {financialYears.map((fy) => <option key={fy} value={fy}>{fy}</option>)}
            </select>
          </div>

          {/* ── Penalty ──────────────────────────────────────────────────────── */}
          <div>
            <label className={labelClass}>Penalty (description)</label>
            <input
              type="text"
              value={requirementForm.penalty || ''}
              onChange={(e) => setRequirementForm((prev) => ({ ...prev, penalty: e.target.value }))}
              className={inputClass}
              placeholder={`e.g., Late fee ${countryConfig.currency.symbol}200/day or Interest @ 1%/month`}
            />
            <p className="text-xs text-gray-400 mt-1">Human-readable description. For calculated penalties, use the Penalty Calculator below.</p>
          </div>

          {/* ── Penalty Calculator (structured config) ───────────────────────── */}
          <div className="border border-white/10 rounded-xl p-4 space-y-4 bg-white/[0.02]">
            <div className="flex items-center gap-2 mb-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-400">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
              <span className="text-sm font-medium text-white">Penalty Calculator</span>
              <span className="text-xs text-gray-400">(optional — enables automatic penalty calculation)</span>
            </div>

            <div>
              <label className={labelClass}>Penalty Type</label>
              <select
                value={configType}
                onChange={(e) => setConfigType(e.target.value as PenaltyConfigType)}
                className={inputClass}
              >
                <option value="none">None / Text only</option>
                <option value="flat">Flat amount (fixed penalty)</option>
                <option value="daily">Daily rate (per day late)</option>
                <option value="interest">Interest (% on base amount per period)</option>
                <option value="percentage">Percentage of base amount</option>
              </select>
            </div>

            {configType === 'flat' && (
              <div>
                <label className={labelClass}>Fixed Penalty Amount ({countryConfig.currency.symbol})</label>
                <input type="number" value={configFields.amount} onChange={(e) => setField('amount')(e.target.value)}
                  className={inputClass} placeholder="e.g., 5000" min="0" />
              </div>
            )}

            {configType === 'daily' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Rate per Day ({countryConfig.currency.symbol})</label>
                  <input type="number" value={configFields.rate} onChange={(e) => setField('rate')(e.target.value)}
                    className={inputClass} placeholder="e.g., 200" min="0" />
                </div>
                <div>
                  <label className={labelClass}>Maximum Cap ({countryConfig.currency.symbol}, optional)</label>
                  <input type="number" value={configFields.cap} onChange={(e) => setField('cap')(e.target.value)}
                    className={inputClass} placeholder="e.g., 10000" min="0" />
                </div>
              </div>
            )}

            {(configType === 'interest' || configType === 'percentage') && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Rate (%)</label>
                  <input type="number" value={configFields.rate} onChange={(e) => setField('rate')(e.target.value)}
                    className={inputClass} placeholder="e.g., 1.5" min="0" step="0.01" />
                </div>
                {configType === 'interest' && (
                  <div>
                    <label className={labelClass}>Per</label>
                    <select value={configFields.period} onChange={(e) => setField('period')(e.target.value)} className={inputClass}>
                      <option value="month">Month</option>
                      <option value="day">Day</option>
                      <option value="year">Year</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className={labelClass}>Base Amount Type</label>
                  <select value={configFields.base} onChange={(e) => setField('base')(e.target.value)} className={inputClass}>
                    <option value="tax_due">Tax Due</option>
                    <option value="turnover">Turnover</option>
                    <option value="income">Income</option>
                    <option value="contribution">Contribution (PF/ESI)</option>
                  </select>
                </div>
                {configType === 'percentage' && (
                  <div>
                    <label className={labelClass}>Cap ({countryConfig.currency.symbol}, optional)</label>
                    <input type="number" value={configFields.cap} onChange={(e) => setField('cap')(e.target.value)}
                      className={inputClass} placeholder="Maximum penalty cap" min="0" />
                  </div>
                )}
              </div>
            )}

            {/* Base Amount — shown whenever a % or interest config is selected, or already set */}
            {(configType === 'interest' || configType === 'percentage' || requirementForm.penalty_base_amount !== null) && (
              <div>
                <label className="block text-sm font-medium text-yellow-400 mb-2">
                  Base Amount ({countryConfig.currency.symbol}) <span className="text-yellow-400">*</span>
                </label>
                <input
                  type="number"
                  value={requirementForm.penalty_base_amount ?? ''}
                  onChange={(e) => {
                    const value = e.target.value === '' ? null : parseFloat(e.target.value)
                    setRequirementForm((prev) => ({ ...prev, penalty_base_amount: value }))
                  }}
                  className="w-full px-4 py-3 bg-black border border-yellow-500/40 rounded-lg text-white focus:outline-none focus:border-yellow-500/70 focus:ring-1 focus:ring-yellow-500/50 transition-colors"
                  placeholder={
                    configFields.base === 'turnover' ? 'e.g., 5000000 (annual turnover)'
                    : configFields.base === 'income' ? 'e.g., 1200000 (taxable income)'
                    : 'e.g., 100000 (unpaid tax amount)'
                  }
                  min="0"
                  step="0.01"
                />
                <p className="text-xs text-yellow-400/80 mt-1">
                  Required for calculation. Enter the {configFields.base === 'turnover' ? 'annual turnover' : configFields.base === 'income' ? 'taxable income' : 'unpaid tax / principal amount'}.
                </p>
              </div>
            )}

            {/* Always show base amount as optional when it's already been set */}
            {configType === 'none' && requirementForm.penalty_base_amount === null && (
              <div>
                <label className={labelClass}>
                  Base Amount ({countryConfig.currency.symbol})
                  <span className="text-gray-500 font-normal ml-2">(optional — needed if penalty involves % / interest)</span>
                </label>
                <input
                  type="number"
                  value={requirementForm.penalty_base_amount ?? ''}
                  onChange={(e) => {
                    const value = e.target.value === '' ? null : parseFloat(e.target.value)
                    setRequirementForm((prev) => ({ ...prev, penalty_base_amount: value }))
                  }}
                  className={inputClass}
                  placeholder="e.g., 100000"
                  min="0"
                  step="0.01"
                />
                <p className="text-xs text-gray-400 mt-1">
                  If the penalty type above is set, this is calculated automatically. Enter manually if calculator shows &quot;Needs amount&quot;.
                </p>
              </div>
            )}
          </div>

          {/* ── Possible Legal Action ─────────────────────────────────────────── */}
          <div>
            <label className={labelClass}>Possible Legal Action</label>
            <input
              type="text"
              value={requirementForm.possible_legal_action || ''}
              onChange={(e) => setRequirementForm((prev) => ({ ...prev, possible_legal_action: e.target.value }))}
              className={inputClass}
              placeholder="e.g., Prosecution under Section 276B, IPC"
            />
          </div>

          {/* ── Required Documents ────────────────────────────────────────────── */}
          <div>
            <label className={labelClass}>Required Documents</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={requirementForm.required_documents_input || ''}
                onChange={(e) => setRequirementForm((prev) => ({ ...prev, required_documents_input: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && requirementForm.required_documents_input?.trim()) {
                    e.preventDefault()
                    setRequirementForm((prev) => ({
                      ...prev,
                      required_documents: [...(prev.required_documents || []), prev.required_documents_input.trim()],
                      required_documents_input: '',
                    }))
                  }
                }}
                className="flex-1 px-4 py-2 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                placeholder="Type document name and press Enter or Add"
              />
              <button
                type="button"
                onClick={() => {
                  if (requirementForm.required_documents_input?.trim()) {
                    setRequirementForm((prev) => ({
                      ...prev,
                      required_documents: [...(prev.required_documents || []), prev.required_documents_input.trim()],
                      required_documents_input: '',
                    }))
                  }
                }}
                className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-sm"
              >
                Add
              </button>
            </div>
            {(requirementForm.required_documents || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(requirementForm.required_documents || []).map((doc, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full text-sm">
                    {doc}
                    <button
                      type="button"
                      onClick={() =>
                        setRequirementForm((prev) => ({
                          ...prev,
                          required_documents: prev.required_documents.filter((_, i) => i !== idx),
                        }))
                      }
                      className="ml-1 hover:text-red-400 transition-colors"
                    >×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── Status (edit only) ────────────────────────────────────────────── */}
          {isEdit && (
            <div>
              <label className={labelClass}>Status</label>
              <select
                value={requirementForm.status}
                onChange={(e) => setRequirementForm((prev) => ({ ...prev, status: e.target.value }))}
                className={inputClass}
              >
                <option value="not_started">Not Started</option>
                <option value="upcoming">Upcoming</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          )}

          {/* ── Is Critical ───────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_critical"
              checked={requirementForm.is_critical}
              onChange={(e) => setRequirementForm((prev) => ({ ...prev, is_critical: e.target.checked }))}
              className="w-4 h-4 text-white bg-gray-900 border-gray-700 rounded focus:ring-white/40"
            />
            <label htmlFor="is_critical" className="text-sm font-medium text-gray-300">
              Mark as Critical
            </label>
          </div>

          {/* ── Actions ───────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSubmit}
              className="flex-1 bg-white text-black px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium"
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
