/**
 * Deadline Formula Engine
 *
 * Parses due-date formula strings from AI-generated compliance items
 * and computes actual calendar dates for a given company profile.
 *
 * Formula formats:
 *   "day:20,offset:+1month"           → 20th of next month
 *   "day:15,offset:+1month"           → 15th of next month (TDS)
 *   "months_after_fy_end:6,day:30"    → 30 September (AOC-4 / AGM)
 *   "months_after_fy_end:9,day:31"    → 31 December (GSTR-9, covers prior FY)
 *   "months_after_incorp:30days"      → INC-20A (30 days from incorp)
 *   "fixed:jul31"                     → 31 July (calendar-anchored fixed date)
 *   "fixed:jul31,covers:Q1"           → 31 July, period_label = "Q1 FY2026-27".
 *                                          Use when deadline ≠ coverage quarter,
 *                                          e.g. TDS Return Q1 / Advance Tax Q1.
 *   "fixed:nov12,covers:H1"           → 12 November, period_label = "H1 FY2026-27"
 *   "quarterly:jun30,sep30,dec31,mar31" → 4 deadlines per FY (e.g. board meetings).
 *                                          Period = deadline month.
 *   "quarterly_offset:day:13"         → 4 deadlines per FY, day 13 of the month
 *                                          immediately after each quarter ends
 *                                          (Apr/Jul/Oct/Jan). Period = covered
 *                                          quarter, e.g. "Q1 FY2026-27" (QRMP).
 *   "annual:sep30"                    → Annual filing on Sep 30
 *   "half_yearly:sep30,mar31"         → 2 deadlines per FY (period = deadline month)
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

    // ── Fixed date: "fixed:monDD" — optional ",covers:Qn|Hn" annotation ──
    // Plain `fixed:jul31` labels by deadline month (e.g. "Jul 2026"). Add
    // `,covers:Q1` and the row labels by COVERAGE quarter ("Q1 FY2026-27")
    // — used for compliances whose deadline ≠ work period (TDS Q1 returns,
    // advance-tax instalments, MSME-1 half-yearly).
    else if (normalized.startsWith('fixed:')) {
      const body = normalized.replace('fixed:', '').trim()
      const segments = body.split(',').map((s) => s.trim()).filter(Boolean)
      const monDdPart = segments[0] || ''
      const coversSeg = segments.find((s) => s.startsWith('covers:'))
      const coversTag = coversSeg ? coversSeg.replace('covers:', '').toUpperCase() : null
      const dates = parseMonthDay(monDdPart, lowerBound, monthsAhead)
      for (const d of dates) {
        if (d.date < lowerBound) continue
        if (coversTag && /^Q[1-4]$/.test(coversTag)) {
          const fyStart = quarterCoverageFYStart(d.date, coversTag as Quarter)
          deadlines.push({
            date: d.date,
            label: `${coversTag} ${formatFYLabel(fyStart)}`,
            period: `${fyStart}-${coversTag}`,
          })
        } else if (coversTag && /^H[12]$/.test(coversTag)) {
          const fyStart = halfCoverageFYStart(d.date, coversTag as Half)
          deadlines.push({
            date: d.date,
            label: `${coversTag} ${formatFYLabel(fyStart)}`,
            period: `${fyStart}-${coversTag}`,
          })
        } else {
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

    // ── Quarterly with FY-anchored coverage: "quarterly_offset:day:DD" ──
    // Generates 4 deadlines per FY, one per quarter. Each deadline is
    // the DD-th of the month immediately following the quarter end:
    //   Q1 (Apr-Jun) → Jul DD       Q2 (Jul-Sep) → Oct DD
    //   Q3 (Oct-Dec) → Jan DD       Q4 (Jan-Mar) → Apr DD
    // period_key encodes the COVERAGE quarter, not the deadline month —
    // used by QRMP IFF / GSTR-3B. Apr-deadline rows belong to Q4 of the
    // PRIOR FY, so the period_key + label correctly shift back a year.
    else if (normalized.startsWith('quarterly_offset:')) {
      const body = normalized.replace('quarterly_offset:', '').trim()
      const dayMatch = body.match(/day:(\d+)/)
      if (dayMatch) {
        const day = parseInt(dayMatch[1], 10)
        const yearsBack = Math.max(1, Math.ceil(monthsAhead / 12))
        // For each FY in the rolling window, emit 4 quarter deadlines
        for (let fyOffset = -yearsBack; fyOffset <= 1; fyOffset++) {
          const fyStartYear = profile.financialYearStart.getFullYear() + fyOffset
          const quarters: Array<{ q: Quarter; deadlineYear: number; deadlineMonth: number }> = [
            { q: 'Q1', deadlineYear: fyStartYear, deadlineMonth: 6 },     // Jul
            { q: 'Q2', deadlineYear: fyStartYear, deadlineMonth: 9 },     // Oct
            { q: 'Q3', deadlineYear: fyStartYear + 1, deadlineMonth: 0 }, // Jan
            { q: 'Q4', deadlineYear: fyStartYear + 1, deadlineMonth: 3 }, // Apr
          ]
          for (const { q, deadlineYear, deadlineMonth } of quarters) {
            const actualDay = Math.min(day, daysInMonth(deadlineYear, deadlineMonth))
            const deadline = new Date(deadlineYear, deadlineMonth, actualDay)
            if (deadline >= lowerBound) {
              deadlines.push({
                date: deadline,
                label: `${q} ${formatFYLabel(fyStartYear)}`,
                period: `${fyStartYear}-${q}`,
              })
            }
          }
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
  // Naive `setMonth(getMonth() + N)` rolls end-of-month dates into the
  // following month: setMonth on Mar 31 + 6 → Sep 31 → rolls to Oct 1.
  // For Indian FY anchored on Mar 31, formulas like
  // `months_after_fy_end:6` (tax audit, AGM, CSR) and `:8` (MGT-7) then
  // landed in Oct / Dec instead of Sep / Nov. Build the target month
  // explicitly and clamp the day to that month's length.
  const targetYear = date.getFullYear()
  const targetMonth = date.getMonth() + months
  const sourceDay = date.getDate()
  const d = new Date(targetYear, targetMonth, 1)
  d.setDate(Math.min(sourceDay, daysInMonth(d.getFullYear(), d.getMonth())))
  return d
}

function formatMonthLabel(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[date.getMonth()]} ${date.getFullYear()}`
}

// Indian FY label, e.g. 2026 → "FY2026-27"
type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4'
type Half = 'H1' | 'H2'

function formatFYLabel(fyStartYear: number): string {
  return `FY${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`
}

/**
 * Given a deadline date and the quarter it covers, return the FY start
 * year of that coverage quarter (Indian FY: April-March).
 *   Q1 (Apr-Jun): deadline is in same FY  → fyStart = deadline.year (if month >= Apr)
 *                                            or deadline.year - 1 (if Jan-Mar)
 *   Q2 (Jul-Sep): same logic
 *   Q3 (Oct-Dec): if deadline in Jan-Mar → fyStart = deadline.year - 1
 *                 if deadline in Oct-Dec → fyStart = deadline.year
 *   Q4 (Jan-Mar): if deadline in Apr-May (e.g. TDS Q4, May 31) → fyStart = deadline.year - 1
 *                 if deadline in Jan-Mar (e.g. advance tax Q4, Mar 15) → fyStart = deadline.year - 1
 *
 * Rule: take the start month of the quarter; if that month <= deadline
 * month, the quarter ends in the same calendar year as the deadline; if
 * not, the quarter wraps around the previous calendar year.
 */
function quarterCoverageFYStart(deadline: Date, quarter: Quarter): number {
  const deadlineMonth = deadline.getMonth() // 0-indexed
  const deadlineYear = deadline.getFullYear()
  // Quarter start months (Indian FY): Q1=Apr(3), Q2=Jul(6), Q3=Oct(9), Q4=Jan(0)
  const qStartMonth = { Q1: 3, Q2: 6, Q3: 9, Q4: 0 }[quarter]
  // Quarter end months: Q1=Jun(5), Q2=Sep(8), Q3=Dec(11), Q4=Mar(2)
  const qEndMonth = { Q1: 5, Q2: 8, Q3: 11, Q4: 2 }[quarter]

  // If deadline month is at-or-after the quarter's end (in calendar order),
  // the quarter ended in the SAME calendar year as the deadline.
  // Otherwise the quarter ended in the PREVIOUS calendar year.
  // Q4 wraps: end month (Mar=2) is "after" start (Jan=0), but the
  // quarter spans into the next FY. Use end month for the comparison.
  // Examples:
  //   Q1 deadline Jul 31 (month 6): 6 >= 5 → quarter ended this year, FY = year
  //   Q1 deadline Jun 15 (month 5): 5 >= 5 → quarter ended this year, FY = year
  //                                 Mid-quarter advance tax — same FY anchor.
  //   Q3 deadline Jan 31 (month 0): 0 >= 11? false → quarter ended LAST year (Dec)
  //                                 Quarter year = deadline.year - 1, FY = year - 1
  //   Q4 deadline May 31 (month 4): 4 >= 2 (Mar) → quarter ended this year (Mar)
  //                                 Q4 calendar year = deadline.year. Q4 belongs
  //                                 to the FY whose START year is year - 1.
  //   Q4 deadline Mar 15 (month 2): 2 >= 2 → quarter ended this year (Mar) — same.
  const quarterEndCalendarYear = deadlineMonth >= qEndMonth ? deadlineYear : deadlineYear - 1

  // Now: Q1/Q2/Q3 are within the same FY as their start month.
  //      Q4 (Jan-Mar) belongs to the FY that STARTED the prior April.
  if (quarter === 'Q4') {
    return quarterEndCalendarYear - 1
  }
  // For Q1/Q2/Q3, the FY start year is the same calendar year if quarter
  // start month >= April (3), else the prior calendar year.
  return qStartMonth >= 3 ? quarterEndCalendarYear : quarterEndCalendarYear - 1
}

/**
 * Half-year coverage. Indian FY:
 *   H1 = Apr-Sep   (deadlines typically Oct-Nov)
 *   H2 = Oct-Mar   (deadlines typically Apr-May)
 */
function halfCoverageFYStart(deadline: Date, half: Half): number {
  const deadlineMonth = deadline.getMonth()
  const deadlineYear = deadline.getFullYear()
  // H1 ends in Sep (month 8). H2 ends in Mar (month 2).
  const hEndMonth = half === 'H1' ? 8 : 2
  const halfEndCalendarYear = deadlineMonth >= hEndMonth ? deadlineYear : deadlineYear - 1
  // H2 (Oct-Mar) belongs to the FY that started the prior April.
  if (half === 'H2') return halfEndCalendarYear - 1
  // H1 (Apr-Sep) belongs to the FY whose start year IS halfEndCalendarYear.
  return halfEndCalendarYear
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
