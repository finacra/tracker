/**
 * Server-only discount-code registry.
 *
 * Each entry maps a case-insensitive code string to a price override
 * applied during Razorpay order creation. The first matching active
 * code overrides the computed tier+cycle price; the original price is
 * still recorded on the Payment row's `notes.original_amount_rupees`
 * for accounting, and the applied code is recorded on
 * `notes.discount_code` for audit.
 *
 * KEEP THIS FILE SERVER-ONLY. It is imported only from
 * `app/api/payments/create-order/route.ts`. Don't import it from
 * client components — the codes shouldn't ship to the browser.
 *
 * To add a code, just push to the array. To revoke a code, flip
 * `active: false` (preserves historical Payment.notes audit trail) or
 * delete the entry.
 */

export interface DiscountCode {
  /** Display code as users type it. Matched case-insensitively. */
  code: string
  /** False to disable a code without removing it. */
  active: boolean
  /**
   * Override the final order amount, in paise. 100 = ₹1.
   * Applies regardless of tier or billing cycle.
   */
  overrideAmountPaise: number
  /** Free-form note shown only in server logs / Payment.notes audit. */
  description: string
}

export const DISCOUNT_CODES: DiscountCode[] = [
  {
    code: 'super99',
    active: true,
    overrideAmountPaise: 100, // ₹1
    description:
      'super99 promo — flat ₹1 across all tiers and billing cycles.',
  },
]

/**
 * Resolve a user-entered code to its override, or null if not valid.
 * Case-insensitive, trims whitespace, ignores inactive entries.
 */
export function resolveDiscountCode(input: string | null | undefined): DiscountCode | null {
  if (!input) return null
  const normalized = input.trim().toLowerCase()
  if (!normalized) return null
  return (
    DISCOUNT_CODES.find(
      (entry) => entry.active && entry.code.toLowerCase() === normalized,
    ) ?? null
  )
}
