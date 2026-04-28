'use client'

import {
  forwardRef,
  useEffect,
  useState,
  type ReactNode,
  type RefObject,
  type ButtonHTMLAttributes,
} from 'react'

interface PopoverCoords {
  /** Distance from viewport top in px. */
  top: number
  /** Distance from viewport right in px. Use this OR `left`, not both. */
  right?: number
  /** Distance from viewport left in px. Use this OR `right`, not both. */
  left?: number
}

interface MenuProps {
  /** Whether the menu is open. Owned by the caller. */
  isOpen: boolean
  /** Called when the user clicks the backdrop or presses Escape. */
  onClose: () => void
  /** Pre-computed viewport coordinates for the popover. Use this when the
   *  caller has already measured the trigger via getBoundingClientRect. */
  coords?: PopoverCoords
  /** Alternative to `coords`: pass a ref to the trigger element and the
   *  menu will measure it on open. The popover anchors to the trigger's
   *  bottom-right by default, opening downward + leftward (matches the
   *  3-dot kebab convention). */
  anchorRef?: RefObject<HTMLElement>
  /** Override default anchor edge — useful when the trigger is on the left. */
  align?: 'right' | 'left'
  /** Width class applied to the menu surface. Defaults to w-44 (~176px). */
  widthClass?: string
  /** Optional extra classes on the menu surface. */
  className?: string
  children: ReactNode
}

/**
 * PR-6: position:fixed popover menu with backdrop. Battle-tested pattern
 * extracted from VaultTreeView.tsx and RequirementDesktopTableView.tsx so
 * future menus don't reinvent the click-outside / Escape / position-fixed
 * dance.
 *
 * Two positioning modes:
 *   1. Pass `coords` directly (legacy migration path — the existing usages
 *      already compute these via getBoundingClientRect).
 *   2. Pass `anchorRef` and let the menu measure on open (simpler new code).
 *
 * Position-fixed sidesteps overflow-hidden clipping on parent containers —
 * the bug that bit us in the form-bucket popover (PR #86). Z-index is set
 * above the floating ThemeToggle (z-60) so menus from sub-pages sit on top.
 *
 * Adoption: this PR ships the primitive only. VaultTreeView's
 * DocActionsMenu/FolderActionsMenu and the tracker's doc-checklist menu
 * stay raw until PRs 7/8 sweep them as part of broader re-skins — switching
 * them in a standalone PR carries the bug-class without delivering visual
 * coherence.
 */
export function Menu({
  isOpen,
  onClose,
  coords: coordsProp,
  anchorRef,
  align = 'right',
  widthClass = 'w-44',
  className = '',
  children,
}: MenuProps) {
  // Resolve coords: explicit prop wins, otherwise measure anchorRef on open.
  // Re-measuring on every render would jitter on parent re-renders, so we
  // capture once when the menu opens.
  const [measured, setMeasured] = useState<PopoverCoords | null>(null)
  useEffect(() => {
    if (!isOpen) {
      setMeasured(null)
      return
    }
    if (coordsProp) return
    if (!anchorRef?.current) return
    const r = anchorRef.current.getBoundingClientRect()
    if (align === 'right') {
      setMeasured({ top: r.bottom + 6, right: window.innerWidth - r.right })
    } else {
      setMeasured({ top: r.bottom + 6, left: r.left })
    }
  }, [isOpen, coordsProp, anchorRef, align])

  // Close on Escape — universal modal/menu shortcut.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const coords = coordsProp ?? measured
  if (!isOpen || !coords) return null

  const positionStyle: React.CSSProperties = {
    top: coords.top,
    ...(coords.right !== undefined ? { right: coords.right } : {}),
    ...(coords.left !== undefined ? { left: coords.left } : {}),
  }

  return (
    <>
      {/* Backdrop catches outside-clicks. Transparent so it doesn't dim
          the page — purely a click target. */}
      <div className="fixed inset-0 z-[80]" onClick={onClose} />
      <div
        role="menu"
        className={`fixed z-[81] ${widthClass} bg-bg-card border border-line/15 rounded-token-md shadow-popover py-1 text-xs ${className}`.trim()}
        style={positionStyle}
        // Stop clicks inside the menu from bubbling to the backdrop.
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  )
}

interface MenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  leadingIcon?: ReactNode
  /** Renders the item in danger color — for destructive actions. */
  danger?: boolean
}

export const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
  { leadingIcon, danger = false, className = '', children, type = 'button', ...rest },
  ref,
) {
  const colorClass = danger
    ? 'text-accent-danger hover:bg-accent-danger/10'
    : 'text-fg-secondary hover:text-fg-primary hover:bg-bg-hover'

  return (
    <button
      ref={ref}
      type={type}
      role="menuitem"
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors duration-token ease-token ${colorClass} ${className}`.trim()}
      {...rest}
    >
      {leadingIcon && (
        <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5">
          {leadingIcon}
        </span>
      )}
      <span className="flex-1">{children}</span>
    </button>
  )
})

export function MenuDivider() {
  return <div role="separator" className="h-px bg-line/10 my-1" />
}
