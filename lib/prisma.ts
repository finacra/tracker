import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

/**
 * Prisma client singleton with Prisma Accelerate edge cache wired.
 *
 * Accelerate gives us:
 *   - A connection pool at the edge → no PgBouncer TLS handshake on
 *     cold Vercel lambdas (~600 ms cold-start penalty erased).
 *   - Latency-aware read routing — cached results served from the
 *     edge region nearest Vercel (iad1), bypassing the Mumbai trip
 *     that costs us ~250 ms per query.
 *   - Per-query opt-in result cache via `.cacheStrategy({ ttl, swr })`.
 *
 * Activation: set DATABASE_URL to a `prisma+postgres://accelerate.
 * prisma-data.net/?api_key=...` URL. The extension is wired
 * unconditionally below; with a normal Postgres URL it's a no-op,
 * so this PR ships safely even before the env var is flipped.
 *
 * Caching is OPT-IN per query — only the hot read paths in the
 * codebase have been annotated. `$queryRaw` is NOT cached by
 * Accelerate (no SQL-text-based caching), so the big data-room CTE
 * is unaffected. Cached call sites: getCurrentUser (this PR);
 * follow-up PRs can annotate template loads, subscription state
 * lookups, etc.
 *
 * Type-cast note: the extension's return type wraps Prisma's row
 * types in a way that confuses 40+ untyped .map/.some callbacks in
 * the codebase under noImplicitAny. We cast the export back to
 * PrismaClient so existing call sites compile unchanged. Runtime
 * behavior is intact — queries still route through Accelerate via
 * the $extends Proxy. At sites that USE .cacheStrategy(), a local
 * `as any` cast lets us call the chained method (it's present at
 * runtime even though the cast strips it from the type).
 */
const prismaClientSingleton = () => {
  const client = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
    transactionOptions: {
      maxWait: 10000,  // 10s max wait for transaction slot
      timeout: 15000,  // 15s transaction timeout
    },
  })
  return client.$extends(withAccelerate()) as unknown as PrismaClient
}

declare const globalThis: {
  prismaGlobal: PrismaClient
} & typeof global

export const prisma: PrismaClient = globalThis.prismaGlobal ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma

/**
 * Runtime-safe wrapper for Prisma Accelerate's `.cacheStrategy(...)`.
 *
 * The earlier PRs (#125, #127) claimed the extension was a no-op when
 * DATABASE_URL points at plain Postgres. That was wrong — `withAccelerate()`
 * only attaches `.cacheStrategy` to query promises when the underlying
 * connection actually goes through the Accelerate proxy. With a plain
 * Postgres URL the method is missing and every annotated call site threw
 * `TypeError: cacheStrategy is not a function`, hosing every server action
 * that ran through `requireCurrentUser` in production.
 *
 * Wrap the query promise in this helper so the call site looks the same
 * but tolerates both worlds:
 *
 *   const row = await cached(prisma.appUser.findUnique({...}), { ttl: 60, swr: 30 })
 *
 * When the method exists → cache strategy is applied as intended.
 * When it doesn't → the bare query is awaited, no perf change, no crash.
 *
 * Once DATABASE_URL is flipped to the Accelerate proxy URL, every call
 * site automatically picks up caching with no further code change.
 */
export function cached<T>(
  queryPromise: Promise<T>,
  options: { ttl: number; swr?: number },
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maybeStrategy = (queryPromise as any).cacheStrategy
  if (typeof maybeStrategy === 'function') {
    return maybeStrategy.call(queryPromise, options) as Promise<T>
  }
  return queryPromise
}
