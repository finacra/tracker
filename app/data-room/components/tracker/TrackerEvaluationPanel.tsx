'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { runApplicabilityEvaluation, listAssessments, overrideAssessment } from '../../actions-evaluator'
import { listFacts } from '../../actions-facts'
import { showToast } from '@/components/ui/Toast'
import ComplianceIntakeForm from './ComplianceIntakeForm'
import {
  TRIGGER_QUESTIONS,
  inferQuestionFromRuleName,
  KEY_FACT_KINDS,
  type ReviewQuestion,
} from './reviewQuestions'

interface Props {
  companyId: string
  financialYear: string
}

interface AssessmentItem {
  id: string
  ruleId: string
  confidence: number
  userOverridden: boolean
  triggerKind?: string
  rule: {
    name: string
    category: string
  }
}

const REVIEW_FLOOR = 0.50
const REVIEW_CEIL = 0.85

/**
 * Sits above the list view. Surfaces the intake form (when key facts are
 * missing) and inline questions for low-confidence rules. Kept compact
 * by default — the panel collapses to a single strip when there's
 * nothing actionable, and expands inline when there is.
 */
export default function TrackerEvaluationPanel({ companyId, financialYear }: Props) {
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [showIntake, setShowIntake] = useState(false)
  const [needsIntake, setNeedsIntake] = useState(false)
  const [reviewItems, setReviewItems] = useState<AssessmentItem[]>([])
  const autoEvaluatedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Fact check — determine if intake is still useful
      const fyStart = `${financialYear.slice(0, 4)}-04-01`
      const fyEndYear = parseInt(financialYear.slice(0, 4), 10) + 1
      const fyEnd = `${fyEndYear}-03-31`
      const factsRes = await listFacts(companyId, fyStart, fyEnd)
      const factCount = (factsRes.facts || []).filter(f => KEY_FACT_KINDS.includes(f.kind)).length
      setNeedsIntake(factCount < 2)

      // Assessment check — pull review queue
      const ass = await listAssessments(companyId, financialYear, { includeNotApplicable: true })
      const items: AssessmentItem[] = (ass.items || [])
        .filter(a => !a.userOverridden && a.confidence >= REVIEW_FLOOR && a.confidence < REVIEW_CEIL)
        .map(a => ({
          id: a.id,
          ruleId: a.ruleId,
          confidence: a.confidence,
          userOverridden: a.userOverridden,
          rule: { name: a.rule.name, category: a.rule.category },
        }))
      setReviewItems(items)
    } catch (err) {
      console.error('[EvalPanel] load failed', err)
    } finally {
      setLoading(false)
    }
  }, [companyId, financialYear])

  useEffect(() => {
    load()
  }, [load])

  // Refresh when anything elsewhere mutated facts / assessments
  useEffect(() => {
    const handler = () => load()
    window.addEventListener('cia:data-changed', handler)
    return () => window.removeEventListener('cia:data-changed', handler)
  }, [load])

  // Auto-run evaluator the first time this company+FY is opened and
  // nothing has been evaluated yet. Driven by an empty assessment set.
  useEffect(() => {
    if (loading) return
    if (autoEvaluatedRef.current) return
    // If intake is still required, skip — evaluator result would be noisy
    if (needsIntake) return
    // If we already have assessments (review items OR high-confidence ones),
    // nothing to auto-run.
    ;(async () => {
      const ass = await listAssessments(companyId, financialYear)
      if ((ass.items?.length ?? 0) === 0) {
        autoEvaluatedRef.current = true
        await handleEvaluate({ silent: true })
      } else {
        autoEvaluatedRef.current = true
      }
    })()
  }, [loading, needsIntake, companyId, financialYear]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleEvaluate = async (opts?: { silent?: boolean }) => {
    setRunning(true)
    try {
      if (!opts?.silent) showToast('Re-evaluating compliance applicability...', 'info')
      const res = await runApplicabilityEvaluation(companyId, financialYear, { skipLlmFallback: true })
      if (res.success) {
        if (!opts?.silent) {
          showToast(`${res.applicable} applicable, ${res.notApplicable} not applicable`, 'success')
        }
        window.dispatchEvent(new CustomEvent('cia:data-changed'))
        await load()
      } else if (!opts?.silent) {
        showToast(res.error || 'Evaluator failed', 'error')
      }
    } finally {
      setRunning(false)
    }
  }

  const pendingCount = reviewItems.length + (needsIntake ? 1 : 0)
  const hasAnything = pendingCount > 0

  // ── Intake full-screen takeover ────────────────────────────────────────
  if (showIntake) {
    return (
      <div className="bg-black border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
          <span className="text-xs text-gray-400">Business intake</span>
          <button
            onClick={() => setShowIntake(false)}
            className="text-xs text-gray-500 hover:text-white"
          >
            Close
          </button>
        </div>
        <ComplianceIntakeForm
          companyId={companyId}
          financialYear={financialYear}
          onComplete={async () => {
            setShowIntake(false)
            await handleEvaluate()
          }}
        />
      </div>
    )
  }

  // ── Compact strip when nothing is pending ──────────────────────────────
  if (!hasAnything) {
    return (
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900/40 border border-white/5 rounded-lg">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span>Compliance applicability is up to date for FY {financialYear}.</span>
        </div>
        <button
          onClick={() => handleEvaluate()}
          disabled={running}
          className="text-xs text-gray-400 hover:text-white disabled:opacity-50"
        >
          {running ? 'Running...' : 'Re-evaluate'}
        </button>
      </div>
    )
  }

  // ── Active banner with review queue + intake CTA ───────────────────────
  return (
    <div className="bg-amber-500/[0.03] border border-amber-500/20 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-amber-500/[0.05] transition-colors"
      >
        <div className="flex items-center gap-2.5 text-left">
          <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <span className="text-sm font-medium text-amber-200">
              {pendingCount} item{pendingCount === 1 ? '' : 's'} need your input
            </span>
            <span className="ml-2 text-[11px] text-amber-400/70">
              to finalise your tracker for FY {financialYear}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); handleEvaluate() }}
            className={`text-[11px] px-2.5 py-1 rounded border border-white/10 text-gray-300 hover:border-white/20 hover:text-white ${running ? 'opacity-50' : ''}`}
          >
            {running ? 'Running...' : 'Re-evaluate'}
          </span>
          <svg
            className={`w-4 h-4 text-amber-300/60 transition-transform ${collapsed ? '' : 'rotate-180'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-amber-500/15 divide-y divide-amber-500/10">
          {needsIntake && (
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-white">Tell us about your business</p>
                <p className="text-[11px] text-gray-400 mt-0.5">8 short questions — determines which compliances actually apply to you. Takes ~2 min.</p>
              </div>
              <button
                onClick={() => setShowIntake(true)}
                className="text-xs px-3 py-1.5 rounded bg-white text-black hover:bg-gray-200 font-medium"
              >
                Start intake
              </button>
            </div>
          )}

          {reviewItems.map(item => (
            <ReviewRow
              key={item.id}
              companyId={companyId}
              financialYear={financialYear}
              item={item}
              onResolved={load}
            />
          ))}

          {loading && (
            <div className="px-4 py-2 text-[11px] text-gray-500">Loading…</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Single review row — inline question or yes/no confirm ──────────────

function ReviewRow({
  companyId,
  financialYear,
  item,
  onResolved,
}: {
  companyId: string
  financialYear: string
  item: AssessmentItem
  onResolved: () => void
}) {
  const question = useMemo<ReviewQuestion | null>(() => {
    // TRIGGER_QUESTIONS by trigger_kind would require fetching the rule.
    // Fall back to name-based inference which covers every common case.
    return inferQuestionFromRuleName(item.rule.name, item.rule.category)
  }, [item.rule.name, item.rule.category])

  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  const confidencePct = Math.round(item.confidence * 100)

  const handleSaveAmount = async () => {
    if (!question) return
    const parsed = value.trim() === '' ? null : Number(value)
    if (parsed === null || isNaN(parsed)) {
      showToast('Enter a number', 'error')
      return
    }
    setSaving(true)
    try {
      const { recordFact, fyWindow } = await import('@/lib/compliance/facts')
      const { periodStart, periodEnd } = fyWindow(financialYear)
      await recordFact({
        companyId,
        kind: question.factKind,
        periodStart,
        periodEnd,
        amount: parsed,
        unit: question.unit,
        sourceKind: 'user_declared',
        confidence: 1,
      })
      const res = await runApplicabilityEvaluation(companyId, financialYear, { skipLlmFallback: true })
      if (res.success) showToast('Updated — re-evaluated', 'success')
      window.dispatchEvent(new CustomEvent('cia:data-changed'))
      onResolved()
    } catch (err) {
      console.error('[ReviewRow] save failed', err)
      showToast('Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleOverride = async (applicable: boolean) => {
    setSaving(true)
    try {
      const res = await overrideAssessment(
        companyId,
        item.id,
        applicable,
        applicable ? 'Confirmed by user' : 'Not applicable',
      )
      if (res.success) {
        showToast(`${item.rule.name} — ${applicable ? 'applicable' : 'not applicable'}`, 'success')
        window.dispatchEvent(new CustomEvent('cia:data-changed'))
        onResolved()
      } else {
        showToast(res.error || 'Failed to save', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-white">{item.rule.name}</span>
            <span className="text-[10px] text-amber-400/70 border border-amber-500/20 px-1.5 py-0.5 rounded">
              {confidencePct}%
            </span>
            <span className="text-[10px] text-gray-500">{item.rule.category}</span>
          </div>
          {question ? (
            <>
              <p className="text-xs text-gray-400 mt-1">{question.question}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-gray-500 text-sm">₹</span>
                <input
                  type="number"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder={question.placeholder}
                  disabled={saving}
                  className="w-40 px-2.5 py-1 bg-black border border-white/10 rounded text-white text-sm focus:outline-none focus:border-amber-400"
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveAmount() }}
                />
                <button
                  onClick={handleSaveAmount}
                  disabled={saving || !value.trim()}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black rounded text-[11px] font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => handleOverride(false)}
                  disabled={saving}
                  className="text-[11px] text-gray-400 hover:text-red-300 ml-1"
                >
                  Not applicable
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-400">Does this apply to your company?</span>
              <button
                onClick={() => handleOverride(true)}
                disabled={saving}
                className="px-2.5 py-1 text-[11px] border border-emerald-500/40 text-emerald-300 rounded hover:bg-emerald-500/10"
              >
                Yes
              </button>
              <button
                onClick={() => handleOverride(false)}
                disabled={saving}
                className="px-2.5 py-1 text-[11px] border border-red-500/40 text-red-300 rounded hover:bg-red-500/10"
              >
                No
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
