'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { runApplicabilityEvaluation, listAssessments, overrideAssessment } from '../../actions-evaluator'
import { listFactsForFY, recordUserFact } from '../../actions-facts'
import { showToast } from '@/components/ui/Toast'
import {
  TRIGGER_QUESTIONS,
  inferQuestionFromRuleName,
  type ReviewQuestion,
} from './reviewQuestions'

/**
 * NOTE: the "Tell us about your business" intake CTA used to live on
 * this panel as well. It now lives on ComplianceIntelligencePanel
 * (the main compliance setup surface) so there's a single, clear
 * path: intake → generate → review. This panel is now responsible
 * only for the LOW-CONFIDENCE REVIEW QUEUE that surfaces after the
 * evaluator runs.
 */

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
  // needsIntake is still tracked locally — used to gate the auto-
  // evaluator below — but the visible intake CTA lives in CIP now.
  const [needsIntake, setNeedsIntake] = useState(false)
  const [reviewItems, setReviewItems] = useState<AssessmentItem[]>([])
  const autoEvaluatedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Fact check — determine if intake is still useful.
      // Previously this required ≥2 facts from a narrow KEY_FACT_KINDS
      // list (rent / contractor / headcount / turnover). The intake
      // form actually records 9 different fact kinds — so a user who
      // answered the OTHER 5 (professional fees, director remuneration,
      // GST composition dealer, etc.) would be re-prompted to "fill"
      // the intake even though their data was already saved. Now we
      // treat ANY user_declared fact for this FY as proof the intake
      // has been done at least once.
      // Use the FY-aware variant — `financialYear` is "FY 2026-27" not
      // "2026-27", so client-side `slice(0, 4)` parsing produces invalid
      // date strings that match nothing.
      const factsRes = await listFactsForFY(companyId, financialYear)
      const allFacts = factsRes.facts || []
      const userDeclaredCount = allFacts.filter(f => f.sourceKind === 'user_declared').length
      setNeedsIntake(userDeclaredCount === 0)

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
      if (!opts?.silent) showToast('Re-evaluating — this may take up to a minute', 'info')
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

  // pendingCount no longer includes intake — that's owned by CIP. This
  // panel only concerns itself with the low-confidence review queue.
  const pendingCount = reviewItems.length
  const hasAnything = pendingCount > 0

  // While the first load() is in flight we render nothing. The previous
  // version showed the optimistic "up to date" strip here — which then
  // flickered to a different banner once load() resolved (~3-5s on cold
  // start), or vanished entirely if needsIntake came back true. That's
  // the "old banner, then flickers to new banner card" the user reported.
  // Single source of truth: render only after we KNOW the state.
  if (loading) return null

  // If intake is required, hide this panel entirely. CIP is showing
  // its own intake CTA; surfacing a second strip here just adds noise.
  if (needsIntake) return null

  // ── Compact strip when nothing is pending ──────────────────────────────
  if (!hasAnything) {
    return (
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900/40 border border-white/5 rounded-lg">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span>Compliance applicability is up to date for {financialYear}.</span>
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
          {/* Intake CTA removed — CIP owns it now. Review queue only. */}

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

  const confidencePct = Math.round(item.confidence * 100)

  const handleSaveAmount = () => {
    if (!question) return
    const parsed = value.trim() === '' ? null : Number(value)
    if (parsed === null || isNaN(parsed)) {
      showToast('Enter a number', 'error')
      return
    }
    // Optimistic: hide the row immediately, fire fact-save + evaluator in
    // the background. Previously we awaited both and users waited 60-120s.
    showToast('Saved — re-evaluating in background', 'success')
    onResolved()
    ;(async () => {
      try {
        const saveRes = await recordUserFact(companyId, {
          kind: question.factKind,
          financialYear,
          amount: parsed,
          unit: question.unit,
        })
        if (!saveRes.success) {
          showToast(saveRes.error || 'Save failed — try again', 'error')
          return
        }
        const ev = await runApplicabilityEvaluation(companyId, financialYear, { skipLlmFallback: true })
        if (ev.success) {
          window.dispatchEvent(new CustomEvent('cia:data-changed'))
        } else if (ev.error) {
          console.error('[ReviewRow] evaluator failed', ev.error)
        }
      } catch (err) {
        console.error('[ReviewRow] background save/evaluate threw', err)
      }
    })()
  }

  const handleOverride = (applicable: boolean) => {
    // Optimistic — overrideAssessment is fast but we want consistent UX
    showToast(`${item.rule.name} — ${applicable ? 'applicable' : 'not applicable'}`, 'success')
    onResolved()
    ;(async () => {
      try {
        const res = await overrideAssessment(
          companyId,
          item.id,
          applicable,
          applicable ? 'Confirmed by user' : 'Not applicable',
        )
        if (res.success) {
          window.dispatchEvent(new CustomEvent('cia:data-changed'))
        } else {
          showToast(res.error || 'Override failed — try again', 'error')
        }
      } catch (err) {
        console.error('[ReviewRow] override threw', err)
      }
    })()
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
                  className="w-40 px-2.5 py-1 bg-black border border-white/10 rounded text-white text-sm focus:outline-none focus:border-amber-400"
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveAmount() }}
                />
                <button
                  onClick={handleSaveAmount}
                  disabled={!value.trim()}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black rounded text-[11px] font-medium disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => handleOverride(false)}
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
                className="px-2.5 py-1 text-[11px] border border-emerald-500/40 text-emerald-300 rounded hover:bg-emerald-500/10"
              >
                Yes
              </button>
              <button
                onClick={() => handleOverride(false)}
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
