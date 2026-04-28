'use client'

import React, { useEffect, useMemo, useState } from 'react'
import RequirementDesktopTableView from './RequirementDesktopTableView'
import type { IRegulatoryService } from '../../services/RegulatoryService'

/**
 * Category-accordion wrapper around the existing desktop table.
 *
 * Each top-level category becomes a collapsible card with:
 *   • Numbered, color-coded badge
 *   • Category name + count
 *   • Frequency-family chips (Monthly · Quarterly · Annual …)
 *   • Chevron + click-to-expand
 *
 * When expanded, the body renders RequirementDesktopTableView scoped to
 * that category's items only — reuses 100% of existing row/column logic.
 * No new columns, no new fields — pure visual reorganisation of what
 * was previously one long flat-grouped table.
 *
 * Mobile keeps the existing RequirementMobileCardView (TrackerTab handles
 * the responsive switch).
 */

interface Group {
  category: string
  items: any[]
}

type RequirementDesktopProps = React.ComponentProps<typeof RequirementDesktopTableView>

interface Props extends Omit<RequirementDesktopProps, 'groupedByCategory' | 'filteredRequirements'> {
  groupedByCategory: Group[]
  filteredRequirements: any[]
}

/**
 * Color theme per category. Picked for contrast against the dark
 * tracker backdrop and to visually disambiguate at a glance.
 * Falls back to slate for any category we haven't pre-themed.
 */
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

/**
 * Frequency families summary chips. Derived purely from each item's
 * existing `compliance_type` — no new data.
 */
function summariseFrequencies(items: any[]): string[] {
  const order = ['monthly', 'quarterly', 'half-yearly', 'annual', 'one-time', 'event-based']
  const present = new Set(
    items.map((i) => (i.compliance_type || '').toLowerCase()).filter(Boolean),
  )
  const ordered = order.filter((f) => present.has(f))
  // Capitalise display
  const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())
  return ordered.map(cap)
}

export default function TrackerCategoryAccordionView(props: Props) {
  const { groupedByCategory, ...rest } = props

  // Track which categories are open. Default: only the FIRST category
  // (most relevant) is open on first render, so the user sees something
  // immediately without an overwhelming wall of expanded sections.
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => {
    const first = groupedByCategory[0]?.category
    return new Set(first ? [first] : [])
  })

  // If groupedByCategory shape changes (e.g. filter applied), keep any
  // previously-open categories that still exist; ensure at least the
  // first one is open so the surface isn't empty.
  useEffect(() => {
    setOpenCategories((prev) => {
      const stillExists = new Set(groupedByCategory.map((g) => g.category))
      const next = new Set([...prev].filter((c) => stillExists.has(c)))
      if (next.size === 0 && groupedByCategory.length > 0) {
        next.add(groupedByCategory[0].category)
      }
      return next
    })
  }, [groupedByCategory])

  const expandAll = () => setOpenCategories(new Set(groupedByCategory.map((g) => g.category)))
  const collapseAll = () => setOpenCategories(new Set())
  const toggle = (cat: string) =>
    setOpenCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })

  const totalCount = useMemo(
    () => groupedByCategory.reduce((acc, g) => acc + g.items.length, 0),
    [groupedByCategory],
  )

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Toolbar — Expand / Collapse all */}
      <div className="flex items-center justify-between px-1">
        <div className="text-xs sm:text-sm text-gray-400">
          <span className="text-white font-medium">{totalCount}</span> compliance
          {totalCount === 1 ? '' : 's'} across{' '}
          <span className="text-white font-medium">{groupedByCategory.length}</span>{' '}
          categor{groupedByCategory.length === 1 ? 'y' : 'ies'}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-300 hover:text-white hover:border-white/30 hover:bg-white/5 transition-colors"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-300 hover:text-white hover:border-white/30 hover:bg-white/5 transition-colors"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* Category accordions */}
      <div className="space-y-3">
        {groupedByCategory.map((group, idx) => {
          const theme = themeFor(group.category)
          const isOpen = openCategories.has(group.category)
          const freqs = summariseFrequencies(group.items)
          return (
            <div
              key={group.category}
              className={`bg-black/40 border ${isOpen ? theme.border : 'border-white/10'} rounded-xl overflow-hidden transition-colors`}
            >
              {/* Header — clickable, color-themed */}
              <button
                type="button"
                onClick={() => toggle(group.category)}
                className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 hover:bg-white/[0.03] transition-colors text-left"
                aria-expanded={isOpen}
              >
                {/* Numbered badge */}
                <div
                  className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg ${theme.bg} ${theme.text} flex items-center justify-center font-mono text-sm sm:text-base font-semibold ring-1 ${theme.ring}`}
                >
                  {idx + 1}
                </div>

                {/* Title + count */}
                <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
                  <span className="text-white font-semibold text-base sm:text-lg truncate">
                    {group.category}
                  </span>
                  <span className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-full ${theme.bg} ${theme.text} font-medium`}>
                    {group.items.length}
                  </span>
                </div>

                {/* Frequency chips — hidden on small screens */}
                {freqs.length > 0 && (
                  <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
                    {freqs.map((f, i) => (
                      <React.Fragment key={f}>
                        {i > 0 && <span className="text-gray-600 text-[10px]">·</span>}
                        <span className="text-[11px] text-gray-400 font-mono">{f}</span>
                      </React.Fragment>
                    ))}
                  </div>
                )}

                {/* Chevron */}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`flex-shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                  aria-hidden="true"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* Body — render the existing desktop table scoped to this category */}
              {isOpen && (
                <div className="border-t border-white/5">
                  <div className="overflow-x-auto scrollbar-hide">
                    <RequirementDesktopTableView
                      {...rest}
                      groupedByCategory={[group]}
                      filteredRequirements={group.items}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
