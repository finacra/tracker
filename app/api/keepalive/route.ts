import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Lightweight keep-alive endpoint hit by Supabase pg_cron (via
 * pg_net.http_post) every ~4 minutes. Two warm-cache effects:
 *
 *   1. Vercel keeps the lambda instance in its warm-pool because
 *      invocations are recent. Subsequent real user requests skip
 *      the ~600 ms cold-start tax.
 *   2. The singleton PrismaClient in lib/prisma.ts establishes its
 *      PgBouncer connection on first query and reuses it. A real
 *      user's first request after a long idle period otherwise pays
 *      the ~2.8 s TLS-handshake + pool-setup we measured in PR-38.
 *      Firing a trivial query here keeps that connection alive.
 *
 * Fire-and-forget from cron's perspective: pg_net doesn't wait for
 * or care about the response body, so the response is intentionally
 * tiny. Latency on this endpoint doesn't affect anything.
 *
 * Concurrency: pg_cron schedules at fixed intervals; if two ticks
 * overlap (e.g. cold lambda lag) both will hit different lambda
 * instances and each will warm its own pool — that's fine.
 *
 * Auth: shared secret in `x-keepalive-secret` header against env var
 * `KEEPALIVE_SECRET`. Same pattern as /api/jobs/run-ingest.
 */

export const maxDuration = 30

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.KEEPALIVE_SECRET
  if (!expectedSecret) {
    console.error('[keepalive] KEEPALIVE_SECRET not configured')
    return NextResponse.json({ error: 'keepalive not configured' }, { status: 500 })
  }

  const provided = request.headers.get('x-keepalive-secret')
  if (provided !== expectedSecret) {
    console.warn('[keepalive] auth failed — invalid secret header')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const t0 = performance.now()
  try {
    await prisma.$queryRaw`SELECT 1 as ping`
    const elapsed = performance.now() - t0
    console.log(`[keepalive] ok ${elapsed.toFixed(0)}ms`)
    return NextResponse.json({ ok: true, elapsed_ms: Math.round(elapsed) })
  } catch (err) {
    const elapsed = performance.now() - t0
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[keepalive] db ping failed after ${elapsed.toFixed(0)}ms`, message,
      err instanceof Error ? err.stack : '')
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
