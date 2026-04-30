'use client'

import { useState, useEffect, useRef } from 'react'
import { verifyCIN, lookupCompanyByPerplexity, lookupGST, type GSTLookupResult } from '@/lib/api/cin-din'
import { parseCIN, type ParsedCIN } from '@/utils/cin-parser'
import Button from '@/components/ui/Button'

// Accept either a 21-char CIN (regular companies) OR a 7-char LLPIN
// (limited-liability partnerships). LLPINs come in two MCA formats:
//   - "AAA-1234" (3 letters + dash + 4 digits)
//   - "AAA1234"  (some MCA records strip the dash)
// Both are normalised to upper-case before matching.
const CIN_PATTERN = /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/
const LLPIN_PATTERN = /^[A-Z]{3}-?\d{4}$/
const PAN_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/

export interface MagicalIntakePayload {
  cin: string
  pan: string
  parsed: ParsedCIN
  companyData: any | null
  directorData: any[]
  gstResult: GSTLookupResult | null
}

export interface UnregisteredIntakePayload {
  entityType: 'sole-proprietorship' | 'partnership'
  firmName: string
  /** State the firm operates in. Optional; helps Perplexity disambiguate. */
  state: string
  /** Raw Perplexity response (companyData shape — same fields as CIN flow). */
  companyData: any | null
}

interface MagicalIntakeProps {
  onComplete: (payload: MagicalIntakePayload) => void
  /**
   * Called for sole-prop / partnership users after the name-search flow.
   * Parent prefills the form with whatever Perplexity returned and sets
   * companyType to the picked entityType.
   */
  onUnregisteredComplete: (payload: UnregisteredIntakePayload) => void
  /**
   * Called only when the user wants the truly-empty manual form (no AI
   * help). Both the top-right "Skip" pill and the "Skip — fill blank"
   * link inside the name-search flow route here.
   */
  onSkip: () => void
}

type Phase =
  // CIN / LLPIN registered-entity flow:
  | 'cin'              // collecting CIN
  | 'cin-verifying'    // calling MCA
  | 'cin-verified'     // CIN locked, waiting for PAN
  | 'revealing'        // PAN auto-fired, prefill in flight
  | 'done'             // about to call onComplete
  // Sole-prop / partnership name-search flow:
  | 'name-entry'       // collecting firm name + entity type
  | 'name-searching'   // calling Perplexity
  | 'name-verified'    // result shown, awaiting confirm
  | 'name-done'        // about to call onUnregisteredComplete

/**
 * The "magic moment" entrypoint to onboarding.
 *
 * Flow:
 *  1. User types CIN. On 21 valid chars + format match, the Verify button
 *     fades in. Click it → MCA lookup (with Perplexity fallback) → on
 *     success the input locks with a green check and the resolved company
 *     name renders below.
 *  2. PAN input fades in. As soon as the 10th valid char is typed (no
 *     button needed), GST + company-PAN cross-lookups fire in the
 *     background. When all data is ready, onComplete is called with the
 *     raw payload so the parent's existing handlers can apply it (no
 *     duplicated prefill logic — reuses applyParsedCINData + GST setter).
 *
 * Visual: single-column ~520px wide, mono inputs (Geist Mono) for IDs,
 * staged fade-ins, ✨ accent on the success row.
 */
export default function MagicalIntake({ onComplete, onUnregisteredComplete, onSkip }: MagicalIntakeProps) {
  const [phase, setPhase] = useState<Phase>('cin')
  const [cinValue, setCinValue] = useState('')
  const [panValue, setPanValue] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Name-search (sole-prop / partnership) state.
  const [entityType, setEntityType] = useState<'sole-proprietorship' | 'partnership' | null>(null)
  const [firmName, setFirmName] = useState('')
  const [firmState, setFirmState] = useState('')
  const [foundFirm, setFoundFirm] = useState<{ name: string; data: any } | null>(null)

  // Cache the CIN response so the PAN step doesn't refetch.
  const cinPayloadRef = useRef<{
    parsed: ParsedCIN
    companyData: any | null
    directorData: any[]
  } | null>(null)
  // Guards against the auto-fire firing twice if the user types past 10 chars.
  const panAutoFiredRef = useRef(false)

  const cinFormatted = cinValue.toUpperCase().trim()
  const panFormatted = panValue.toUpperCase().trim()
  const cinValid = CIN_PATTERN.test(cinFormatted) || LLPIN_PATTERN.test(cinFormatted)
  const panValid = PAN_PATTERN.test(panFormatted)
  const nameSearchValid = !!entityType && firmName.trim().length >= 3

  // Auto-fire PAN cross-lookup once the user types a valid 10-char PAN.
  useEffect(() => {
    if (phase !== 'cin-verified') return
    if (!panValid) return
    if (panAutoFiredRef.current) return
    panAutoFiredRef.current = true
    runPrefill()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, panValid])

  const handleVerifyCIN = async () => {
    if (!cinValid) {
      setErrorMsg('Check the CIN / LLPIN format and try again.')
      return
    }
    setErrorMsg(null)
    setPhase('cin-verifying')

    const parsed = parseCIN(cinFormatted)
    let companyData: any | null = null
    let directorData: any[] = []

    // KYC API first.
    const apiResult = await verifyCIN(cinFormatted)
    if (apiResult.success) {
      companyData = apiResult.data?.data?.data?.companyData || null
      directorData = apiResult.data?.data?.data?.directorData || []
    }

    // Perplexity fallback if KYC came up empty.
    const apiHadData = !!(companyData && companyData.company)
    if (!apiHadData) {
      console.log('[MagicalIntake] KYC empty — falling back to Perplexity AI')
      const aiResult = await lookupCompanyByPerplexity({ cin: cinFormatted })
      if (aiResult.success) {
        companyData = aiResult.data?.data?.data?.companyData || null
        directorData = aiResult.data?.data?.data?.directorData || []
      }
    }

    // Last-resort: parsed CIN structure only — still let the user proceed
    // because the form has manual fields. Mirrors the existing handler.
    // Note: LLPINs don't go through parseCIN successfully (different
    // structure), so we accept them when companyData has anything useful
    // OR when the structure parses. If neither, fail gracefully.
    const isLlpin = LLPIN_PATTERN.test(cinFormatted)
    if (!companyData?.company && !parsed.isValid && !isLlpin) {
      setErrorMsg('We could not find this ID. Double-check it or skip and fill manually.')
      setPhase('cin')
      return
    }

    cinPayloadRef.current = { parsed, companyData, directorData }
    setCompanyName(companyData?.company || `${isLlpin ? 'LLPIN' : 'CIN'} ${cinFormatted} (manual review needed)`)
    setPhase('cin-verified')
  }

  const runPrefill = async () => {
    if (!cinPayloadRef.current) return
    setPhase('revealing')
    const { parsed, companyData, directorData } = cinPayloadRef.current

    // Fire GST lookup in parallel — it's the only remaining I/O. Failure is
    // non-blocking: the form opens with what we have.
    const companyNameForGST = companyData?.company || ''
    const gstPromise = companyNameForGST
      ? lookupGST({
          companyName: companyNameForGST,
          cin: cinFormatted,
          pan: panFormatted,
        }).catch((err) => {
          console.warn('[MagicalIntake] GST lookup failed:', err)
          return null as GSTLookupResult | null
        })
      : Promise.resolve(null as GSTLookupResult | null)

    const gstResult = await gstPromise

    setPhase('done')
    // Tiny tick so the ✨ "Pre-filled" line is visible before the unmount.
    setTimeout(() => {
      onComplete({
        cin: cinFormatted,
        pan: panFormatted,
        parsed,
        companyData,
        directorData,
        gstResult,
      })
    }, 350)
  }

  // ── Name-search flow (sole-prop / partnership) ────────────────────────
  // For unregistered firms there's no MCA record. We hit Perplexity with
  // the firm name (and optional state hint) and pull whatever public
  // signal exists — MSME/Udyam record, GST registration, partnership-
  // deed mentions, etc. Best-effort prefill; the form is still editable.
  const handleNameSearch = async () => {
    if (!nameSearchValid) {
      setErrorMsg('Pick an entity type and enter the firm name.')
      return
    }
    setErrorMsg(null)
    setPhase('name-searching')

    // Pass state as a disambiguation hint by appending it to the name.
    // The /api/lookup-company endpoint accepts companyName only, so we
    // squeeze the hint into that field rather than changing the API
    // contract (which would ripple into the legacy CIN flow).
    const hint = firmState.trim() ? `${firmName.trim()}, ${firmState.trim()}` : firmName.trim()
    const aiResult = await lookupCompanyByPerplexity({ companyName: hint })

    let companyData: any | null = null
    if (aiResult.success) {
      companyData = aiResult.data?.data?.data?.companyData || null
    }

    if (!companyData?.company) {
      // No reliable match — let the user proceed manually with what they typed.
      setFoundFirm({ name: firmName.trim(), data: null })
    } else {
      setFoundFirm({ name: companyData.company, data: companyData })
    }
    setPhase('name-verified')
  }

  const handleNameConfirm = () => {
    if (!entityType) return
    setPhase('name-done')
    setTimeout(() => {
      onUnregisteredComplete({
        entityType,
        firmName: foundFirm?.name || firmName.trim(),
        state: firmState.trim(),
        companyData: foundFirm?.data || null,
      })
    }, 250)
  }

  // ── Render — name-search variant ──────────────────────────────────────
  if (phase === 'name-entry' || phase === 'name-searching' || phase === 'name-verified' || phase === 'name-done') {
    return (
      <div className="min-h-screen bg-bg-base relative flex items-start justify-center pt-20 sm:pt-32 px-4">
        <div className="w-full max-w-[520px]">
          {/* Skip pill top-right (truly empty form) */}
          <div className="flex justify-end mb-6">
            <Button variant="ghost" size="sm" onClick={onSkip}>
              Skip — fill blank
            </Button>
          </div>

          <div className="mb-8 text-center">
            <h1 className="font-sans text-3xl sm:text-4xl font-medium text-fg-primary tracking-tight mb-2">
              Find your firm
            </h1>
            <p className="text-sm text-fg-muted">
              We'll search public records and pre-fill what we can.
            </p>
          </div>

          {/* Entity type segmented control */}
          <div className="space-y-2 mb-5">
            <span className="text-xs font-medium text-fg-secondary uppercase tracking-wider">
              Entity type
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(['sole-proprietorship', 'partnership'] as const).map((t) => {
                const active = entityType === t
                const label = t === 'sole-proprietorship' ? 'Sole Proprietorship' : 'Partnership'
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEntityType(t)}
                    disabled={phase !== 'name-entry'}
                    className={`px-3 py-2.5 rounded-token-md border text-sm transition-colors duration-token ease-token ${
                      active
                        ? 'bg-bg-card text-fg-primary border-accent-brand/60 ring-2 ring-accent-brand/25'
                        : 'bg-bg-card text-fg-secondary border-line/15 hover:border-line/30 hover:text-fg-primary'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Firm name */}
          <div className="space-y-2 mb-5">
            <label htmlFor="magical-firm-name" className="text-xs font-medium text-fg-secondary uppercase tracking-wider">
              Firm name
            </label>
            <input
              id="magical-firm-name"
              type="text"
              value={firmName}
              onChange={(e) => { setFirmName(e.target.value); setErrorMsg(null) }}
              placeholder={entityType === 'partnership' ? 'e.g. Sharma & Associates' : 'e.g. Sharma Trading Co.'}
              autoFocus
              disabled={phase !== 'name-entry'}
              autoComplete="off"
              className="w-full text-base text-fg-primary bg-bg-card border border-line/10 rounded-token-md px-4 py-3 outline-none focus:border-accent-brand focus:ring-2 focus:ring-accent-brand/30 transition-colors duration-token ease-token disabled:opacity-70"
            />
          </div>

          {/* State (optional) */}
          <div className="space-y-2 mb-5">
            <label htmlFor="magical-firm-state" className="text-xs font-medium text-fg-secondary uppercase tracking-wider">
              State <span className="lowercase tracking-normal text-fg-muted/80">(optional — improves accuracy)</span>
            </label>
            <input
              id="magical-firm-state"
              type="text"
              value={firmState}
              onChange={(e) => setFirmState(e.target.value)}
              placeholder="e.g. Telangana"
              disabled={phase !== 'name-entry'}
              autoComplete="off"
              className="w-full text-base text-fg-primary bg-bg-card border border-line/10 rounded-token-md px-4 py-3 outline-none focus:border-accent-brand focus:ring-2 focus:ring-accent-brand/30 transition-colors duration-token ease-token disabled:opacity-70"
            />
          </div>

          {/* Verify / search button */}
          {(phase === 'name-entry' || phase === 'name-searching') && nameSearchValid && (
            <div className="pt-2 animate-fadeIn">
              <Button
                size="lg"
                onClick={handleNameSearch}
                loading={phase === 'name-searching'}
                iconRight={
                  phase === 'name-entry' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" /><path d="M13 5l7 7-7 7" />
                    </svg>
                  ) : null
                }
              >
                {phase === 'name-searching' ? 'Searching public records…' : 'Find my firm'}
              </Button>
            </div>
          )}

          {errorMsg && (
            <p className="text-sm text-accent-danger pt-1">{errorMsg}</p>
          )}

          {/* Result + confirm */}
          {(phase === 'name-verified' || phase === 'name-done') && (
            <div className="mt-2 p-4 rounded-token-md bg-bg-card border border-line/15 animate-fadeIn">
              {foundFirm?.data ? (
                <>
                  <p className="text-xs text-fg-muted uppercase tracking-wider mb-1">Found</p>
                  <p className="text-base font-medium text-fg-primary mb-3">{foundFirm.name}</p>
                  {foundFirm.data.registeredaddress && (
                    <p className="text-xs text-fg-muted leading-relaxed">{foundFirm.data.registeredaddress}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs text-fg-muted uppercase tracking-wider mb-1">No public record</p>
                  <p className="text-sm text-fg-secondary">
                    We couldn't find a confident match for <span className="font-medium text-fg-primary">{firmName.trim()}</span>. You can still continue and fill the form manually.
                  </p>
                </>
              )}
              <div className="flex items-center gap-2 mt-4">
                <Button size="sm" onClick={handleNameConfirm} loading={phase === 'name-done'}>
                  {foundFirm?.data ? 'Yes, that\'s us' : 'Continue manually'}
                </Button>
                {foundFirm?.data && phase === 'name-verified' && (
                  <Button variant="ghost" size="sm" onClick={() => { setFoundFirm(null); setPhase('name-entry') }}>
                    Not us — try again
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Back to CIN flow */}
          <div className="mt-12 text-center text-xs text-fg-muted">
            Have a CIN or LLPIN?{' '}
            <button
              type="button"
              onClick={() => { setPhase('cin'); setErrorMsg(null) }}
              className="underline hover:text-fg-secondary transition-colors duration-token ease-token"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-base relative flex items-start justify-center pt-20 sm:pt-32 px-4">
      <div className="w-full max-w-[520px]">
        {/* Skip link top-right */}
        <div className="flex justify-end mb-6">
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Skip — fill manually
          </Button>
        </div>

        {/* Hero */}
        <div className="mb-8 text-center">
          <h1 className="font-sans text-3xl sm:text-4xl font-medium text-fg-primary tracking-tight mb-2">
            Let's set up your company
          </h1>
          <p className="text-sm text-fg-muted">
            Two IDs and we'll handle the rest.
          </p>
        </div>

        {/* Step 1 — CIN */}
        <div className="space-y-2">
          <label
            htmlFor="magical-cin"
            className="text-xs font-medium text-fg-secondary uppercase tracking-wider"
          >
            Company CIN or LLPIN
          </label>
          <div className="relative">
            <input
              id="magical-cin"
              type="text"
              value={cinFormatted}
              onChange={(e) => {
                setCinValue(e.target.value)
                setErrorMsg(null)
              }}
              placeholder="L17110MH1973PLC019786 or AAA-1234"
              maxLength={21}
              autoFocus
              disabled={phase !== 'cin' && phase !== 'cin-verifying'}
              spellCheck={false}
              autoComplete="off"
              className="w-full font-mono tabular-nums tracking-wide text-base text-fg-primary bg-bg-card border border-line/10 rounded-token-md px-4 py-3 outline-none focus:border-accent-brand focus:ring-2 focus:ring-accent-brand/30 transition-colors duration-token ease-token disabled:opacity-70"
            />
            {phase === 'cin-verified' && (
              <span
                aria-label="CIN verified"
                className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent-success/15 text-accent-success"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
            )}
          </div>

          {/* Verify button — visible from valid CIN through verify-in-flight */}
          {(phase === 'cin' || phase === 'cin-verifying') && cinValid && (
            <div className="pt-2 animate-fadeIn">
              <Button
                size="lg"
                onClick={handleVerifyCIN}
                loading={phase === 'cin-verifying'}
                iconRight={
                  phase === 'cin' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" />
                      <path d="M13 5l7 7-7 7" />
                    </svg>
                  ) : null
                }
              >
                {phase === 'cin-verifying' ? 'Verifying with MCA…' : 'Verify'}
              </Button>
            </div>
          )}

          {phase !== 'cin' && phase !== 'cin-verifying' && companyName && (
            <p className="text-sm text-fg-secondary pt-1 animate-fadeIn">
              <span className="text-accent-success">✓</span>{' '}
              <span className="font-medium text-fg-primary">{companyName}</span>
            </p>
          )}

          {errorMsg && (
            <p className="text-sm text-accent-danger pt-1">{errorMsg}</p>
          )}
        </div>

        {/* Step 2 — PAN (fades in after CIN verifies) */}
        {(phase === 'cin-verified' || phase === 'revealing' || phase === 'done') && (
          <div className="space-y-2 mt-8 animate-fadeIn">
            <label
              htmlFor="magical-pan"
              className="text-xs font-medium text-fg-secondary uppercase tracking-wider"
            >
              Company PAN
            </label>
            <div className="relative">
              <input
                id="magical-pan"
                type="text"
                value={panFormatted}
                onChange={(e) => setPanValue(e.target.value)}
                placeholder="AAACT2727Q"
                maxLength={10}
                autoFocus
                disabled={phase === 'revealing' || phase === 'done'}
                spellCheck={false}
                autoComplete="off"
                className="w-full font-mono tabular-nums tracking-wide text-base text-fg-primary bg-bg-card border border-line/10 rounded-token-md px-4 py-3 outline-none focus:border-accent-brand focus:ring-2 focus:ring-accent-brand/30 transition-colors duration-token ease-token disabled:opacity-70"
              />
              {phase === 'done' && (
                <span
                  aria-label="PAN accepted"
                  className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent-success/15 text-accent-success"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
              )}
            </div>

            {phase === 'cin-verified' && !panValid && (
              <p className="text-xs text-fg-muted pt-1">
                10 characters — we'll verify automatically.
              </p>
            )}

            {phase === 'revealing' && (
              <p className="text-sm text-fg-secondary inline-flex items-center gap-2 pt-2">
                <span className="inline-block w-3 h-3 border-2 border-fg-secondary border-t-transparent rounded-full animate-spin" />
                Pulling registrations, addresses, directors…
              </p>
            )}

            {phase === 'done' && (
              <p className="text-sm text-fg-secondary pt-1 animate-fadeIn inline-flex items-center gap-1.5">
                <span className="text-base leading-none">✨</span>
                Pre-filling your company profile…
              </p>
            )}
          </div>
        )}

        {/* Help — sole-prop / partnership go to the name-search flow */}
        <div className="mt-12 text-center text-xs text-fg-muted">
          Don't have a CIN or LLPIN (sole-proprietorship / partnership)?{' '}
          <button
            type="button"
            onClick={() => { setPhase('name-entry'); setErrorMsg(null) }}
            className="underline hover:text-fg-secondary transition-colors duration-token ease-token"
          >
            Find by name
          </button>
        </div>
      </div>
    </div>
  )
}
