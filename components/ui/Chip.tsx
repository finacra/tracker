'use client'

import { forwardRef, type HTMLAttributes, type ReactNode, type MouseEvent } from 'react'

export type ChipVariant = 'neutral' | 'info' | 'warn' | 'success' | 'danger' | 'brand'
export type ChipSize = 'sm' | 'md'

interface ChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'onClick'> {
  variant?: ChipVariant
  size?: ChipSize
  leadingIcon?: ReactNode
  /** Show a status dot before the label. Cheap visual cue for "active" / "pending" / etc. */
  dot?: boolean
  /** Renders a small × button. The chip becomes interactive when set. */
  onRemove?: (e: MouseEvent<HTMLButtonElement>) => void
  /** Optional click handler — converts the chip to a button for filter-chip style use. */
  onClick?: (e: MouseEvent<HTMLSpanElement>) => void
  /** Renders the chip in its "selected" state — useful for filter chips. */
  active?: boolean
}

/**
 * PR-5: one chip, six variants, two sizes. Replaces the tracker/vault's
 * scattered chip styles (FY chips, status chips, "Linked" badges, doc-count
 * chips, etc.).
 *
 * Token-driven so it themes cleanly. Variants use semantic accents:
 *   neutral — bg-bg-elevated text-fg-secondary (default)
 *   info    — accent-info
 *   warn    — accent-warn
 *   success — accent-success
 *   danger  — accent-danger
 *   brand   — accent-brand
 *
 * Two interaction modes:
 *   1. Static badge (default) — span element.
 *   2. Filter chip (with onClick or active prop) — span gets role=button + cursor.
 *   3. Removable chip (with onRemove) — adds an × button.
 *
 * Adoption: this PR ships only the primitive. Tracker/vault chip sites are
 * swept in PR-7/PR-8 alongside the broader visual changes there — safer
 * than a hundred-call-site sweep in a standalone PR.
 */
const Chip = forwardRef<HTMLSpanElement, ChipProps>(function Chip(
  {
    variant = 'neutral',
    size = 'sm',
    leadingIcon,
    dot = false,
    onRemove,
    onClick,
    active = false,
    className = '',
    children,
    ...rest
  },
  ref,
) {
  const base =
    'inline-flex items-center gap-1.5 font-medium rounded-full whitespace-nowrap leading-none transition-colors duration-token ease-token border'

  // Variants pair a tinted background with full-saturation text + matched border.
  // Picked from the accent-*/15 alpha tier so chips read as "tagged" rather
  // than "filled" — same recipe Vercel/Linear use.
  const variants: Record<ChipVariant, string> = {
    neutral: 'bg-bg-elevated text-fg-secondary border-line/15',
    info:    'bg-accent-info/12 text-accent-info border-accent-info/25',
    warn:    'bg-accent-warn/12 text-accent-warn border-accent-warn/25',
    success: 'bg-accent-success/15 text-accent-success border-accent-success/30',
    danger:  'bg-accent-danger/12 text-accent-danger border-accent-danger/25',
    brand:   'bg-accent-brand/15 text-accent-brand border-accent-brand/25',
  }

  const sizes: Record<ChipSize, string> = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  }

  const interactive = !!onClick || active
  const interactiveClass = interactive
    ? 'cursor-pointer hover:opacity-80 active:opacity-70'
    : ''

  const activeRingClass = active ? 'ring-1 ring-current/30' : ''

  const dotColor: Record<ChipVariant, string> = {
    neutral: 'bg-fg-muted',
    info:    'bg-accent-info',
    warn:    'bg-accent-warn',
    success: 'bg-accent-success',
    danger:  'bg-accent-danger',
    brand:   'bg-accent-brand',
  }

  return (
    <span
      ref={ref}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      className={`${base} ${variants[variant]} ${sizes[size]} ${interactiveClass} ${activeRingClass} ${className}`.trim()}
      {...rest}
    >
      {dot && (
        <span aria-hidden="true" className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor[variant]}`} />
      )}
      {leadingIcon && (
        <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:w-3 [&>svg]:h-3">
          {leadingIcon}
        </span>
      )}
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(e)
          }}
          aria-label="Remove"
          className="ml-0.5 -mr-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-current/20 transition-colors duration-token ease-token"
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  )
})

export default Chip
