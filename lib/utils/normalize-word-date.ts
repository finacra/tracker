/**
 * Convert any common date representation found on Indian compliance
 * documents to a strict ISO date string (YYYY-MM-DD).
 *
 * Handles:
 *   - Already-ISO              "2023-03-25"          → "2023-03-25"
 *   - Indian numeric           "25/03/2023"          → "2023-03-25"
 *   - Indian numeric variants  "25-03-2023" / "25.03.2023"
 *   - Day-Mon-Year             "25-Mar-2023" / "25 March 2023"
 *   - Word format              "Twenty-Fifth day of March, Two Thousand Twenty-Three"
 *   - Month + year only        "March 2024"          → "2024-03-01"
 *   - Year only                "2024"                → "2024-01-01"
 *
 * Returns null when the input cannot be confidently parsed (caller should
 * treat that as "no date" rather than store junk). Year is sanity-checked
 * to fall in [1900, 2100].
 */

const MONTH_WORDS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
  // Ordinal forms commonly used for the day part
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
  eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30,
}

function wordsToNumber(input: string): number | null {
  // Normalize: lowercase, replace hyphens with space, drop noise words
  const tokens = input
    .toLowerCase()
    .replace(/-/g, ' ')
    .split(/[\s,]+/)
    .filter((t) => t && t !== 'and' && t !== 'of' && t !== 'the' && t !== 'day')

  if (tokens.length === 0) return null

  // Resolve each token to a number, trying the literal first
  // ("fifth" → 5 directly), then digit form ("5th" → 5), then a
  // suffix-stripped fallback ("twentieth" → 20 already handled by the
  // dictionary; this catches odd compounds the dictionary missed).
  function resolve(token: string): number | null {
    if (NUMBER_WORDS[token] !== undefined) return NUMBER_WORDS[token]
    const digitOrdinal = token.match(/^(\d+)(?:st|nd|rd|th)$/)
    if (digitOrdinal) return parseInt(digitOrdinal[1], 10)
    if (/^\d+$/.test(token)) return parseInt(token, 10)
    const stripped = token.replace(/(?:st|nd|rd|th)$/, '')
    if (stripped !== token && NUMBER_WORDS[stripped] !== undefined) {
      return NUMBER_WORDS[stripped]
    }
    return null
  }

  let total = 0
  let current = 0
  for (const raw of tokens) {
    const n = resolve(raw)
    if (n === null) return null

    if (n === 100) {
      current = (current || 1) * 100
    } else if (n === 1000) {
      total += (current || 1) * 1000
      current = 0
    } else {
      current += n
    }
  }
  return total + current
}

export function normalizeWordDate(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = String(input).trim()
  if (!trimmed) return null

  // Already ISO
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const [, y, m, d] = iso
    const yearNum = parseInt(y, 10)
    if (yearNum >= 1900 && yearNum <= 2100) return `${y}-${m}-${d}`
    return null
  }

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (Indian numeric convention)
  const numericMatch = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/)
  if (numericMatch) {
    const [, d, m, y] = numericMatch
    const yearNum = parseInt(y, 10)
    const monthNum = parseInt(m, 10)
    const dayNum = parseInt(d, 10)
    if (
      yearNum >= 1900 && yearNum <= 2100 &&
      monthNum >= 1 && monthNum <= 12 &&
      dayNum >= 1 && dayNum <= 31
    ) {
      return `${y}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
    }
  }

  // DD Mon YYYY (e.g., "25 March 2023", "25-Mar-2023", "25/Mar/2023")
  const monMatch = trimmed.match(/^(\d{1,2})[\s\-\/]+([A-Za-z]+)[\s\-\/,]+(\d{4})$/)
  if (monMatch) {
    const [, d, monStr, y] = monMatch
    const monthNum = MONTH_WORDS[monStr.toLowerCase()]
    const yearNum = parseInt(y, 10)
    if (monthNum && yearNum >= 1900 && yearNum <= 2100) {
      return `${y}-${String(monthNum).padStart(2, '0')}-${d.padStart(2, '0')}`
    }
  }

  // "Mon DD, YYYY" or "Mon DD YYYY" (e.g., "March 25, 2023")
  const monFirst = trimmed.match(/^([A-Za-z]+)[\s\-\/]+(\d{1,2})[\s\-\/,]+(\d{4})$/)
  if (monFirst) {
    const [, monStr, d, y] = monFirst
    const monthNum = MONTH_WORDS[monStr.toLowerCase()]
    const yearNum = parseInt(y, 10)
    if (monthNum && yearNum >= 1900 && yearNum <= 2100) {
      return `${y}-${String(monthNum).padStart(2, '0')}-${d.padStart(2, '0')}`
    }
  }

  // Word format: "Twenty-Fifth day of March, Two Thousand Twenty-Three"
  // Strategy: locate the month word, parse day-words on the left,
  // year-words on the right.
  const lowered = trimmed.toLowerCase()
  for (const [monthWord, monthNum] of Object.entries(MONTH_WORDS)) {
    // Skip 3-letter abbreviations to avoid false matches inside other
    // words like "marathon"; require word boundaries
    if (monthWord.length < 4) continue
    const re = new RegExp(`\\b${monthWord}\\b`, 'i')
    const idx = lowered.search(re)
    if (idx < 0) continue
    const left = trimmed.slice(0, idx)
    const right = trimmed.slice(idx + monthWord.length)
    const day = wordsToNumber(left.replace(/day\s+of/i, ''))
    const year = wordsToNumber(right)
    if (day && day >= 1 && day <= 31 && year && year >= 1900 && year <= 2100) {
      return `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
    // Stop after the first matched month word — multiple matches are
    // ambiguous and we'd rather return null than guess.
    break
  }

  // "Mon YYYY" (month + year only) → 1st of month
  const monYearMatch = trimmed.match(/^([A-Za-z]+)[\s\-\/,]+(\d{4})$/)
  if (monYearMatch) {
    const [, monStr, y] = monYearMatch
    const monthNum = MONTH_WORDS[monStr.toLowerCase()]
    const yearNum = parseInt(y, 10)
    if (monthNum && yearNum >= 1900 && yearNum <= 2100) {
      return `${y}-${String(monthNum).padStart(2, '0')}-01`
    }
  }

  // YYYY only → Jan 1
  const yearOnly = trimmed.match(/^(\d{4})$/)
  if (yearOnly) {
    const yearNum = parseInt(yearOnly[1], 10)
    if (yearNum >= 1900 && yearNum <= 2100) return `${yearOnly[1]}-01-01`
  }

  return null
}
