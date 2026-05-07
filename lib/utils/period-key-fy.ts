/**
 * Decide whether a compliance row's `period_key` falls inside a selected FY.
 *
 * The tracker UI used to filter by `due_date` FY, which dropped:
 *   - The March-coverage row of every monthly compliance (TDS deadline
 *     April 7 for March work — due_date in next FY, period_key in current).
 *   - Every annual filing for the selected FY (GSTR-9 / AOC-4 / MGT-7 /
 *     CSR / DPT-3 etc. — their due_date sits in the *next* calendar year
 *     which lives in the *next* FY).
 *
 * Filtering by `period_key` puts each row in the FY it logically COVERS
 * rather than the FY its deadline lands in. Callers should fall back to
 * `due_date` filtering for one-time rows that have no period_key.
 *
 * Supported period_key shapes (from `lib/services/deadline-engine.ts`):
 *   "YYYY-MM"          monthly                  e.g. "2026-04", "2027-03"
 *   "YYYY-Q1".."Q4"    quarterly (FY-anchored)  e.g. "2026-Q1"
 *   "FYYYYY-YY"        annual                   e.g. "FY2026-27"
 *
 * FY string is the tracker's selectedTrackerFY: typically "2026-27" but
 * we accept "FY2026-27" too for safety. Indian FY runs April–March; YYYY
 * is the start year (FY 2026-27 = April 2026 → March 2027).
 *
 * Note: this helper currently assumes Indian FY conventions. Other
 * countries with different FY anchoring would need a country-aware
 * variant — out of scope here.
 */

function parseFY(fy: string): number | null {
  const m = fy.trim().match(/^(?:FY)?(\d{4})(?:[-/](\d{2,4}))?$/i)
  if (!m) return null
  const start = parseInt(m[1], 10)
  if (!Number.isFinite(start)) return null
  return start
}

export function periodKeyInFY(periodKey: string | null | undefined, fy: string): boolean {
  if (!periodKey || !fy) return false
  const fyStartYear = parseFY(fy)
  if (fyStartYear === null) return false

  // Order matters: monthly "YYYY-MM" and bare-form annual "YYYY-YY" are
  // syntactically indistinguishable. Test monthly first with a strict
  // month range (01..12). Anything that fails that and isn't quarterly
  // must carry the literal "FY" prefix to be treated as an annual key —
  // the deadline-engine always emits annual rows as "FYYYYY-YY".

  // Monthly: "YYYY-MM" (MM in 01..12) → in FY if Apr–Dec of start year
  // OR Jan–Mar of next year.
  const monthlyMatch = periodKey.match(/^(\d{4})-(\d{2})$/)
  if (monthlyMatch) {
    const y = parseInt(monthlyMatch[1], 10)
    const m = parseInt(monthlyMatch[2], 10)
    if (m >= 1 && m <= 12) {
      if (y === fyStartYear && m >= 4) return true
      if (y === fyStartYear + 1 && m <= 3) return true
      return false
    }
    // Falls through if MM is out-of-range (e.g. "27") — handled below
    // as a bare-form FY label.
  }

  // Quarterly: "2026-Q1" — Q1=Apr-Jun, Q4=Jan-Mar of next year. We
  // anchor by FY start year regardless of quarter.
  const quarterMatch = periodKey.match(/^(\d{4})-Q[1-4]$/i)
  if (quarterMatch) {
    return parseInt(quarterMatch[1], 10) === fyStartYear
  }

  // Annual: "FY2026-27" (preferred) or bare "2026-27" / "2026" (fallback
  // for older rows). The bare form is only reached after the monthly
  // branch fails its range check.
  const annualMatch = periodKey.match(/^(?:FY)?(\d{4})(?:[-/]\d{2,4})?$/i)
  if (annualMatch) {
    return parseInt(annualMatch[1], 10) === fyStartYear
  }

  return false
}
