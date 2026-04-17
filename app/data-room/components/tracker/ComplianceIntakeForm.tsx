'use client'

import { useState } from 'react'
import { showToast } from '@/components/ui/Toast'

/**
 * Quick intake form that collects the key operational facts BEFORE
 * the evaluator runs. Without these, the evaluator guesses — which
 * means showing wrong compliances. With these, it's accurate.
 *
 * Modelled after what tax software does: "Do you pay rent?" before
 * showing the rent TDS section. 8-10 questions, takes 2 minutes.
 */

interface Props {
  companyId: string
  financialYear: string
  onComplete: () => void
}

interface IntakeData {
  // Rent
  paysRent: boolean | null
  monthlyRentAmount: string
  // Contractors
  hiresContractors: boolean | null
  largestContractorPayment: string
  // Professional fees
  paysProfessionalFees: boolean | null
  largestProfFeePayment: string
  // Employees
  employeeCount: string
  anyEmployeeBelow21k: boolean | null
  // Turnover
  annualTurnover: string
  // Other
  isCompositionDealer: boolean | null
  hasImportsExports: boolean | null
  paysDirectorRemuneration: boolean | null
  directorRemunerationAmount: string
}

const INITIAL: IntakeData = {
  paysRent: null,
  monthlyRentAmount: '',
  hiresContractors: null,
  largestContractorPayment: '',
  paysProfessionalFees: null,
  largestProfFeePayment: '',
  employeeCount: '',
  anyEmployeeBelow21k: null,
  annualTurnover: '',
  isCompositionDealer: null,
  hasImportsExports: null,
  paysDirectorRemuneration: null,
  directorRemunerationAmount: '',
}

export default function ComplianceIntakeForm({ companyId, financialYear, onComplete }: Props) {
  const [data, setData] = useState<IntakeData>(INITIAL)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof IntakeData>(key: K, value: IntakeData[K]) =>
    setData(prev => ({ ...prev, [key]: value }))

  const handleSubmit = async () => {
    setSaving(true)
    try {
      const { recordFact, fyWindow } = await import('@/lib/compliance/facts')
      const { periodStart, periodEnd } = fyWindow(financialYear)

      const facts: Array<{ kind: string; amount: number | null; unit: string }> = []

      // Rent
      if (data.paysRent === true && data.monthlyRentAmount) {
        facts.push({ kind: 'rent.monthly_payment', amount: parseFloat(data.monthlyRentAmount), unit: 'rupees_per_month' })
      } else if (data.paysRent === false) {
        facts.push({ kind: 'rent.monthly_payment', amount: 0, unit: 'rupees_per_month' })
      }

      // Contractors
      if (data.hiresContractors === true && data.largestContractorPayment) {
        facts.push({ kind: 'contractor.annual_spend', amount: parseFloat(data.largestContractorPayment), unit: 'rupees_per_year' })
      } else if (data.hiresContractors === false) {
        facts.push({ kind: 'contractor.annual_spend', amount: 0, unit: 'rupees_per_year' })
      }

      // Professional fees
      if (data.paysProfessionalFees === true && data.largestProfFeePayment) {
        facts.push({ kind: 'professional_fee.annual_spend', amount: parseFloat(data.largestProfFeePayment), unit: 'rupees_per_year' })
      } else if (data.paysProfessionalFees === false) {
        facts.push({ kind: 'professional_fee.annual_spend', amount: 0, unit: 'rupees_per_year' })
      }

      // Employees
      if (data.employeeCount) {
        facts.push({ kind: 'headcount.total', amount: parseInt(data.employeeCount), unit: 'count' })
      }

      // Turnover
      if (data.annualTurnover) {
        facts.push({ kind: 'turnover.annual', amount: parseFloat(data.annualTurnover), unit: 'rupees_per_year' })
      }

      // Director remuneration
      if (data.paysDirectorRemuneration === true && data.directorRemunerationAmount) {
        facts.push({ kind: 'director.remuneration', amount: parseFloat(data.directorRemunerationAmount), unit: 'rupees_per_year' })
      } else if (data.paysDirectorRemuneration === false) {
        facts.push({ kind: 'director.remuneration', amount: 0, unit: 'rupees_per_year' })
      }

      // Save all facts
      for (const f of facts) {
        await recordFact({
          companyId,
          kind: f.kind,
          periodStart,
          periodEnd,
          amount: f.amount,
          unit: f.unit,
          sourceKind: 'user_declared',
          confidence: 1.0,
        })
      }

      // Save boolean facts
      if (data.anyEmployeeBelow21k !== null) {
        await recordFact({
          companyId, kind: 'employee.below_21k_exists', periodStart, periodEnd,
          payload: { value: data.anyEmployeeBelow21k }, unit: 'boolean',
          sourceKind: 'user_declared', confidence: 1.0,
        })
      }
      if (data.isCompositionDealer !== null) {
        await recordFact({
          companyId, kind: 'gst.composition_dealer', periodStart, periodEnd,
          payload: { value: data.isCompositionDealer }, unit: 'boolean',
          sourceKind: 'user_declared', confidence: 1.0,
        })
      }
      if (data.hasImportsExports !== null) {
        await recordFact({
          companyId, kind: 'trade.imports_exports', periodStart, periodEnd,
          payload: { value: data.hasImportsExports }, unit: 'boolean',
          sourceKind: 'user_declared', confidence: 1.0,
        })
      }

      showToast('Business details saved — evaluating compliances...', 'success')
      onComplete()
    } catch (err) {
      console.error('[IntakeForm] save failed', err)
      showToast('Failed to save', 'error')
    }
    setSaving(false)
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <h3 className="text-xl font-light text-white">Tell us about your business</h3>
        <p className="text-sm text-gray-400 mt-1">
          We need a few details to show only the compliances that apply to you. Takes 2 minutes.
        </p>
      </div>

      <div className="space-y-5">
        {/* Rent */}
        <Question
          label="Do you pay office/premises rent?"
          value={data.paysRent}
          onChange={v => set('paysRent', v)}
        />
        {data.paysRent === true && (
          <AmountField
            label="Highest monthly rent to any single landlord (₹)"
            value={data.monthlyRentAmount}
            onChange={v => set('monthlyRentAmount', v)}
            placeholder="e.g. 50000"
            hint="TDS on rent applies if > ₹50,000/month per landlord"
          />
        )}

        {/* Contractors */}
        <Question
          label="Do you hire contractors or sub-contractors?"
          value={data.hiresContractors}
          onChange={v => set('hiresContractors', v)}
        />
        {data.hiresContractors === true && (
          <AmountField
            label="Largest single payment to any contractor this FY (₹)"
            value={data.largestContractorPayment}
            onChange={v => set('largestContractorPayment', v)}
            placeholder="e.g. 30000"
            hint="TDS on contractors applies if > ₹30,000 single or ₹1,00,000 aggregate"
          />
        )}

        {/* Professional fees */}
        <Question
          label="Do you pay professional/technical fees (CA, lawyer, consultant)?"
          value={data.paysProfessionalFees}
          onChange={v => set('paysProfessionalFees', v)}
        />
        {data.paysProfessionalFees === true && (
          <AmountField
            label="Largest annual payment to any single professional (₹)"
            value={data.largestProfFeePayment}
            onChange={v => set('largestProfFeePayment', v)}
            placeholder="e.g. 50000"
            hint="TDS on professional fees applies if > ₹50,000/year per payee"
          />
        )}

        {/* Director remuneration */}
        <Question
          label="Do you pay director salary/remuneration?"
          value={data.paysDirectorRemuneration}
          onChange={v => set('paysDirectorRemuneration', v)}
        />
        {data.paysDirectorRemuneration === true && (
          <AmountField
            label="Total annual director remuneration (₹)"
            value={data.directorRemunerationAmount}
            onChange={v => set('directorRemunerationAmount', v)}
            placeholder="e.g. 600000"
            hint="TDS u/s 194T applies if > ₹20,000/year"
          />
        )}

        {/* Employees */}
        <AmountField
          label="Total number of employees"
          value={data.employeeCount}
          onChange={v => set('employeeCount', v)}
          placeholder="e.g. 15"
          hint="PF applies if ≥ 20 employees"
        />
        {parseInt(data.employeeCount) > 0 && (
          <Question
            label="Any employee earning less than ₹21,000/month?"
            value={data.anyEmployeeBelow21k}
            onChange={v => set('anyEmployeeBelow21k', v)}
            hint="ESI applies if employees earn ≤ ₹21,000/month"
          />
        )}

        {/* Turnover */}
        <AmountField
          label="Annual turnover (₹)"
          value={data.annualTurnover}
          onChange={v => set('annualTurnover', v)}
          placeholder="e.g. 10000000"
          hint="Determines tax audit (>₹1Cr), E-invoicing (>₹5Cr), QRMP eligibility"
        />

        {/* GST composition */}
        <Question
          label="Are you a composition dealer under GST?"
          value={data.isCompositionDealer}
          onChange={v => set('isCompositionDealer', v)}
          hint="Composition dealers file CMP-08 + GSTR-4 instead of regular returns"
        />

        {/* Imports/exports */}
        <Question
          label="Do you have imports or exports?"
          value={data.hasImportsExports}
          onChange={v => set('hasImportsExports', v)}
          hint="Determines FEMA compliance, IEC requirements"
        />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={onComplete}
          className="text-sm text-gray-400 hover:text-white"
        >
          Skip for now
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-6 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save & generate tracker'}
        </button>
      </div>
    </div>
  )
}

function Question({ label, value, onChange, hint }: {
  label: string
  value: boolean | null
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <div>
      <p className="text-sm text-gray-200">{label}</p>
      {hint && <p className="text-[10px] text-gray-500 mt-0.5">{hint}</p>}
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-4 py-1.5 rounded text-sm transition-colors ${value === true ? 'bg-white text-black' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-4 py-1.5 rounded text-sm transition-colors ${value === false ? 'bg-white text-black' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          No
        </button>
      </div>
    </div>
  )
}

function AmountField({ label, value, onChange, placeholder, hint }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  hint?: string
}) {
  return (
    <div>
      <label className="text-sm text-gray-200">{label}</label>
      {hint && <p className="text-[10px] text-gray-500 mt-0.5">{hint}</p>}
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full max-w-xs px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-gray-500"
      />
    </div>
  )
}
