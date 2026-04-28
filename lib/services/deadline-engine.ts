/**
 * Deadline Formula Engine
 *
 * Parses due-date formula strings from AI-generated compliance items
 * and computes actual calendar dates for a given company profile.
 *
 * Formula formats:
 *   "day:20,offset:+1month"           → 20th of next month
 *   "day:15,offset:+1month"           → 15th of next month (TDS)
 *   "months_after_fy_end:6"           → 30 September (AOC-4)
 *   "months_after_fy_end:9"           → 31 December (MGT-7 for listed)
 *   "months_after_incorp:30days"      → INC-20A (30 days from incorp)
 *   "quarterly:jul15,oct15,jan15,mar15" → Advance tax
 *   "annual:sep30"                    → Annual filing on Sep 30
 *   "annual:oct31"                    → Annual filing on Oct 31
 *   "half_yearly:sep30,mar31"         → Half-yearly
 *   "event:30days_after_event"        → Event-based (e.g., auditor appointment)
 */

export interface CompanyDateProfile {
  incorporationDate: Date
  financialYearStart: Date // Usually April 1
  financialYearEnd: Date   // Usually March 31
}

export interface ComputedDeadline {
  date: Date
  label: string // e.g., "Apr 2026", "Q1 FY2026-27", "FY2025-26"
  period?: string // e.g., "2026-04" for monthly, "Q1-2026" for quarterly
}

/**
 * Build a default Indian FY profile (April–March) for the current/next FY.
 */
export function buildIndianFYProfile(incorporationDate: Date, referenceDate?: Date): CompanyDateProfile {
  const ref = referenceDate || new Date()
  const year = ref.getFullYear()
  const month = ref.getMonth() // 0-indexed

  // Indian FY: April to March
  // If we're in Jan-Mar, current FY started previous year April
  const fyStartYear = month < 3 ? year - 1 : year

  return {
    incorporationDate,
    financialYearStart: new Date(fyStartYear, 3, 1), // April 1
    financialYearEnd: new Date(fyStartYear + 1, 2, 31), // March 31
  }
}

/**
 * Parse a due-date formula and generate deadline instances for the next N months.
 * @param startFrom - Optional earlier date to include deadlines from (e.g., FY start).
 *                     Deadlines between startFrom and ref are included.
 */
export function computeDeadlines(
  formula: string,
  profile: CompanyDateProfile,
  monthsAhead: number = 12,
  referenceDate?: Date,
  startFrom?: Date
): ComputedDeadline[] {
  const ref = referenceDate || new Date()
  const lowerBound = startFrom || ref
  const deadlines: ComputedDeadline[] = []

  if (!formula || formula.trim() === '') return deadlines

  const normalized = formula.trim().toLowerCase()

  try {
    // ── Monthly: "day:DD,offset:+1month" ──
    // The due date is in the NEXT month, but the period label should reflect
    // the COVERED month (e.g., TDS deducted in April → due May 7 → label "Apr 2026")
    if (normalized.includes('day:') && normalized.includes('offset:+1month')) {
      const dayMatch = normalized.match(/day:(\d+)/)
      if (dayMatch) {
        const day = parseInt(dayMatch[1], 10)
        // Start generating from lowerBound month to cover full FY
        const startMonth = lowerBound < ref ? lowerBound : ref
        for (let i = 0; i < monthsAhead; i++) {
          const d = new Date(startMonth.getFullYear(), startMonth.getMonth() + 1 + i, 1)
          const actualDay = Math.min(day, daysInMonth(d.getFullYear(), d.getMonth()))
          const deadline = new Date(d.getFullYear(), d.getMonth(), actualDay)
          if (deadline >= lowerBound) {
            // The covered period is the PREVIOUS month (the month work was done in)
            const coveredMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1)
            deadlines.push({
              date: deadline,
              label: `For ${formatMonthLabel(coveredMonth)}`,
              period: `${coveredMonth.getFullYear()}-${String(coveredMonth.getMonth() + 1).padStart(2, '0')}`,
            })
          }
        }
      }
    }

    // ── Monthly without offset: "day:DD" only ──
    else if (normalized.startsWith('day:') && !normalized.includes('offset')) {
      const dayMatch = normalized.match(/day:(\d+)/)
      if (dayMatch) {
        const day = parseInt(dayMatch[1], 10)
        const startMonth = lowerBound < ref ? lowerBound : ref
        for (let i = 0; i < monthsAhead; i++) {
          const d = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1)
          const actualDay = Math.min(day, daysInMonth(d.getFullYear(), d.getMonth()))
          const deadline = new Date(d.getFullYear(), d.getMonth(), actualDay)
          if (deadline >= lowerBound) {
            deadlines.push({
              date: deadline,
              label: formatMonthLabel(deadline),
              period: `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, '0')}`,
            })
          }
        }
      }
    }

    // ── Months after FY end: "months_after_fy_end:N" or "months_after_fy_end:N,day:DD" ──
    else if (normalized.startsWith('months_after_fy_end:')) {
      const afterPrefix = normalized.replace('months_after_fy_end:', '')
      const parts = afterPrefix.split(',').map(s => s.trim())
      const months = parseInt(parts[0], 10)
      const dayOverride = parts.find(p => p.startsWith('day:'))
      const specificDay = dayOverride ? parseInt(dayOverride.replace('day:', ''), 10) : null

      if (!isNaN(months)) {
        // Walk a FY window sized to monthsAhead. Previously this branch
        // hardcoded fyOffset=0..1 — only current + next FY — so the
        // historical generator's effectiveStart=today-2y was unreachable
        // for annual rules. Now we walk from -ceil(monthsAhead/12)
        // through +1, mirroring the monthly branch's lookback semantics.
        const yearsBack = Math.max(1, Math.ceil(monthsAhead / 12))
        for (let fyOffset = -yearsBack; fyOffset <= 1; fyOffset++) {
          const fyEnd = new Date(
            profile.financialYearEnd.getFullYear() + fyOffset,
            profile.financialYearEnd.getMonth(),
            profile.financialYearEnd.getDate()
          )
          const deadline = addMonths(fyEnd, months)
          // Use specific day if provided, otherwise last day of month
          const finalDate = specificDay
            ? new Date(deadline.getFullYear(), deadline.getMonth(), Math.min(specificDay, daysInMonth(deadline.getFullYear(), deadline.getMonth())))
            : new Date(deadline.getFullYear(), deadline.getMonth() + 1, 0)
          if (finalDate >= lowerBound) {
            const fyLabel = `FY${fyEnd.getFullYear() - 1}-${String(fyEnd.getFullYear()).slice(2)}`
            deadlines.push({
              date: finalDate,
              label: fyLabel,
              period: fyLabel,
            })
          }
        }
      }
    }

    // ── Fixed date: "fixed:monDD" e.g. "fixed:jun15", "fixed:sep30" ──
    else if (normalized.startsWith('fixed:')) {
      const part = normalized.replace('fixed:', '').trim()
      const dates = parseMonthDay(part, lowerBound, monthsAhead)
      for (const d of dates) {
        if (d.date >= lowerBound) {
          deadlines.push(d)
        }
      }
    }

    // ── Days after incorporation: "months_after_incorp:Ndays", "days_after_incorp:N", etc. ──
    else if (normalized.includes('after_incorp')) {
      // Support formats: "days_after_incorp:180", "months_after_incorp:30days", "30 days after incorp"
      const colonDaysMatch = normalized.match(/days_after_incorp:(\d+)/)
      const daysMatch = normalized.match(/(\d+)\s*days?/)
      const monthsMatch = normalized.match(/(\d+)\s*months?/)
      if (colonDaysMatch) {
        const days = parseInt(colonDaysMatch[1], 10)
        const deadline = new Date(profile.incorporationDate)
        deadline.setDate(deadline.getDate() + days)
        if (deadline >= lowerBound) {
          deadlines.push({
            date: deadline,
            label: 'Post-incorporation',
            period: 'one-time',
          })
        }
      } else if (daysMatch) {
        const days = parseInt(daysMatch[1], 10)
        const deadline = new Date(profile.incorporationDate)
        deadline.setDate(deadline.getDate() + days)
        if (deadline >= lowerBound) {
          deadlines.push({
            date: deadline,
            label: 'Post-incorporation',
            period: 'one-time',
          })
        }
      } else if (monthsMatch) {
        const months = parseInt(monthsMatch[1], 10)
        const deadline = addMonths(profile.incorporationDate, months)
        if (deadline >= lowerBound) {
          deadlines.push({
            date: deadline,
            label: 'Post-incorporation',
            period: 'one-time',
          })
        }
      }
    }

    // ── Quarterly: "quarterly:mon_dd,mon_dd,mon_dd,mon_dd" ──
    else if (normalized.startsWith('quarterly:')) {
      const parts = normalized.replace('quarterly:', '').split(',').map(s => s.trim())
      for (const part of parts) {
        const dates = parseMonthDay(part, lowerBound, monthsAhead)
        for (const d of dates) {
          if (d.date >= lowerBound) {
            deadlines.push(d)
          }
        }
      }
    }

    // ── Half-yearly: "half_yearly:mon_dd,mon_dd" ──
    else if (normalized.startsWith('half_yearly:') || normalized.startsWith('half-yearly:')) {
      const prefix = normalized.startsWith('half_yearly:') ? 'half_yearly:' : 'half-yearly:'
      const parts = normalized.replace(prefix, '').split(',').map(s => s.trim())
      for (const part of parts) {
        const dates = parseMonthDay(part, lowerBound, monthsAhead)
        for (const d of dates) {
          if (d.date >= lowerBound) {
            deadlines.push(d)
          }
        }
      }
    }

    // ── Annual: "annual:mon_dd" ──
    else if (normalized.startsWith('annual:')) {
      const part = normalized.replace('annual:', '').trim()
      const dates = parseMonthDay(part, lowerBound, monthsAhead)
      for (const d of dates) {
        if (d.date >= lowerBound) {
          deadlines.push(d)
        }
      }
    }

    // ── Event-based: just return empty (CA sets manually) ──
    else if (normalized.startsWith('event:') || normalized.startsWith('event-based:')) {
      // No automatic deadlines for event-based compliance
    }
  } catch (err) {
    console.error(`[DeadlineEngine] Failed to parse formula "${formula}":`, err)
  }

  // Sort chronologically and deduplicate
  deadlines.sort((a, b) => a.date.getTime() - b.date.getTime())
  return deadlines
}

/**
 * Compute the next single upcoming deadline from a formula.
 * Used for setting the initial due_date on a requirement.
 */
export function computeNextDeadline(
  formula: string,
  profile: CompanyDateProfile,
  referenceDate?: Date,
  startFrom?: Date
): Date | null {
  const deadlines = computeDeadlines(formula, profile, 14, referenceDate, startFrom)
  return deadlines.length > 0 ? deadlines[0].date : null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function formatMonthLabel(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[date.getMonth()]} ${date.getFullYear()}`
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

/**
 * Parse "monDD" (e.g., "jul15", "sep30") into dates for current and next year.
 */
function parseMonthDay(s: string, ref: Date, monthsAhead: number): ComputedDeadline[] {
  const match = s.match(/([a-z]+)(\d+)/)
  if (!match) return []

  const monthNum = MONTH_MAP[match[1]]
  if (monthNum === undefined) return []

  const day = parseInt(match[2], 10)
  const results: ComputedDeadline[] = []
  const cutoff = addMonths(ref, monthsAhead)

  for (let yearOffset = 0; yearOffset <= 2; yearOffset++) {
    const year = ref.getFullYear() + yearOffset
    const actualDay = Math.min(day, daysInMonth(year, monthNum))
    const date = new Date(year, monthNum, actualDay)
    if (date > ref && date <= cutoff) {
      results.push({
        date,
        label: formatMonthLabel(date),
        period: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      })
    }
  }

  return results
}

/**
 * Map frequency string to compliance_type for the DB.
 */
export function frequencyToComplianceType(
  frequency: string
): string {
  const map: Record<string, string> = {
    'monthly': 'monthly',
    'quarterly': 'quarterly',
    'half-yearly': 'half-yearly',
    'annual': 'annual',
    'one-time': 'one-time',
    'event-based': 'event-based',
  }
  return map[frequency] || 'annual'
}
