/**
 * Income Tax Act 2025 — effective 1 April 2026.
 *
 * All TDS provisions from IT Act 1961 (Sections 192–206CCA) have been
 * consolidated into three sections:
 *   - Section 392 (Salary)
 *   - Section 393 (all other TDS — residents & non-residents)
 *   - Section 394 (TCS)
 *
 * Rates, thresholds, deposit due dates, and penalty amounts are
 * UNCHANGED. Only section numbers, form numbers, and challan codes
 * have changed.
 *
 * Use this file as the single source of truth for old→new mappings so
 * rule definitions, CIA prompts, and UI labels stay consistent.
 */

export const IT_ACT_2025_EFFECTIVE_FROM = '2026-04-01'

/**
 * True if the given date falls under IT Act 2025. Otherwise IT Act 1961
 * still applies (historical filings).
 */
export function isUnderItAct2025(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date
  return d >= new Date(IT_ACT_2025_EFFECTIVE_FROM)
}

/**
 * Old (IT Act 1961) → New (IT Act 2025) form number mapping.
 * Use `formLabel(oldName)` to render "Form 140 (formerly 24Q)" style.
 */
export const FORM_MAPPING: Record<string, string> = {
  '24Q': '140',
  '26Q': '140',
  '27Q': '144',
  'Form 16': 'Form 168',
  'Form 16A': 'Form 168A',
  // Unchanged in new Act but listed for completeness:
  '15G': '15G',
  '15H': '15H',
  '15CA': '15CA',
  '15CB': '15CB',
  'Form 13': 'Form 13',
}

export function formLabel(oldFormName: string): string {
  const normalized = oldFormName.replace(/^Form\s+/i, '')
  const newName = FORM_MAPPING[normalized] || FORM_MAPPING[oldFormName]
  if (!newName || newName === oldFormName || newName === normalized) {
    return oldFormName
  }
  return `${newName} (formerly ${oldFormName})`
}

/**
 * Old section → new section mapping for the most commonly cited TDS
 * provisions. `sectionLabel('194C')` returns "Sec 393(1) (formerly 194C)".
 *
 * Deleted sections (206AB, 206CCA) map to null so callers can drop the
 * rule entirely rather than rewriting it.
 */
export const SECTION_MAPPING: Record<string, string | null> = {
  '192':    'Sec 392',
  '192A':   'Sec 392(7)',
  '193':    'Sec 393(1)[Sl.5(i)]',
  '194':    'Sec 393(1)[Sl.7]',
  '194A':   'Sec 393(1)[Sl.5(ii)/(iii)]',
  '194B':   'Sec 393(3)[Sl.1]',
  '194BA':  'Sec 393(3)[Sl.2]',
  '194BB':  'Sec 393(3)[Sl.3]',
  '194C':   'Sec 393(1)[Sl.6(i)/(ii)]',
  '194D':   'Sec 393(1)[Sl.1(i)]',
  '194DA':  'Sec 393(1)[Sl.8(i)]',
  '194E':   'Sec 393(2)[Sl.1]',
  '194EE':  'Sec 393(3)[Sl.6]',
  '194G':   'Sec 393(3)[Sl.4]',
  '194H':   'Sec 393(1)[Sl.1(ii)]',
  '194I':   'Sec 393(1)[Sl.2]',
  '194IA':  'Sec 393(1)[Sl.3(i)]',
  '194IB':  'Sec 393(1)[Sl.2(i)]',
  '194IC':  'Sec 393(1)[Sl.3(ii)]',
  '194J':   'Sec 393(1)[Sl.6(iii)]',
  '194K':   'Sec 393(1)[Sl.4(i)]',
  '194LA':  'Sec 393(1)[Sl.3(iii)]',
  '194LB':  'Sec 393(2)[Sl.2]',
  '194LC':  'Sec 393(2)[Sl.3/4]',
  '194LBA': 'Sec 393(1)[Sl.4(ii)]',
  '194LBB': 'Sec 393(1)[Sl.4(iii)]',
  '194LBC': 'Sec 393(1)[Sl.4(iv)]',
  '194M':   'Sec 393(1)[Sl.6(ii)]',
  '194N':   'Sec 393(3)[Sl.5]',
  '194O':   'Sec 393(1)[Sl.8(v)]',
  '194P':   'Sec 393(1)[Sl.8(iii)]',
  '194Q':   'Sec 393(1)[Sl.8(ii)]',
  '194R':   'Sec 393(1)[Sl.8(iv)]',
  '194S':   'Sec 393(1)[Sl.8(vi)]',
  '194T':   'Sec 393(3)[Sl.7]',
  '195':    'Sec 393(2)[Sl.17]',
  '196A':   'Sec 393(2)[Sl.10]',
  '196B':   'Sec 393(2)[Sl.11/12]',
  '196C':   'Sec 393(2)[Sl.13/14]',
  '196D':   'Sec 393(2)[Sl.15]',
  '197':    'Sec 395',
  '197A':   'Sec 393(6)',
  '201(1A)': 'Sec 398(1)',
  '206AA':  'Sec 397',
  '206AB':  null,             // DELETED by Finance Act 2025
  '206C':   'Sec 394',
  '206CCA': null,             // DELETED by Finance Act 2025
  '234E':   'Sec 427',
  '271C':   'Sec 443',
  '271H':   'Sec 448',
  '272A':   'Sec 449',
  '276B':   'Sec 461',
  '40(a)(ia)': 'Sec 35(b)',
  '194F':   null,             // DELETED w.e.f. 2020
}

/**
 * Condensed summary suitable for injection into an LLM system prompt so
 * it stops returning pre-2026 answers. Keep this tight — token budget.
 */
export const IT_ACT_2025_PROMPT_CONTEXT = `
# Indian Income Tax — IT Act 2025 (effective 1 April 2026)

The Income Tax Act 1961 is superseded by the Income Tax Act 2025 for all
deductions and filings on or after 1 April 2026. Historical filings up to
31 March 2026 still follow IT Act 1961.

KEY STRUCTURAL CHANGES:
- All TDS sections (192–206CCA of 1961) are consolidated into:
  * Section 392 — Salary
  * Section 393 — All other TDS (sub-sections 1/2/3 for
    residents / non-residents / winnings & cash & partners)
  * Section 394 — TCS (replaces Section 206C)
- Section 206AB (higher TDS for ITR non-filers) is DELETED
- Section 206CCA (higher TCS for ITR non-filers) is DELETED
- Section 194F (MF repurchase) remains deleted

FORM RENUMBERING:
- Form 24Q (salary return) → Form 140
- Form 26Q (non-salary resident return) → Form 140 (merged)
- Form 27Q (non-resident return) → Form 144
- Form 16 (salary certificate) → Form 168
- Form 16A (non-salary certificate) → Form 168A
- Lower-deduction certificate Form 13 now covers ALL TDS sections (Sec 395)
- Challan codes: numeric 1001–1092 replace section-based codes on ITNS 281

UNCHANGED:
- Tax rates and threshold limits
- Deposit due dates (7th of next month; 30 April for March)
- Quarterly return filing dates (15 Jul / 15 Oct / 15 Jan / 15 May)
- Interest on late deduction (1% p.m.) and late deposit (1.5% p.m.)
- Late-filing fee (₹200/day, now Sec 427 instead of 234E)
- Forms 15G / 15H / 15CA / 15CB

When answering questions about TDS, TCS, advance tax, ITR, or any
compliance action that occurs on or after 1 April 2026, cite the
IT Act 2025 sections and form numbers. For historical records
(payments made on or before 31 March 2026), cite IT Act 1961.
`.trim()
