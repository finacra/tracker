/**
 * Dual-read utilities for the legacy → canonical user ID migration.
 *
 * During the transition period:
 *   - Business tables have both `user_id` (legacy auth id) and `app_user_id` (canonical).
 *   - Reads should prefer `app_user_id` when populated, falling back to `user_id`.
 *   - Writes should populate BOTH columns until legacy `user_id` is deprecated.
 */

/**
 * Given a row with optional `app_user_id` and legacy `user_id`, return the one to use.
 * Prefer canonical app_user_id when available.
 */
export function resolveUserId(row: { app_user_id?: string | null; user_id?: string | null }): string | null {
  return row.app_user_id ?? row.user_id ?? null
}

/**
 * Build a dual-write object that populates both legacy user_id and canonical app_user_id.
 * If appUserId is not provided, only user_id is set.
 */
export function dualWriteUserId(
  legacyUserId: string,
  appUserId?: string | null
): { user_id: string; app_user_id?: string } {
  const result: { user_id: string; app_user_id?: string } = { user_id: legacyUserId }
  if (appUserId) {
    result.app_user_id = appUserId
  }
  return result
}

/**
 * Build a query filter that matches on either app_user_id or legacy user_id.
 * This is for Supabase query builder usage during dual-read.
 *
 * Usage:
 *   const filter = dualReadFilter(userId)
 *   query.or(filter)
 */
export function dualReadFilter(userId: string): string {
  return `app_user_id.eq.${userId},user_id.eq.${userId}`
}
