'use client'

import React, { useState, useMemo } from 'react'
import { calculateAdvanceTaxShortfall, formatINR } from '@/lib/utils/advance-tax-calculator'

interface AdvanceTaxPanelProps {
  financialYear?: string
}

export default function AdvanceTaxPanel({ financialYear }: AdvanceTaxPanelProps) {
  const [estimatedLiability, setEstimatedLiability] = useState<string>('')
  const [payments, setPayments] = useState<Record<string, string>>({
    Q1: '', Q2: '', Q3: '', Q4: '',
  })

  const summary = useMemo(() => {
    const liability = parseFloat(estimatedLiability) || 0
    const parsed: Partial<Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number>> = {}
    for (const [q, v] of Object.entries(payments)) {
      const num = parseFloat(v)
      if (num > 0) parsed[q as 'Q1' | 'Q2' | 'Q3' | 'Q4'] = num
    }
    return calculateAdvanceTaxShortfall(liability, parsed)
  }, [estimatedLiability, payments])

  const hasData = parseFloat(estimatedLiability) > 0

  return (
    <div className="bg-bg-card/50 border border-line/15/50 rounded-lg p-4">
      <h4 className="text-sm font-medium text-fg-primary mb-3">
        Advance Tax Calculator {financialYear && <span className="text-fg-muted font-normal">— {financialYear}</span>}
      </h4>

      {/* Estimated Liability Input */}
      <div className="mb-4">
        <label className="block text-xs text-fg-muted mb-1">Estimated Tax Liability (₹)</label>
        <input
          type="number"
          value={estimatedLiability}
          onChange={(e) => setEstimatedLiability(e.target.value)}
          placeholder="e.g. 1000000"
          className="w-full sm:w-64 px-3 py-1.5 bg-bg-elevated border border-line/30 rounded text-fg-primary text-sm focus:outline-none focus:border-line/40"
        />
      </div>

      {hasData && (
        <>
          {/* Quarterly Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-fg-muted border-b border-line/15">
                  <th className="text-left py-2 pr-3">Quarter</th>
                  <th className="text-left py-2 pr-3">Due Date</th>
                  <th className="text-right py-2 pr-3">Due Amount</th>
                  <th className="text-right py-2 pr-3">Paid</th>
                  <th className="text-right py-2 pr-3">Shortfall</th>
                  <th className="text-right py-2">Interest</th>
                </tr>
              </thead>
              <tbody>
                {summary.installments.map((inst) => (
                  <tr key={inst.quarter} className="border-b border-line/10">
                    <td className="py-2 pr-3 text-fg-primary font-medium">
                      {inst.quarter} ({inst.cumulativePercent}%)
                    </td>
                    <td className="py-2 pr-3 text-fg-secondary">{inst.dueDate}</td>
                    <td className="py-2 pr-3 text-right text-fg-secondary">{formatINR(inst.estimatedAmount)}</td>
                    <td className="py-2 pr-3 text-right">
                      <input
                        type="number"
                        value={payments[inst.quarter]}
                        onChange={(e) => setPayments(prev => ({ ...prev, [inst.quarter]: e.target.value }))}
                        placeholder="0"
                        className="w-24 px-2 py-1 bg-bg-elevated border border-line/30 rounded text-fg-primary text-right text-xs focus:outline-none focus:border-line/40"
                      />
                    </td>
                    <td className={`py-2 pr-3 text-right ${inst.shortfall > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {inst.shortfall > 0 ? formatINR(inst.shortfall) : '—'}
                    </td>
                    <td className={`py-2 text-right ${inst.interestAmount > 0 ? 'text-red-400' : 'text-fg-muted'}`}>
                      {inst.isExemptFromInterest ? (
                        <span className="text-green-400 text-xs">Exempt</span>
                      ) : inst.interestAmount > 0 ? (
                        formatINR(inst.interestAmount)
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line/30">
                  <td colSpan={2} className="py-2 text-fg-primary font-medium">Total</td>
                  <td className="py-2 text-right text-fg-primary font-medium">{formatINR(summary.estimatedLiability)}</td>
                  <td className="py-2 text-right text-fg-primary font-medium">{formatINR(summary.totalPaid)}</td>
                  <td className={`py-2 text-right font-medium ${summary.totalShortfall > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {summary.totalShortfall > 0 ? formatINR(summary.totalShortfall) : '—'}
                  </td>
                  <td className={`py-2 text-right font-medium ${summary.totalInterest > 0 ? 'text-red-400' : 'text-fg-muted'}`}>
                    {summary.totalInterest > 0 ? formatINR(summary.totalInterest) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Info note */}
          <p className="mt-3 text-[10px] text-fg-muted">
            Interest u/s 234C: 1% per month on shortfall. Q2 exempt if cumulative payment ≥ 36% of estimated tax.
          </p>
        </>
      )}
    </div>
  )
}
