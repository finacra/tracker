'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  generateComplianceForCompany,
  validateComplianceForCompany,
  generateHistoricalCompliances,
  getAIRequirementsPendingReview,
  approveAIRequirement,
  approveAllAIRequirements,
  rejectAIRequirement,
  type AIRequirementForReview,
  type ValidateComplianceResult,
} from '../../actions-intelligence'
import { listFacts } from '../../actions-facts'
import ComplianceIntakeForm from './ComplianceIntakeForm'

interface ComplianceIntelligencePanelProps {
  companyId: string
  companyName: string
  hasNicCode: boolean
  canEdit: boolean
  hasExistingRequirements: boolean
  incorporationDate: string | null
  /** Selected financial year — needed for the intake form */
  financialYear?: string
  onRequirementsApproved: () => void // refresh the tracker after approvals
}

type ViewState = 'idle' | 'generating' | 'validating' | 'reviewing' | 'error' | 'intake'

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-red-500/20 text-red-400 border-red-500/30',
}

function getConfidenceLevel(score: number | null): 'high' | 'medium' | 'low' {
  if (!score) return 'low'
  if (score >= 0.95) return 'high'
  if (score >= 0.85) return 'medium'
  return 'low'
}

function formatConfidence(score: number | null): string {
  if (!score) return 'N/A'
  return `${Math.round(score * 100)}%`
}

const CATEGORY_ICONS: Record<string, string> = {
  'RoC': 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  'GST': 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
  'Income Tax': 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  'Payroll': 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
}

export default function ComplianceIntelligencePanel({
  companyId,
  companyName,
  hasNicCode,
  canEdit,
  hasExistingRequirements,
  incorporationDate,
  financialYear,
  onRequirementsApproved,
}: ComplianceIntelligencePanelProps) {
  const [viewState, setViewState] = useState<ViewState>('idle')
  // Intake completion is the gate for the Generate button. Without
  // intake facts, the rules engine has to guess (rent? employees?
  // turnover?) and the output is noisy. Loading happens once per
  // mount; the form's onComplete refreshes this.
  const [needsIntake, setNeedsIntake] = useState<boolean | null>(null) // null = unknown / loading
  // Pin timestamp for the optimistic-update window. After the user
  // saves the intake form we KNOW facts were written successfully, so
  // we set needsIntake=false directly. But PgBouncer's transaction-mode
  // routing means a listFacts query immediately after may land on a
  // stale connection that hasn't seen the commit yet, returning 0
  // facts and re-flipping needsIntake=true. This pin makes refreshes
  // ignore that read-after-write race for 15s — long enough for any
  // pooled connection to catch up.
  const optimisticPinUntilRef = useRef<number>(0)
  const refreshIntakeStatus = useCallback(async (opts?: { force?: boolean }) => {
    if (!financialYear) {
      setNeedsIntake(false)
      return
    }
    // Honor the optimistic pin unless the caller explicitly forces.
    // The mount-time refresh DOES bypass the pin (no pin yet at mount).
    if (!opts?.force && Date.now() < optimisticPinUntilRef.current) {
      console.log('[CIP:refreshIntakeStatus] skipped — within optimistic-pin window')
      return
    }
    // Client-side timeout. Without this, a hung listFacts call would
    // leave needsIntake = null forever, leaving the user staring at the
    // "Checking your business profile…" placeholder spinner.
    const timeoutSignal = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('LIST_FACTS_TIMEOUT')), 8_000),
    )
    try {
      const fyStart = `${financialYear.slice(0, 4)}-04-01`
      const fyEndYear = parseInt(financialYear.slice(0, 4), 10) + 1
      const fyEnd = `${fyEndYear}-03-31`
      const res = await Promise.race([
        listFacts(companyId, fyStart, fyEnd),
        timeoutSignal,
      ])
      const userDeclared = (res.facts || []).filter(f => f.sourceKind === 'user_declared').length
      const next = userDeclared === 0
      console.log('[CIP:refreshIntakeStatus]', {
        companyId,
        financialYear,
        userDeclaredCount: userDeclared,
        needsIntake: next,
        sample: (res.facts || []).slice(0, 3).map(f => ({ kind: f.kind, source: f.sourceKind })),
      })
      // Belt-and-suspenders: if the optimistic pin is active and listFacts
      // returned 0 user-declared facts, that's almost certainly the
      // read-after-write race rather than truth — keep the optimistic value.
      if (Date.now() < optimisticPinUntilRef.current && next === true) {
        console.log('[CIP:refreshIntakeStatus] suppressing stale 0-facts read inside pin window')
        return
      }
      setNeedsIntake(next)
    } catch (err) {
      console.warn('[CIP:refreshIntakeStatus] threw', err instanceof Error ? err.message : err)
      setNeedsIntake(false) // fail open — don't block Generate on a status-check error
    }
  }, [companyId, financialYear])
  useEffect(() => {
    refreshIntakeStatus()
  }, [refreshIntakeStatus])

  // Re-check intake status whenever facts change anywhere in the app
  // (intake form save, evaluator run, agent mutation). Without this,
  // a stale needsIntake=true could survive after the user completed
  // intake — leading to "still asking for intake form after saving".
  useEffect(() => {
    const handler = () => {
      console.log('[CIP] cia:data-changed received — refreshing intake status')
      refreshIntakeStatus()
    }
    window.addEventListener('cia:data-changed', handler)
    return () => window.removeEventListener('cia:data-changed', handler)
  }, [refreshIntakeStatus])
  const [requirements, setRequirements] = useState<AIRequirementForReview[]>([])
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<{
    total: number
    rulesEngineCount: number
    aiCount: number
    highConf: number
    needsReview: number
    missingFields: string[]
  } | null>(null)
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set())
  const [isApprovingAll, setIsApprovingAll] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [validationResults, setValidationResults] = useState<Array<{
    requirementName: string
    verdict: 'applicable' | 'not_applicable' | 'uncertain'
    reason: string
    sourceUrl: string | null
  }> | null>(null)
  const [validationStats, setValidationStats] = useState<{
    validated: number
    flagged: number
    removed: number
    discovered: number
  } | null>(null)
  const [isGeneratingHistory, setIsGeneratingHistory] = useState(false)
  const [showHistorySelector, setShowHistorySelector] = useState(false)
  const [historyResult, setHistoryResult] = useState<{
    generated: number
    yearsBack: number
    capped: boolean
  } | null>(null)
  const [discoveredItems, setDiscoveredItems] = useState<Array<{
    name: string
    category: string
    act: string
    authority: string
    confidenceScore: number
  }> | null>(null)

  // ── Generate ─────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    setViewState('generating')
    setError(null)

    // Hard client-side bail-out via Promise.race. The previous
    // implementation flipped a `timedOut` boolean but kept awaiting
    // the same hung promise — useless, the UI stayed stuck on the
    // spinner. With Promise.race, whichever resolves first wins; if
    // the timeout fires we throw and land in the catch block.
    const TIMEOUT_MS = 90_000
    const timeoutSignal = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('CIP_GENERATE_TIMEOUT')), TIMEOUT_MS)
    )

    try {
      console.log('[CIP:handleGenerate] starting', { companyId })
      const result = await Promise.race([
        generateComplianceForCompany(companyId),
        timeoutSignal,
      ])

      if (!result.success) {
        console.error('[CIP:handleGenerate] server returned failure', result.error)
        setError(result.error || 'Generation failed')
        setViewState('error')
        return
      }

      setStats({
        total: result.totalGenerated || 0,
        rulesEngineCount: result.rulesEngineCount || 0,
        aiCount: result.aiCount || 0,
        highConf: result.highConfidence || 0,
        needsReview: result.needsReview || 0,
        missingFields: result.missingProfileFields || [],
      })

      // Capture validation results
      if (result.validationRan) {
        setValidationStats({
          validated: result.validatedCount || 0,
          flagged: result.flaggedCount || 0,
          removed: result.removedByValidation || 0,
          discovered: 0, // generate flow doesn't discover — that's standalone validate
        })
        if (result.validationResults && result.validationResults.length > 0) {
          setValidationResults(result.validationResults)
        }
      }

      // Fetch AI-generated items pending review (rules engine items are auto-approved)
      const reviewResult = await getAIRequirementsPendingReview(companyId)
      if (reviewResult.success && reviewResult.requirements && reviewResult.requirements.length > 0) {
        setRequirements(reviewResult.requirements)
        setViewState('reviewing')
      } else {
        // No AI items to review — rules engine results are already active
        setViewState('idle')
        if ((result.rulesEngineCount || 0) > 0) {
          onRequirementsApproved() // refresh the tracker to show new rules engine items
        }
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === 'CIP_GENERATE_TIMEOUT'
      console.error('[CIP:handleGenerate] threw',
        err instanceof Error ? err.message : String(err),
        err instanceof Error ? err.stack : '')

      // CRITICAL: leave the spinner state IMMEDIATELY before any further
      // async work. The previous version awaited getAIRequirementsPendingReview
      // here without a timeout — when that second server call also stalled
      // on a Vercel cold start, viewState stayed 'generating' and the
      // spinner ran forever. That's the real "infinite loop" the user
      // saw: not the original Promise.race, but the second hidden await.
      const msg = err instanceof Error ? err.message : 'Generation failed'
      setError(isTimeout
        ? 'Generation took longer than expected (90s+). Any compliances that did land are now visible in the tracker below — click Re-evaluate to retry.'
        : msg)
      setViewState('error')

      // Best-effort recovery — refresh the tracker (cheap, fire-and-forget)
      // and probe the AI review queue (with its own timeout). Both run
      // AFTER the spinner has been torn down, so a hang here is invisible
      // to the user.
      try {
        onRequirementsApproved()
      } catch {}

      if (isTimeout) {
        try {
          const probeTimeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('REVIEW_PROBE_TIMEOUT')), 8_000),
          )
          const reviewResult = await Promise.race([
            getAIRequirementsPendingReview(companyId),
            probeTimeout,
          ])
          if (reviewResult.success && reviewResult.requirements && reviewResult.requirements.length > 0) {
            setRequirements(reviewResult.requirements)
            setViewState('reviewing')
          }
        } catch {}
      }
    }
  }, [companyId, onRequirementsApproved])

  // ── Load existing pending review items ──────────────────────────────

  const handleLoadPending = useCallback(async () => {
    const result = await getAIRequirementsPendingReview(companyId)
    if (result.success && result.requirements && result.requirements.length > 0) {
      setRequirements(result.requirements)
      setViewState('reviewing')
    }
  }, [companyId])

  // ── Standalone Validate ─────────────────────────────────────────────

  const handleValidate = useCallback(async () => {
    setViewState('validating')
    setError(null)
    setValidationResults(null)
    setValidationStats(null)
    setDiscoveredItems(null)

    const result = await validateComplianceForCompany(companyId)

    if (!result.success) {
      setError(result.error || 'Validation failed')
      setViewState('error')
      return
    }

    setValidationStats({
      validated: result.validatedCount || 0,
      flagged: result.flaggedCount || 0,
      removed: result.removedCount || 0,
      discovered: result.discoveredCount || 0,
    })

    if (result.results && result.results.length > 0) {
      setValidationResults(result.results)
    }

    if (result.discovered && result.discovered.length > 0) {
      setDiscoveredItems(result.discovered)
    }

    // Refresh tracker if items were removed or discovered
    if ((result.removedCount || 0) > 0 || (result.discoveredCount || 0) > 0) {
      onRequirementsApproved()
    }

    setViewState('idle')
  }, [companyId, onRequirementsApproved])

  // ── Generate Historical ────────────────────────────────────────────

  const maxHistoricalYears = React.useMemo(() => {
    if (!incorporationDate) return 0
    const incorp = new Date(incorporationDate)
    const now = new Date()
    return Math.floor((now.getTime() - incorp.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
  }, [incorporationDate])

  const handleGenerateHistory = useCallback(async (years: number) => {
    setIsGeneratingHistory(true)
    setShowHistorySelector(false)
    setHistoryResult(null)

    const result = await generateHistoricalCompliances(companyId, years)

    if (result.success) {
      setHistoryResult({
        generated: result.generated || 0,
        yearsBack: result.yearsBack || years,
        capped: result.cappedAtIncorporation || false,
      })
      if ((result.generated || 0) > 0) {
        onRequirementsApproved()
      }
    } else {
      setError(result.error || 'Historical generation failed')
    }

    setIsGeneratingHistory(false)
  }, [companyId, onRequirementsApproved])

  // Check for pending items on mount
  React.useEffect(() => {
    handleLoadPending()
  }, [handleLoadPending])

  // ── Approve single ──────────────────────────────────────────────────

  const handleApprove = useCallback(async (reqId: string) => {
    console.log('[CompliancePanel] Approving:', reqId, 'companyId:', companyId)
    setApprovingIds(prev => new Set(prev).add(reqId))
    const result = await approveAIRequirement(reqId, companyId)
    console.log('[CompliancePanel] Approve result:', result)
    if (result.success) {
      setRequirements(prev => prev.filter(r => r.id !== reqId))
      onRequirementsApproved()
    } else {
      console.error('[CompliancePanel] Approve failed:', result.error)
    }
    setApprovingIds(prev => {
      const next = new Set(prev)
      next.delete(reqId)
      return next
    })
  }, [companyId, onRequirementsApproved])

  // ── Reject single ──────────────────────────────────────────────────

  const handleReject = useCallback(async (reqId: string) => {
    setApprovingIds(prev => new Set(prev).add(reqId))
    const result = await rejectAIRequirement(reqId, companyId)
    if (result.success) {
      setRequirements(prev => prev.filter(r => r.id !== reqId))
    } else {
      console.error('[CompliancePanel] Reject failed:', result.error)
    }
    setApprovingIds(prev => {
      const next = new Set(prev)
      next.delete(reqId)
      return next
    })
  }, [companyId])

  // ── Approve all ─────────────────────────────────────────────────────

  const handleApproveAll = useCallback(async () => {
    console.log('[CompliancePanel] Approve all, count:', requirements.length, 'batchId:', requirements[0]?.ai_batch_id)
    setIsApprovingAll(true)
    const batchId = requirements[0]?.ai_batch_id || undefined
    const result = await approveAllAIRequirements(companyId, batchId || undefined)
    console.log('[CompliancePanel] Approve all result:', result)
    if (result.success) {
      setRequirements([])
      setViewState('idle')
      onRequirementsApproved()
    } else {
      console.error('[CompliancePanel] Approve all failed:', result.error)
    }
    setIsApprovingAll(false)
  }, [companyId, requirements, onRequirementsApproved])

  // ── Auto-refresh tracker when all items reviewed ────────────────────

  React.useEffect(() => {
    if (viewState === 'reviewing' && requirements.length === 0) {
      setViewState('idle')
      onRequirementsApproved()
    }
  }, [requirements.length, viewState, onRequirementsApproved])

  // ── Intake takeover: full-bleed business intake form ────────────────

  if (viewState === 'intake' && financialYear) {
    return (
      <div className="border border-amber-500/20 rounded-xl bg-amber-500/[0.03] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-amber-500/15 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-amber-400/80 font-medium">Step 1 of 2</span>
            <span className="text-xs text-gray-300">Tell us about your business</span>
          </div>
          <button
            onClick={() => setViewState('idle')}
            className="text-xs text-gray-500 hover:text-white"
          >
            Cancel
          </button>
        </div>
        <ComplianceIntakeForm
          companyId={companyId}
          financialYear={financialYear}
          onComplete={() => {
            // Optimistic — the intake form only calls onComplete on a
            // SUCCESSFUL save (it surfaces errors itself and bails out).
            // So we know facts are written. Pin the optimistic value
            // for 15s so the cia:data-changed listener (and our own
            // belt-and-suspenders refresh below) can't clobber it via
            // the read-after-write race where PgBouncer transaction-
            // mode routing returns 0 facts from a stale connection.
            optimisticPinUntilRef.current = Date.now() + 15_000
            setNeedsIntake(false)
            setViewState('idle')
            // Trigger generate immediately so the user doesn't have
            // to click another button after completing intake.
            handleGenerate()
          }}
        />
      </div>
    )
  }

  // ── Idle state: show generate button ────────────────────────────────

  if (viewState === 'idle') {
    if (!canEdit) return null

    // Derive the current "phase" so the panel's primary CTA aligns
    // with what the user actually needs to do next. While the
    // intake-status query is still loading (needsIntake === null),
    // we show a neutral 'loading' phase — without this, the panel
    // flashes "Step 2 of 2 Generate" first and snaps to "Step 1 of
    // 2 Tell us about your business" once the facts query returns
    // (3-5s on cold start), which is exactly the bug the user
    // reported.
    const phase: 'loading' | 'intake' | 'first-generate' | 'maintenance' =
      needsIntake === null
        ? 'loading'
        : needsIntake === true
          ? 'intake'
          : !hasExistingRequirements
            ? 'first-generate'
            : 'maintenance'

    return (
      <div className="border border-gray-700/50 rounded-xl p-4 sm:p-6 bg-gradient-to-br from-blue-500/5 to-purple-500/5">
        {/* Step indicator strip — single source of truth for "what's next" */}
        <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-medium">
          {phase === 'loading' && (
            <>
              <span className="text-gray-500 inline-flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-500 animate-pulse" />
                Checking
              </span>
              <span className="text-gray-600">— Determining what's next for your tracker…</span>
            </>
          )}
          {phase === 'intake' && (
            <>
              <span className="text-amber-400">● Step 1 of 2</span>
              <span className="text-gray-600">— Business intake required before we can generate accurate rules</span>
            </>
          )}
          {phase === 'first-generate' && (
            <>
              <span className="text-blue-400">● Step 2 of 2</span>
              <span className="text-gray-600">— Generate your initial compliance ruleset</span>
            </>
          )}
          {phase === 'maintenance' && (
            <>
              <span className="text-emerald-400">● Up to date</span>
              <span className="text-gray-600">— Re-evaluate any time facts change</span>
            </>
          )}
        </div>
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-400 sm:w-6 sm:h-6">
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold text-sm sm:text-base">Compliance Intelligence</h3>
            <p className="text-gray-400 text-xs sm:text-sm mt-1">
              Evaluates <span className="text-white font-medium">{companyName}</span> against 60+ Indian regulatory rules based on company type, state, industry, employee count, and turnover. Then uses AI to find any specialized compliances the rules engine may miss.
            </p>

            {/* Stats from last generation */}
            {stats && stats.total > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {stats.rulesEngineCount} from rules engine (auto-applied)
                </span>
                {stats.aiCount > 0 && (
                  <span className="px-2 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    {stats.aiCount} from AI (reviewed)
                  </span>
                )}
              </div>
            )}

            {/* Missing fields warning */}
            {stats && stats.missingFields.length > 0 && (
              <div className="mt-2 p-2 rounded-lg bg-yellow-500/5 border border-yellow-500/15">
                <p className="text-yellow-400/80 text-xs">
                  Missing: {stats.missingFields.map(f => {
                    const labels: Record<string, string> = { company_type: 'Company Type', employee_count: 'Employee Count', annual_turnover: 'Annual Turnover', state: 'State', nic_code: 'NIC Code', net_worth: 'Net Worth' }
                    return labels[f] || f
                  }).join(', ')}.
                  Some rules included as precaution. Update the company profile for accuracy.
                </p>
              </div>
            )}

            {!hasNicCode && (
              <p className="text-yellow-400/80 text-xs mt-2">
                NIC code not set — industry-specific rules will be skipped. Update the company profile for full coverage.
              </p>
            )}

            {/* Validation results summary */}
            {validationStats && (
              <div className="mt-3 p-3 rounded-lg bg-gray-900/50 border border-gray-700/50">
                <div className="flex items-center gap-2 mb-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-white text-xs font-semibold">AI Validation Complete</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {validationStats.validated - validationStats.flagged} confirmed applicable
                  </span>
                  {validationStats.removed > 0 && (
                    <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                      {validationStats.removed} removed (not applicable)
                    </span>
                  )}
                  {validationStats.flagged - validationStats.removed > 0 && (
                    <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                      {validationStats.flagged - validationStats.removed} uncertain (needs CA review)
                    </span>
                  )}
                  {validationStats.discovered > 0 && (
                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {validationStats.discovered} new discovered (pending review)
                    </span>
                  )}
                </div>

                {/* Flagged items details */}
                {validationResults && validationResults.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {validationResults.map((v, i) => (
                      <div key={i} className={`flex items-start gap-2 text-xs p-1.5 rounded ${
                        v.verdict === 'not_applicable'
                          ? 'bg-red-500/5 border border-red-500/10'
                          : 'bg-yellow-500/5 border border-yellow-500/10'
                      }`}>
                        <span className={`flex-shrink-0 mt-0.5 ${
                          v.verdict === 'not_applicable' ? 'text-red-400' : 'text-yellow-400'
                        }`}>
                          {v.verdict === 'not_applicable' ? '✕' : '?'}
                        </span>
                        <div className="min-w-0">
                          <span className={`font-medium ${
                            v.verdict === 'not_applicable' ? 'text-red-300 line-through' : 'text-yellow-300'
                          }`}>
                            {v.requirementName}
                          </span>
                          <span className="text-gray-500 ml-1.5">— {v.reason}</span>
                          {v.sourceUrl && (
                            <a href={v.sourceUrl} target="_blank" rel="noopener noreferrer"
                              className="text-blue-400 hover:underline ml-1.5 inline-block">[source]</a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Discovered (missing) items */}
                {discoveredItems && discoveredItems.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-blue-400 text-xs font-semibold mt-1">Newly Discovered:</p>
                    {discoveredItems.map((d, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs p-1.5 rounded bg-blue-500/5 border border-blue-500/10">
                        <span className="flex-shrink-0 mt-0.5 text-blue-400">+</span>
                        <div className="min-w-0">
                          <span className="font-medium text-blue-300">{d.name}</span>
                          <span className="text-gray-500 ml-1.5">— {d.act} ({d.authority})</span>
                          <span className="text-gray-600 ml-1.5">{Math.round(d.confidenceScore * 100)}% confidence</span>
                        </div>
                      </div>
                    ))}
                    <p className="text-gray-500 text-[10px] mt-1">Discovered items added as "pending review" — approve them in the review panel above.</p>
                  </div>
                )}
              </div>
            )}

            {/* Historical generation result */}
            {historyResult && (
              <div className="mt-3 p-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
                <p className="text-amber-400/90 text-xs">
                  Generated {historyResult.generated} historical entries for the past {historyResult.yearsBack} year{historyResult.yearsBack !== 1 ? 's' : ''}.
                  {historyResult.capped && ' (capped at incorporation date)'}
                  {' '}All past-due entries marked as overdue.
                </p>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {/* Primary CTA changes by phase. While the intake-status
                  query is still loading, we render a placeholder
                  button instead of guessing — otherwise the wrong CTA
                  flashes for ~3-5s before snapping to the right one. */}
              {phase === 'loading' ? (
                <button
                  disabled
                  className="px-4 py-2 bg-gray-800 text-gray-500 rounded-lg text-sm font-medium flex items-center gap-2 cursor-wait"
                >
                  <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
                  Checking your business profile…
                </button>
              ) : phase === 'intake' && financialYear ? (
                <button
                  onClick={() => setViewState('intake')}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 6v6m0 0v6m0-6h6m-6 0H6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Tell us about your business
                </button>
              ) : (
                <button
                  onClick={handleGenerate}
                  disabled={false}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {stats ? 'Re-evaluate Compliances' : 'Generate Compliances'}
                </button>
              )}
              {/* Validate is a power-user action that's auto-run inside
                  Generate. Surface it only in maintenance mode so it
                  doesn't compete with the primary CTA on first run. */}
              {phase === 'maintenance' && hasExistingRequirements && (
                <button
                  onClick={handleValidate}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Validate with AI
                </button>
              )}
              {hasExistingRequirements && maxHistoricalYears >= 1 && (
                <div className="relative">
                  <button
                    onClick={() => setShowHistorySelector(!showHistorySelector)}
                    disabled={isGeneratingHistory}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    {isGeneratingHistory ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Previous Years
                      </>
                    )}
                  </button>
                  {showHistorySelector && (
                    <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 min-w-[200px]">
                      <div className="p-2 border-b border-gray-700">
                        <p className="text-gray-400 text-[10px] uppercase tracking-wider font-semibold">Generate for previous</p>
                        {incorporationDate && (
                          <p className="text-gray-500 text-[10px] mt-0.5">
                            Incorporated: {new Date(incorporationDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                      {[1, 2, 3].filter(y => y <= maxHistoricalYears).map(years => (
                        <button
                          key={years}
                          onClick={() => handleGenerateHistory(years)}
                          className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center justify-between"
                        >
                          <span>{years} Year{years > 1 ? 's' : ''}</span>
                          <span className="text-gray-500 text-xs">
                            ~{years === 1 ? '12' : years === 2 ? '24' : '36'} months
                          </span>
                        </button>
                      ))}
                      {maxHistoricalYears > 3 && (
                        <button
                          onClick={() => handleGenerateHistory(maxHistoricalYears)}
                          className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center justify-between border-t border-gray-700"
                        >
                          <span>Since Incorporation</span>
                          <span className="text-gray-500 text-xs">
                            {maxHistoricalYears} yr{maxHistoricalYears > 1 ? 's' : ''}
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {hasExistingRequirements && !incorporationDate && (
                <p className="text-yellow-400/60 text-[10px]">Set incorporation date to enable historical generation</p>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Generating state ────────────────────────────────────────────────

  if (viewState === 'generating') {
    return (
      <div className="border border-blue-500/20 rounded-xl p-6 sm:p-8 bg-blue-500/5">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="relative mb-4">
            <div className="w-14 h-14 border-4 border-blue-500/30 border-t-blue-400 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <h3 className="text-white font-semibold mb-1">Evaluating Compliance Rules</h3>
          <p className="text-gray-400 text-sm max-w-md">
            Running deterministic rules engine for <span className="text-white">{companyName}</span>, then validating with AI for specialized industry and state requirements.
          </p>
          <p className="text-gray-500 text-xs mt-3">Rules engine is instant. AI validation takes 10-20 seconds.</p>
        </div>
      </div>
    )
  }

  // ── Validating state ────────────────────────────────────────────────

  if (viewState === 'validating') {
    return (
      <div className="border border-purple-500/20 rounded-xl p-6 sm:p-8 bg-purple-500/5">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="relative mb-4">
            <div className="w-14 h-14 border-4 border-purple-500/30 border-t-purple-400 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <h3 className="text-white font-semibold mb-1">Validating Compliances</h3>
          <p className="text-gray-400 text-sm max-w-md">
            AI is reviewing each compliance requirement for <span className="text-white">{companyName}</span> to verify applicability based on thresholds, state, industry, and entity type.
          </p>
          <p className="text-gray-500 text-xs mt-3">This takes 15-30 seconds.</p>
        </div>
      </div>
    )
  }

  // ── Error state ─────────────────────────────────────────────────────

  if (viewState === 'error') {
    return (
      <div className="border border-red-500/20 rounded-xl p-4 sm:p-6 bg-red-500/5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-red-400 font-semibold text-sm">Generation Failed</h3>
            <p className="text-gray-400 text-xs mt-1">{error}</p>
            <button
              onClick={handleGenerate}
              className="mt-3 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Review state ────────────────────────────────────────────────────

  const categoryGroups = requirements.reduce((acc, req) => {
    if (!acc[req.category]) acc[req.category] = []
    acc[req.category].push(req)
    return acc
  }, {} as Record<string, AIRequirementForReview[]>)

  return (
    <div className="border border-purple-500/20 rounded-xl bg-purple-500/5 overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-purple-500/10">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-white font-semibold text-sm sm:text-base flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              AI-Discovered Compliance Review
            </h3>
            <p className="text-gray-400 text-xs mt-1">
              {stats && stats.rulesEngineCount > 0 && (
                <span className="text-emerald-400">{stats.rulesEngineCount} rules auto-applied. </span>
              )}
              {requirements.length} AI-discovered item{requirements.length !== 1 ? 's' : ''} need review before activating.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {stats && (
              <div className="flex items-center gap-3 text-xs text-gray-400 mr-2 hidden sm:flex">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  {stats.highConf} high confidence
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                  {stats.needsReview} needs review
                </span>
              </div>
            )}
            <button
              onClick={handleApproveAll}
              disabled={isApprovingAll || requirements.length === 0}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              {isApprovingAll ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Approving...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Approve All ({requirements.length})
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Requirements by category */}
      <div className="divide-y divide-gray-800/50 max-h-[70vh] overflow-y-auto">
        {Object.entries(categoryGroups).map(([category, items]) => (
          <div key={category}>
            {/* Category header */}
            <div className="px-4 py-2.5 bg-gray-900/50 flex items-center gap-2 sticky top-0 z-10">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
                <path d={CATEGORY_ICONS[category] || 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-gray-300 text-xs font-semibold uppercase tracking-wider">{category}</span>
              <span className="text-gray-500 text-xs">({items.length})</span>
            </div>

            {/* Items */}
            {items.map((req) => {
              const confLevel = getConfidenceLevel(req.confidence_score)
              const isExpanded = expandedId === req.id
              const isProcessing = approvingIds.has(req.id)

              return (
                <div key={req.id} className={`px-4 py-3 hover:bg-white/[0.02] transition-colors ${isProcessing ? 'opacity-50' : ''}`}>
                  <div className="flex items-start gap-3">
                    {/* Confidence badge */}
                    <div className={`mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold border flex-shrink-0 ${CONFIDENCE_COLORS[confLevel]}`}>
                      {formatConfidence(req.confidence_score)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-white text-sm font-medium leading-tight">{req.requirement}</p>
                          <p className="text-gray-500 text-xs mt-0.5">
                            {req.authority && <span className="text-gray-400">{req.authority}</span>}
                            {req.authority && req.compliance_type && <span className="mx-1.5">·</span>}
                            {req.compliance_type && <span className="capitalize">{req.compliance_type}</span>}
                            <span className="mx-1.5">·</span>
                            {req.due_date ? (
                              <span>Due: {req.due_date}</span>
                            ) : (
                              <span className="text-gray-600 italic">No due date</span>
                            )}
                          </p>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : req.id)}
                            className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors"
                            title="Details"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              {isExpanded ? (
                                <polyline points="18 15 12 9 6 15" />
                              ) : (
                                <polyline points="6 9 12 15 18 9" />
                              )}
                            </svg>
                          </button>
                          <button
                            onClick={() => handleApprove(req.id)}
                            disabled={isProcessing}
                            className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                            title="Approve"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleReject(req.id)}
                            disabled={isProcessing}
                            className="p-1.5 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                            title="Remove"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="mt-3 pl-0 space-y-2 text-xs">
                          {req.act && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 w-20 flex-shrink-0">Act:</span>
                              <span className="text-gray-300">{req.act}</span>
                            </div>
                          )}
                          {req.section && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 w-20 flex-shrink-0">Section:</span>
                              <span className="text-gray-300">{req.section}</span>
                            </div>
                          )}
                          {req.penalty && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 w-20 flex-shrink-0">Penalty:</span>
                              <span className="text-red-400/80">{req.penalty}</span>
                            </div>
                          )}
                          {req.applicability_reason && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 w-20 flex-shrink-0">Why:</span>
                              <span className="text-gray-300">{req.applicability_reason}</span>
                            </div>
                          )}
                          {req.due_date_formula && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 w-20 flex-shrink-0">Schedule:</span>
                              <span className="text-gray-400 font-mono text-[11px]">{req.due_date_formula}</span>
                            </div>
                          )}
                          {req.source_url && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 w-20 flex-shrink-0">Source:</span>
                              <a
                                href={req.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:underline truncate"
                              >
                                {req.source_url}
                              </a>
                            </div>
                          )}
                          {req.required_documents.length > 0 && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 w-20 flex-shrink-0">Docs:</span>
                              <span className="text-gray-300">{req.required_documents.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
