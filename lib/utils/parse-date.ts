/**
 * Parse date strings the agent / form input layer hands us in a mix
 * of formats: "DD/MM/YYYY" (Indian default), "YYYY-MM-DD", ISO 8601,
 * or free-form garbage like "Not available". Returns a valid Date or
 * null — never an Invalid Date object (which Prisma rejects with
 * "Provided Date object is invalid").
 *
 * Use this anywhere a user- or agent-sourced date string enters a
 * Prisma write. Server-controlled dates (Date.now() etc.) don't need
 * it.
 */
export function parseFlexibleDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value

  const trimmed = String(value).trim()
  if (!trimmed) return null
  if (/^(n\/?a|not available|none|unknown|na|-+)$/i.test(trimmed)) return null

  // DD/MM/YYYY or DD-MM-YYYY (Indian default — try first)
  const dmy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) {
    const day = parseInt(dmy[1], 10)
    const month = parseInt(dmy[2], 10)
    const year = parseInt(dmy[3], 10)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month - 1, day))
      if (!isNaN(d.getTime())) return d
    }
  }

  // YYYY/MM/DD with slashes
  const ymd = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (ymd) {
    const d = new Date(Date.UTC(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10)))
    if (!isNaN(d.getTime())) return d
  }

  // Native parse for ISO and friends
  const native = new Date(trimmed)
  return isNaN(native.getTime()) ? null : native
}
