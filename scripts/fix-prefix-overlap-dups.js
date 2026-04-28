/**
 * One-shot cleanup for prefix-overlap duplicates among rules-engine rows.
 *
 * Background: TRILLION (and other companies) have pairs like:
 *
 *   "Advance Tax — Jun 2025"                          ← stale, generic
 *   "Advance Tax — Q1 Instalment (15%) — Jun 2025"    ← canonical, current rule
 *
 * Both rows have:
 *   - source = 'rules_engine'
 *   - same period_key (e.g. "2025-06")
 *   - same due_date
 *   - same description
 *
 * The shorter-named row is from a now-removed rule definition. We want to
 * delete it and keep the longer-named (more specific) row. Heuristic: for
 * each (company_id, period_key, due_date) group with 2+ rules_engine rows,
 * if one row's `requirement` (after stripping the trailing "— Mon Year"
 * period suffix) is a STRICT PREFIX of another row's stripped requirement,
 * delete the prefix row.
 *
 * Idempotent. Safe to re-run.
 *
 * Usage:
 *   DATABASE_URL='<prod_direct>' node scripts/fix-prefix-overlap-dups.js
 *     [--dry]                    print what it would delete
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

const SUFFIX_RE = /\s*[—–-]\s*(?:Monthly|Quarterly|Annual|Half-Yearly|Half-yearly|For\s+|Q[1-4]\s+|H[12]\s+)*(?:For\s+)?(?:Q[1-4]\s+)?(?:H[12]\s+)?[A-Za-z]{3,9}\s+\d{4}\s*$/i
function stripSuffix(name) {
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
  console.log('[fix-prefix-overlap] starting', args)

  const where = {
    period_key: { not: null },
    source: 'rules_engine',
    ...(args.companyId ? { company_id: args.companyId } : {}),
  }

  const rows = await p.regulatoryRequirement.findMany({
    where,
    select: {
      id: true,
      company_id: true,
      requirement: true,
      period_key: true,
      due_date: true,
    },
  })
  console.log('[fix-prefix-overlap] candidate rows:', rows.length)

  // Group by (company_id, period_key)
  const groups = new Map()
  for (const r of rows) {
    const key = `${r.company_id}|${r.period_key}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ ...r, base: stripSuffix(r.requirement) })
  }

  const toDelete = []
  for (const [, members] of groups) {
    if (members.length < 2) continue
    // Within a group, find pairs where one's base is a strict prefix of another's
    for (const a of members) {
      for (const b of members) {
        if (a.id === b.id) continue
        if (a.base.length >= b.base.length) continue
        // a.base is shorter
        if (b.base.startsWith(a.base + ' ') || b.base.startsWith(a.base + ' —')) {
          toDelete.push({ id: a.id, from: a.requirement, keptBecause: b.requirement })
          break // delete this short one once
        }
      }
    }
  }

  // Dedupe (a row could match multiple longer rows in its group)
  const uniqDelete = Array.from(new Map(toDelete.map((d) => [d.id, d])).values())

  console.log('[fix-prefix-overlap] rows to delete:', uniqDelete.length)
  console.log('[fix-prefix-overlap] first 6 samples:')
  console.log(JSON.stringify(uniqDelete.slice(0, 6), null, 2))

  if (args.dry) {
    console.log('[fix-prefix-overlap] DRY RUN — no rows deleted.')
  } else {
    let deleted = 0
    for (const d of uniqDelete) {
      try {
        await p.regulatoryRequirement.delete({ where: { id: d.id } })
        deleted++
      } catch (e) {
        console.warn('  failed to delete', d.id, ':', e.message)
      }
    }
    console.log('[fix-prefix-overlap] actually deleted:', deleted)
  }

  await p.$disconnect()
})().catch((e) => {
  console.error('[fix-prefix-overlap] threw', e.message, e.stack)
  process.exit(1)
})
