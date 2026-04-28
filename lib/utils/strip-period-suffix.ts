/**
 * Iteratively strip the trailing "— Mon Year" / "— Q3 Sep 2025" / "— H1 For Sep 2025"
 * period suffix from a requirement name. Mirrors the regex used by:
 *   - app/data-room/actions-intelligence.ts (server-side bulk insert)
 *   - scripts/fix-historical-names.js     (one-shot cleanup)
 *   - supabase/migrations-manual/2026-04-28-pollution-watchdog.sql (PL/pgSQL)
 *
 * Examples:
 *   "TDS Payment to Government — Monthly — For Mar 2026"   → "TDS Payment to Government"
 *   "Advance Tax — Q1 Instalment (15%) — Jun 2025"          → "Advance Tax — Q1 Instalment (15%)"
 *   "DPT-3 — Jun 2025 — Jun 2024"                           → "DPT-3"
 */
const SUFFIX_RE =
  /\s*[—–-]\s*(?:Monthly|Quarterly|Annual|Half-Yearly|Half-yearly|For\s+|Q[1-4]\s+|H[12]\s+)*(?:For\s+)?(?:Q[1-4]\s+)?(?:H[12]\s+)?[A-Za-z]{3,9}\s+\d{4}\s*$/i

export function stripPeriodSuffix(name: string): string {
  if (!name) return ''
  let prev = name
  let next = name.replace(SUFFIX_RE, '').trim()
  let i = 0
  while (next !== prev && i++ < 8) {
    prev = next
    next = next.replace(SUFFIX_RE, '').trim()
  }
  return next || name
}
