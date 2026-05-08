'use client'

import React, { useEffect, useMemo, useState } from 'react'
import RequirementDesktopTableView from './RequirementDesktopTableView'
import { stripPeriodSuffix } from '@/lib/utils/strip-period-suffix'

/**
 * Three-level nested accordion:
 *
 *   Category (Income Tax, GST, RoC, …)
 *   └── Frequency (Monthly · Quarterly · Half-Yearly · Annual · One-Time · Event-Based)
 *       └── Form    (TDS Payment to Government, Advance Tax — Q1 Instalment (15%), …)
 *           └── existing RequirementDesktopTableView scoped to those rows
 *
 * Levels 2 & 3 are derived purely from existing fields:
 *   • Frequency  ← `compliance_type`
 *   • Form       ← `requirement` after stripping its trailing period suffix
 *                  (same regex used server-side in actions-intelligence.ts)
 *
 * No new columns, no new data. Mobile keeps RequirementMobileCardView
 * (TrackerTab handles the responsive switch).
 */

interface Group {
  category: string
  items: any[]
}

type RequirementDesktopProps = React.ComponentProps<typeof RequirementDesktopTableView>

interface Props extends Omit<RequirementDesktopProps, 'groupedByCategory' | 'filteredRequirements'> {
  groupedByCategory: Group[]
  filteredRequirements: any[]
  /**
   * Render-mode. `loading` produces the static shell — outer cards with their
   * names, numbered badges, and color theme, but no counts / frequencies /
   * bodies — so the layout is reserved before the rules-engine result is
   * fetched. Defaults to 'ready'.
   */
  status?: 'loading' | 'ready'
  /**
   * Static category list used for the shell. Sourced from
   * `COUNTRY_CONFIGS[countryCode].compliance.defaultCategories` (or the
   * server-overridable `useComplianceCategories` hook). Required when
   * `status` is `'loading'`.
   */
  shellCategories?: string[]
}

const FREQ_ORDER = [
  'monthly',
  'quarterly',
  'half-yearly',
  'annual',
  'one-time',
  'event-based',
]

const FREQ_LABEL: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'half-yearly': 'Half-Yearly',
  annual: 'Annual',
  'one-time': 'One-Time',
  'event-based': 'Event-Based',
  unspecified: 'Unspecified',
}

const FREQ_ACCENT: Record<string, string> = {
  monthly: 'text-blue-300 bg-blue-500/10 ring-blue-500/25',
  quarterly: 'text-purple-300 bg-purple-500/10 ring-purple-500/25',
  'half-yearly': 'text-teal-300 bg-teal-500/10 ring-teal-500/25',
  annual: 'text-green-300 bg-green-500/10 ring-green-500/25',
  'one-time': 'text-yellow-300 bg-yellow-500/10 ring-yellow-500/25',
  'event-based': 'text-fuchsia-300 bg-fuchsia-500/10 ring-fuchsia-500/25',
  unspecified: 'text-fg-secondary bg-bg-hover ring-line/15',
}

const CATEGORY_THEME: Record<string, { ring: string; bg: string; text: string; border: string }> = {
  'Income Tax':        { ring: 'ring-blue-500/30',    bg: 'bg-blue-500/15',    text: 'text-blue-300',    border: 'border-blue-500/30' },
  'GST':               { ring: 'ring-emerald-500/30', bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  'RoC':               { ring: 'ring-purple-500/30',  bg: 'bg-purple-500/15',  text: 'text-purple-300',  border: 'border-purple-500/30' },
  'Payroll':           { ring: 'ring-amber-500/30',   bg: 'bg-amber-500/15',   text: 'text-amber-300',   border: 'border-amber-500/30' },
  'Labour Law':        { ring: 'ring-rose-500/30',    bg: 'bg-rose-500/15',    text: 'text-rose-300',    border: 'border-rose-500/30' },
  'Industry-Specific': { ring: 'ring-orange-500/30',  bg: 'bg-orange-500/15',  text: 'text-orange-300',  border: 'border-orange-500/30' },
  'State Compliance':  { ring: 'ring-cyan-500/30',    bg: 'bg-cyan-500/15',    text: 'text-cyan-300',    border: 'border-cyan-500/30' },
  'SEBI':              { ring: 'ring-indigo-500/30',  bg: 'bg-indigo-500/15',  text: 'text-indigo-300',  border: 'border-indigo-500/30' },
  'Renewals':          { ring: 'ring-pink-500/30',    bg: 'bg-pink-500/15',    text: 'text-pink-300',    border: 'border-pink-500/30' },
  'Others':            { ring: 'ring-slate-500/30',   bg: 'bg-slate-500/15',   text: 'text-slate-300',   border: 'border-slate-500/30' },
}
const FALLBACK_THEME = { ring: 'ring-slate-500/30', bg: 'bg-slate-500/15', text: 'text-slate-300', border: 'border-slate-500/30' }
const themeFor = (cat: string) => CATEGORY_THEME[cat] ?? FALLBACK_THEME

function freqKey(item: any): string {
  const raw = String(item.compliance_type || '').toLowerCase().trim()
  return raw && FREQ_LABEL[raw] ? raw : 'unspecified'
}

function groupByFrequency(items: any[]): { freq: string; items: any[] }[] {
  const map = new Map<string, any[]>()
  for (const it of items) {
    const k = freqKey(it)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(it)
  }
  const order = [...FREQ_ORDER, 'unspecified']
  return order.filter((k) => map.has(k)).map((k) => ({ freq: k, items: map.get(k)! }))
}

function groupByForm(items: any[]): { form: string; items: any[] }[] {
  const map = new Map<string, any[]>()
  for (const it of items) {
    const base = stripPeriodSuffix(String(it.requirement || '')) || 'Unnamed'
    if (!map.has(base)) map.set(base, [])
    map.get(base)!.push(it)
  }
  // Stable alpha sort, with multi-instance forms first (more useful to expand)
  return [...map.entries()]
    .map(([form, forms]) => ({ form, items: forms }))
    .sort((a, b) => {
      if (a.items.length !== b.items.length) return b.items.length - a.items.length
      return a.form.localeCompare(b.form)
    })
}

function summariseFrequencies(items: any[]): string[] {
  const present = new Set(items.map((i) => freqKey(i)))
  return [...FREQ_ORDER, 'unspecified']
    .filter((f) => present.has(f))
    .map((f) => FREQ_LABEL[f])
}

export default function TrackerCategoryAccordionView(props: Props) {
  const { groupedByCategory, status = 'ready', shellCategories = [], ...rest } = props

  if (status === 'loading') {
    // Render the accordion *shell* — same outer dimensions and structure as
    // the populated accordion, but with a shimmer chip in place of the count
    // and disabled bodies. This reserves layout space so the populated
    // accordion drops into pre-allocated slots, no pop-in, no CLS.
    return <ShellView shellCategories={shellCategories} />
  }

  // Top-level category is single-open accordion: opening one category
  // auto-closes whichever category was previously open. Frequency and
  // form sub-buckets remain multi-open within the active category — they
  // describe parallel filings (monthly + quarterly + annual) the user
  // tends to scan together once they've drilled into a category.
  // Keys:
  //   category          → "<cat>"            (single, string | null)
  //   frequency bucket  → "<cat>::<freq>"    (multi, Set<string>)
  //   form bucket       → "<cat>::<freq>::<form>"  (multi, Set<string>)
  const [openCategory, setOpenCategory] = useState<string | null>(
    () => groupedByCategory[0]?.category ?? null
  )
  const [openFreqs, setOpenFreqs] = useState<Set<string>>(new Set())
  const [openForms, setOpenForms] = useState<Set<string>>(new Set())

  // When the data shape changes (filter applied), if the open category
  // no longer exists fall back to the first one so the user always has
  // something visible.
  useEffect(() => {
    setOpenCategory((prev) => {
      if (groupedByCategory.length === 0) return null
      const exists = prev && groupedByCategory.some((g) => g.category === prev)
      return exists ? prev : groupedByCategory[0].category
    })
    // Frequency / form keys auto-prune lazily: they just won't render if
    // their parent cat/freq isn't in the data — no need to clear them here,
    // and keeping them avoids re-collapsing on every re-render.
  }, [groupedByCategory])

  const toggleCategory = (cat: string) =>
    setOpenCategory((prev) => (prev === cat ? null : cat))

  const toggleFreq = (key: string) =>
    setOpenFreqs((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const toggleForm = (key: string) =>
    setOpenForms((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const expandAll = () => {
    // Single-open category — pick the first one (or keep current if
    // already open) and expand every freq bucket across all categories
    // so when the user switches categories the sub-buckets are already
    // open. Forms stay collapsed to avoid wall-of-rows.
    const freqs = new Set<string>()
    for (const g of groupedByCategory) {
      for (const fg of groupByFrequency(g.items)) {
        freqs.add(`${g.category}::${fg.freq}`)
      }
    }
    setOpenCategory((prev) => prev ?? groupedByCategory[0]?.category ?? null)
    setOpenFreqs(freqs)
  }
  const collapseAll = () => {
    setOpenCategory(null)
    setOpenFreqs(new Set())
    setOpenForms(new Set())
  }

  const totalCount = useMemo(
    () => groupedByCategory.reduce((acc, g) => acc + g.items.length, 0),
    [groupedByCategory],
  )

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-1">
        <div className="text-xs text-fg-muted">
          <span className="text-fg-primary font-mono tabular-nums">{totalCount}</span>{' '}
          compliance{totalCount === 1 ? '' : 's'} across{' '}
          <span className="text-fg-primary font-mono tabular-nums">{groupedByCategory.length}</span>{' '}
          categor{groupedByCategory.length === 1 ? 'y' : 'ies'}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={expandAll}
            className="px-3 py-1.5 text-xs rounded-token-md text-fg-muted hover:text-fg-primary hover:bg-bg-hover transition-colors duration-token ease-token"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="px-3 py-1.5 text-xs rounded-token-md text-fg-muted hover:text-fg-primary hover:bg-bg-hover transition-colors duration-token ease-token"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* Level 1 — Category */}
      <div className="space-y-3">
        {groupedByCategory.map((group, idx) => {
          const theme = themeFor(group.category)
          const catOpen = openCategory === group.category
          const freqs = summariseFrequencies(group.items)
          const freqGroups = catOpen ? groupByFrequency(group.items) : []
          return (
            <div
              key={group.category}
              className={`bg-bg-card border ${catOpen ? theme.border : 'border-white/10'} rounded-xl overflow-hidden transition-colors`}
            >
              {/* Category header */}
              <button
                type="button"
                onClick={() => toggleCategory(group.category)}
                className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 hover:bg-bg-hover transition-colors duration-token ease-token text-left"
                aria-expanded={catOpen}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg ${theme.bg} ${theme.text} flex items-center justify-center font-mono text-sm sm:text-base font-semibold ring-1 ${theme.ring}`}
                >
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
                  <span className="text-fg-primary font-medium text-base sm:text-lg truncate tracking-tight">
                    {group.category}
                  </span>
                  <span className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-full ${theme.bg} ${theme.text} font-medium`}>
                    {group.items.length}
                  </span>
                </div>
                {freqs.length > 0 && (
                  <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
                    {freqs.map((f, i) => (
                      <React.Fragment key={f}>
                        {i > 0 && <span className="text-fg-muted/60 text-[10px]">·</span>}
                        <span className="text-[11px] text-fg-muted font-mono">{f}</span>
                      </React.Fragment>
                    ))}
                  </div>
                )}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`flex-shrink-0 text-fg-muted transition-transform duration-200 ${catOpen ? 'rotate-90' : ''}`}
                  aria-hidden="true"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* Body — Level 2 (Frequency) sub-accordions */}
              {catOpen && (
                <div className="border-t border-line/10 p-3 sm:p-4 space-y-2.5">
                  {freqGroups.map((fg) => {
                    const freqKeyId = `${group.category}::${fg.freq}`
                    const freqOpen = openFreqs.has(freqKeyId)
                    const accent = FREQ_ACCENT[fg.freq] ?? FREQ_ACCENT.unspecified
                    const formGroups = freqOpen ? groupByForm(fg.items) : []
                    return (
                      <div
                        key={freqKeyId}
                        className="bg-bg-elevated border border-line/10 rounded-lg overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => toggleFreq(freqKeyId)}
                          className="w-full flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-bg-hover transition-colors duration-token ease-token text-left"
                          aria-expanded={freqOpen}
                        >
                          <span
                            className={`text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-md font-mono font-medium ring-1 ${accent}`}
                          >
                            {FREQ_LABEL[fg.freq]}
                          </span>
                          <span className="text-fg-muted text-xs">
                            <span className="text-fg-primary font-mono tabular-nums">{fg.items.length}</span>{' '}
                            compliance{fg.items.length === 1 ? '' : 's'}
                          </span>
                          <span className="flex-1" />
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className={`flex-shrink-0 text-fg-muted transition-transform duration-200 ${freqOpen ? 'rotate-90' : ''}`}
                            aria-hidden="true"
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>

                        {/* Body — Level 3 (Form) sub-accordions */}
                        {freqOpen && (
                          <div className="border-t border-line/10 p-2 sm:p-3 space-y-2">
                            {formGroups.map((form) => {
                              const formKeyId = `${freqKeyId}::${form.form}`
                              const formOpen = openForms.has(formKeyId)
                              return (
                                <div
                                  key={formKeyId}
                                  className="bg-bg-card border border-line/10 rounded-md overflow-hidden"
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleForm(formKeyId)}
                                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-bg-hover transition-colors duration-token ease-token text-left"
                                    aria-expanded={formOpen}
                                  >
                                    <span className="text-fg-primary text-sm font-medium truncate">
                                      {form.form}
                                    </span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-hover text-fg-muted font-mono">
                                      {form.items.length}
                                    </span>
                                    <span className="flex-1" />
                                    <svg
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      className={`flex-shrink-0 text-fg-muted transition-transform duration-200 ${formOpen ? 'rotate-90' : ''}`}
                                      aria-hidden="true"
                                    >
                                      <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                  </button>
                                  {formOpen && (
                                    <div className="border-t border-line/10">
                                      <div className="overflow-x-auto scrollbar-hide">
                                        <RequirementDesktopTableView
                                          {...rest}
                                          groupedByCategory={[{ category: group.category, items: form.items }]}
                                          filteredRequirements={form.items}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Pre-data shell. Renders one closed card per category from the static
 * country config — same outer geometry as the populated accordion (numbered
 * badge, name, count slot, chevron) but inert. The toolbar shows a "Loading
 * compliances…" notice instead of "X compliances across Y categories".
 *
 * Why a separate component: keeps the loading branch free of any
 * `useState`/`useEffect` hooks that depend on populated data, so the live
 * accordion's open-state isn't reset when the parent flips status from
 * 'loading' → 'ready' (the live component remounts cleanly with real data).
 */
function ShellView({ shellCategories }: { shellCategories: string[] }) {
  const cats = shellCategories && shellCategories.length > 0 ? shellCategories : Object.keys(CATEGORY_THEME)
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between px-1">
        <div className="text-xs sm:text-sm text-fg-muted">Loading compliances…</div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 text-xs rounded-token-md border border-line/10 text-fg-muted">
            Expand all
          </span>
          <span className="px-3 py-1.5 text-xs rounded-token-md border border-line/10 text-fg-muted">
            Collapse all
          </span>
        </div>
      </div>
      <div className="space-y-3">
        {cats.map((cat, idx) => {
          const theme = themeFor(cat)
          return (
            <div
              key={cat}
              className="bg-bg-card border border-white/10 rounded-xl overflow-hidden"
            >
              <div
                className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 text-left select-none"
                aria-busy="true"
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg ${theme.bg} ${theme.text} flex items-center justify-center font-mono text-sm sm:text-base font-semibold ring-1 ${theme.ring}`}
                >
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
                  <span className="text-fg-primary font-medium text-base sm:text-lg truncate tracking-tight">
                    {cat}
                  </span>
                  <span
                    className="inline-block w-8 h-4 rounded-full bg-white/5 animate-pulse"
                    aria-label="loading count"
                  />
                </div>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="flex-shrink-0 text-fg-secondary"
                  aria-hidden="true"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
