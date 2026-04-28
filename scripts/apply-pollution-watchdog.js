// Applies the pollution-watchdog migration. Prisma's $executeRawUnsafe rejects
// multi-statement bodies, so we split on top-level `;` while respecting
// $$-quoted strings (DO blocks, function bodies). Idempotent.
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

function splitTopLevelStatements(sql) {
  const out = []
  let buf = ''
  let i = 0
  let dollarTag = null
  while (i < sql.length) {
    const c = sql[i]
    if (dollarTag) {
      // Inside $tag$ ... $tag$
      if (c === '$' && sql.slice(i, i + dollarTag.length) === dollarTag) {
        buf += dollarTag
        i += dollarTag.length
        dollarTag = null
        continue
      }
      buf += c
      i++
      continue
    }
    if (c === '$') {
      // Look for $tag$ start
      const m = sql.slice(i).match(/^\$([A-Za-z_]*)\$/)
      if (m) {
        dollarTag = m[0]
        buf += dollarTag
        i += dollarTag.length
        continue
      }
    }
    if (c === '-' && sql[i + 1] === '-') {
      // skip line comment
      const eol = sql.indexOf('\n', i)
      buf += sql.slice(i, eol === -1 ? sql.length : eol + 1)
      i = eol === -1 ? sql.length : eol + 1
      continue
    }
    if (c === ';') {
      const stmt = buf.trim()
      if (stmt) out.push(stmt)
      buf = ''
      i++
      continue
    }
    buf += c
    i++
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations-manual', '2026-04-28-pollution-watchdog.sql')
const sql = fs.readFileSync(sqlPath, 'utf8')

;(async () => {
  const p = new PrismaClient()
  try {
    const statements = splitTopLevelStatements(sql)
    console.log('[apply-watchdog] applying', statements.length, 'statements…')
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i]
      const head = stmt.split('\n')[0].slice(0, 80)
      try {
        await p.$executeRawUnsafe(stmt)
        console.log(`  [${i + 1}/${statements.length}] ok   — ${head}`)
      } catch (e) {
        console.error(`  [${i + 1}/${statements.length}] FAIL — ${head}\n      ${e.message}`)
        throw e
      }
    }
    console.log('[apply-watchdog] migration applied OK')

    const polluted = await p.$queryRawUnsafe(`SELECT public.check_compliance_pollution() AS polluted`)
    console.log('[apply-watchdog] initial check ran:', JSON.stringify(polluted, null, 2))

    const job = await p.$queryRawUnsafe(`
      SELECT jobid::int, schedule, jobname, active
      FROM cron.job WHERE jobname = 'compliance-pollution-watchdog'
    `)
    console.log('[apply-watchdog] cron job:', JSON.stringify(job, null, 2))

    const audit = await p.$queryRawUnsafe(`
      SELECT id::text, checked_at::text, rows_scanned, rows_polluted,
             jsonb_array_length(samples) AS sample_count
      FROM public.compliance_pollution_audit
      ORDER BY checked_at DESC LIMIT 1
    `)
    console.log('[apply-watchdog] latest audit row:', JSON.stringify(audit, null, 2))
  } catch (e) {
    console.error('[apply-watchdog] failed:', e.message)
    process.exit(1)
  } finally {
    await p.$disconnect()
  }
})()
