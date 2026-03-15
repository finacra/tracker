/**
 * Simple in-process rate limiter using a sliding window counter.
 * Suitable for serverless/edge routes where persistent state is not guaranteed
 * across instances, but provides meaningful protection within a single instance.
 *
 * For multi-instance production use, replace the store with Redis.
 */

interface WindowEntry {
  count: number
  windowStart: number
}

const store = new Map<string, WindowEntry>()

// Periodically purge stale entries to prevent memory growth
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now - entry.windowStart > 60_000) {
      store.delete(key)
    }
  }
}, 60_000)

/**
 * Check whether a request is within the allowed rate.
 *
 * @param key       Unique key for this rate limit bucket (e.g. IP + route)
 * @param limit     Max requests allowed per window
 * @param windowMs  Window size in milliseconds
 * @returns `{ allowed: boolean; remaining: number; retryAfterMs: number }`
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now - entry.windowStart >= windowMs) {
    // Start a fresh window
    store.set(key, { count: 1, windowStart: now })
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 }
  }

  entry.count++

  if (entry.count > limit) {
    const retryAfterMs = windowMs - (now - entry.windowStart)
    return { allowed: false, remaining: 0, retryAfterMs }
  }

  return { allowed: true, remaining: limit - entry.count, retryAfterMs: 0 }
}

/**
 * Extract the client IP from a Next.js request, falling back to a safe default.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * Run an array of async tasks with a bounded concurrency limit.
 * Equivalent to pLimit without the extra dependency.
 *
 * @param items     Items to process
 * @param limit     Max number of concurrent tasks
 * @param fn        Async function to run for each item
 * @returns         Array of settled results in original order
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++
      try {
        results[index] = { status: 'fulfilled', value: await fn(items[index], index) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
