import { NextRequest, NextResponse } from 'next/server'
import { processIngestBatch } from '@/lib/compliance/ingest-worker'

/**
 * Webhook endpoint hit by Supabase pg_cron (via pg_net.http_post)
 * every 30s. Authenticates via shared secret in `x-ingest-secret`
 * header, then claims and processes a batch of ingest jobs.
 *
 * The endpoint is fire-and-forget from cron's perspective: pg_net
 * doesn't wait for or care about the response body, so latency here
 * doesn't affect database load. We process jobs synchronously in the
 * request and return a small JSON summary for log inspection.
 *
 * Concurrency safety: the worker uses `FOR UPDATE SKIP LOCKED` so two
 * concurrent invocations (e.g. a Vercel cold-start lag overlapping
 * with the next cron tick) can't claim the same job.
 */

// Allow up to 5 minutes per batch — covers the worst case of 30 jobs
// each with a 10s LLM call (~5min). Vercel's default 10s timeout
// is too short.
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.INGEST_WORKER_SECRET
  if (!expectedSecret) {
    console.error('[ingest-webhook] INGEST_WORKER_SECRET not configured')
    return NextResponse.json({ error: 'webhook not configured' }, { status: 500 })
  }

  const provided = request.headers.get('x-ingest-secret')
  if (provided !== expectedSecret) {
    console.warn('[ingest-webhook] auth failed — invalid secret header')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const workerId = request.headers.get('x-vercel-id') || `worker-${Date.now()}`

  try {
    const result = await processIngestBatch(workerId)
    console.log('[ingest-webhook] batch ok', { workerId, ...result })
    return NextResponse.json({ ok: true, workerId, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ingest-webhook] batch failed', { workerId, error: msg, stack: err instanceof Error ? err.stack : '' })
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

// Allow GET for manual testing / Vercel preview ping. Same auth.
export async function GET(request: NextRequest) {
  return POST(request)
}
