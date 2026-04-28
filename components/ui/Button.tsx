'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  iconLeft?: ReactNode
  iconRight?: ReactNode
  fullWidth?: boolean
}

/**
 * PR-4: the one Button. Three primary variants + a danger for destructive
 * actions. Token-driven so it themes cleanly. Designed to replace the four
 * different button styles currently scattered across the data-room.
 *
 * Usage:
 *   <Button>Save</Button>                          // primary md
 *   <Button variant="secondary">Cancel</Button>
 *   <Button variant="ghost" size="sm">More</Button>
 *   <Button variant="danger" loading>Deleting…</Button>
 *   <Button iconLeft={<PlusIcon />}>Add</Button>
 *
 * Adoption strategy: this PR ships the primitive + converts the magical
 * onboarding intake (the one "greenfield" surface that already used the
 * matching tokens). PRs 7/8 sweep tracker and vault as part of their
 * broader re-skins — converting hundreds of button sites in one PR is
 * exactly the blast-radius we said we'd avoid.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    iconLeft,
    iconRight,
    fullWidth = false,
    disabled,
    className = '',
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium rounded-token-md transition-colors duration-token ease-token outline-none focus-visible:ring-2 focus-visible:ring-accent-brand/40 disabled:opacity-50 disabled:cursor-not-allowed'

  const variants: Record<ButtonVariant, string> = {
    // PR-13: primary is now the brand indigo. Was bg-fg-primary (plain
    // black/white) — that read flat and generic. Indigo gives primary
    // CTAs the modern-SaaS punch the marketing landing established.
    primary:
      'bg-accent-brand text-white hover:opacity-90 active:opacity-80 shadow-sm shadow-accent-brand/20',
    secondary:
      'bg-bg-card text-fg-primary border border-line/15 hover:bg-bg-hover hover:border-line/30',
    ghost:
      'bg-transparent text-fg-secondary hover:text-fg-primary hover:bg-bg-hover',
    danger:
      'bg-accent-danger text-white hover:opacity-90 active:opacity-80',
  }

  const sizes: Record<ButtonSize, string> = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-5 py-2.5',
  }

  const widthClass = fullWidth ? 'w-full' : ''

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${widthClass} ${className}`.trim()}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
        />
      ) : iconLeft ? (
        <span aria-hidden="true" className="inline-flex shrink-0">{iconLeft}</span>
      ) : null}
      {children}
      {!loading && iconRight ? (
        <span aria-hidden="true" className="inline-flex shrink-0">{iconRight}</span>
      ) : null}
    </button>
  )
})

export default Button
