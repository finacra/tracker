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
      <div className="flex items-center justify-between px-4 py-2 bg-bg-elevated border border-line/10 rounded-token-md">
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <svg className="w-3.5 h-3.5 text-accent-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span>
            Compliance applicability is up to date for{' '}
            <span className="font-mono tabular-nums text-fg-secondary">{financialYear}</span>.
          </span>
        </div>
        <button
          onClick={() => handleEvaluate()}
          disabled={running}
          className="text-xs text-fg-muted hover:text-fg-primary disabled:opacity-50 transition-colors duration-token ease-token"
        >
          {running ? 'Running…' : 'Re-evaluate'}
        </button>
      </div>
    )
  }

  // ── Active banner with review queue + intake CTA ───────────────────────
  return (
    <div className="bg-accent-warn/[0.05] border border-accent-warn/25 rounded-token-md overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent-warn/10 transition-colors duration-token ease-token"
      >
        <div className="flex items-center gap-2.5 text-left">
          <svg className="w-4 h-4 text-accent-warn flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <span className="text-sm font-medium text-fg-primary">
              <span className="font-mono tabular-nums">{pendingCount}</span> item{pendingCount === 1 ? '' : 's'} need your input
            </span>
            <span className="ml-2 text-[11px] text-fg-muted">
              to finalise your tracker for FY <span className="font-mono tabular-nums">{financialYear}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); handleEvaluate() }}
            className={`text-[11px] px-2.5 py-1 rounded-token-sm border border-line/15 text-fg-secondary hover:border-line/30 hover:text-fg-primary transition-colors duration-token ease-token ${running ? 'opacity-50' : ''}`}
          >
            {running ? 'Running…' : 'Re-evaluate'}
          </span>
          <svg
            className={`w-4 h-4 text-fg-muted transition-transform duration-token ease-token ${collapsed ? '' : 'rotate-180'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-accent-warn/20 divide-y divide-accent-warn/15">
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
            <div className="px-4 py-2 text-[11px] text-fg-muted">Loading…</div>
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
            <span className="text-sm text-fg-primary font-medium">{item.rule.name}</span>
            <span className="text-[10px] font-mono tabular-nums text-accent-warn border border-accent-warn/25 bg-accent-warn/10 px-1.5 py-0.5 rounded-full">
              {confidencePct}%
            </span>
            <span className="text-[10px] text-fg-muted uppercase tracking-wider">{item.rule.category}</span>
          </div>
          {question ? (
            <>
              <p className="text-xs text-fg-muted mt-1">{question.question}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-fg-muted text-sm">₹</span>
                <input
                  type="number"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder={question.placeholder}
                  className="w-40 px-2.5 py-1 bg-bg-card border border-line/15 rounded-token-sm text-fg-primary text-sm font-mono tabular-nums focus:outline-none focus:border-accent-brand/60 focus:ring-2 focus:ring-accent-brand/25 transition-colors duration-token ease-token"
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveAmount() }}
                />
                <button
                  onClick={handleSaveAmount}
                  disabled={!value.trim()}
                  className="px-3 py-1 bg-accent-brand text-white rounded-token-sm text-[11px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity duration-token ease-token"
                >
                  Save
                </button>
                <button
                  onClick={() => handleOverride(false)}
                  className="text-[11px] text-fg-muted hover:text-accent-danger ml-1 transition-colors duration-token ease-token"
                >
                  Not applicable
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-fg-muted">Does this apply to your company?</span>
              <button
                onClick={() => handleOverride(true)}
                className="px-2.5 py-1 text-[11px] border border-accent-success/40 text-accent-success rounded-token-sm hover:bg-accent-success/10 transition-colors duration-token ease-token"
              >
                Yes
              </button>
              <button
                onClick={() => handleOverride(false)}
                className="px-2.5 py-1 text-[11px] border border-accent-danger/40 text-accent-danger rounded-token-sm hover:bg-accent-danger/10 transition-colors duration-token ease-token"
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
