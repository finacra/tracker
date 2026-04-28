/**
 * One-shot cleanup for historical regulatory_requirements rows whose
 * `requirement` text was copied verbatim from a current-FY source row,
 * so the trailing "— For <Month> <Year>" suffix in the name does NOT
 * match the actual `period_label` / `due_date` on the row.
 *
 * The buggy generator produced TWO classes of bad rows for the same
 * logical (company, period_key) slot:
 *   - The original (correct) one, e.g. requirement = "ESI ... For Jul 2025"
 *   - Duplicates with stray names, e.g. "ESI ... For Feb 2028" with
 *     period_label = "For Jul 2025" and due_date = 2025-08-15
 *
 * The unique constraint (company_id, requirement, period_key) means we
 * can't simply rename row B → row A's name (that name+period_key
 * already exists). So this script does:
 *
 *   For each row needing repair:
 *     - Compute the correct name = baseName + " — " + period_label
 *     - If a row already exists for (company, correct_name, period_key):
 *         DELETE this duplicate
 *     - Else:
 *         UPDATE this row's requirement to the correct name
 *
 * Idempotent. Safe to re-run.
 *
 * Usage:
 *   DATABASE_URL='<prod_direct_url>' node scripts/fix-historical-names.js
 *     [--dry]                    print what it would change
 *     [--company-id <uuid>]      scope to one company
 */

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

function parseArgs(argv) {
  const args = { dry: false, companyId: null }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry') args.dry = true
    else if (a === '--company-id') args.companyId = argv[++i]
  }
  return args
}

// Matches ONLY the final period suffix:
//   "— For Jun 2026", "— Jun 2026", "— For January 2026", "— Q1 2026"
// Conservative on purpose: rule names like
//   "Advance Tax — Q1 Instalment (15%) — Jun 2026"
// must keep the "Q1 Instalment (15%)" part as base; only "— Jun 2026"
// is stripped.
const SUFFIX_RE = /\s*[—–-]\s*(?:Monthly|Quarterly|Annual|Half-Yearly|Half-yearly|For\s+|Q[1-4]\s+|H[12]\s+)*(?:For\s+)?(?:Q[1-4]\s+)?(?:H[12]\s+)?[A-Za-z]{3,9}\s+\d{4}\s*$/i
const stripPeriodSuffix = (name) => {
  let prev = name
  let next = name.replace(SUFFIX_RE, '').trim()
  let i = 0
  while (next !== prev && i++ < 8) {
    prev = next
    next = next.replace(SUFFIX_RE, '').trim()
  }
  return next
}

;(async () => {
  const args = parseArgs(process.argv)
  console.log('[fix-historical-names] starting', args)

  const where = {
    period_label: { not: null },
    period_key: { not: null },
    due_date_formula: { not: null },
    ...(args.companyId ? { company_id: args.companyId } : {}),
  }

  const rows = await p.regulatoryRequirement.findMany({
    where,
    select: {
      id: true,
      company_id: true,
      requirement: true,
      period_key: true,
      period_label: true,
      due_date: true,
      created_at: true,
    },
    orderBy: { created_at: 'asc' }, // process oldest first so dedup keeps the original
  })

  console.log('[fix-historical-names] candidate rows:', rows.length)

  // Build a fast lookup of "what names already exist for (company_id, period_key)"
  const namesByKey = new Map() // key: "<companyId>|<period_key>" → Set<requirement_lowercase>
  for (const r of rows) {
    const key = `${r.company_id}|${r.period_key}`
    if (!namesByKey.has(key)) namesByKey.set(key, new Set())
    namesByKey.get(key).add(r.requirement.toLowerCase())
  }

  let needFix = 0
  let updated = 0
  let deletedDup = 0
  let skipped = 0
  const samples = []

  for (const r of rows) {
    // Compute the canonical name: full strip → base → append period_label.
    // This catches BOTH cases:
    //   1. Trailing suffix wrong: "...— Dec 2026" with period_label "Jul 2025"
    //   2. Compound stray suffix: "...— Dec 2024 — Sep 2024" (ends with the
    //      right period_label but has a stray "Dec 2024" before it)
    if (!SUFFIX_RE.test(r.requirement)) continue // no period suffix at all → leave alone

    const baseName = stripPeriodSuffix(r.requirement)
    if (!baseName) { skipped++; continue }
    const correctName = `${baseName} — ${r.period_label}`

    if (r.requirement === correctName) continue // already canonical
    needFix++

    const key = `${r.company_id}|${r.period_key}`
    const namesAtKey = namesByKey.get(key) || new Set()
    const correctAlreadyExists = namesAtKey.has(correctName.toLowerCase())

    if (samples.length < 6) {
      samples.push({
        from: r.requirement,
        to: correctName,
        period_label: r.period_label,
        action: correctAlreadyExists ? 'delete-duplicate' : 'rename',
      })
    }

    if (args.dry) continue

    try {
      if (correctAlreadyExists) {
        // Another row already has the correct name for this period_key.
        // This row is a stray duplicate — delete it.
        await p.regulatoryRequirement.delete({ where: { id: r.id } })
        deletedDup++
      } else {
        // Safe to rename — guard against concurrent writes.
        const res = await p.regulatoryRequirement.updateMany({
          where: { id: r.id, requirement: r.requirement },
          data: { requirement: correctName },
        })
        if (res.count > 0) {
          updated++
          // Update our in-memory map so subsequent rows see the new name
          namesAtKey.delete(r.requirement.toLowerCase())
          namesAtKey.add(correctName.toLowerCase())
        }
      }
    } catch (e) {
      console.warn('[fix-historical-names] row', r.id, 'failed:', e.message)
      skipped++
    }
  }

  console.log('=== summary ===')
  console.log({
    rowsScanned: rows.length,
    rowsNeedingFix: needFix,
    rowsRenamed: args.dry ? 0 : updated,
    rowsDeletedAsDuplicate: args.dry ? 0 : deletedDup,
    rowsSkipped: skipped,
  })
  console.log('=== first 6 samples ===')
  console.log(JSON.stringify(samples, null, 2))

  if (args.dry) console.log('[fix-historical-names] DRY RUN — no rows modified.')
  await p.$disconnect()
})().catch((e) => {
  console.error('[fix-historical-names] threw', e.message, e.stack)
  process.exit(1)
})
