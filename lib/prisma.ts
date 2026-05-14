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
 * is unaffected. Cached call sites: getCurrentUser, document
 * templates, subscription state lookups (see callers).
 */
const prismaClientSingleton = () => {
  const client = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
    transactionOptions: {
      maxWait: 10000,  // 10s max wait for transaction slot
      timeout: 15000,  // 15s transaction timeout
    },
  })
  // Apply Accelerate extension at runtime. We type-cast back to
  // PrismaClient so call sites keep their existing parameter
  // inference (Accelerate's extended type wraps row types in a way
  // that makes many of our untyped .map/.some callbacks fall back to
  // `any` under strict mode — 40+ call sites would need annotations
  // otherwise). The runtime behavior is unchanged: queries still get
  // routed through Accelerate, and .cacheStrategy() works on Prisma
  // queries (cast at call site where needed). When DATABASE_URL is
  // a regular Postgres URL the extension is a transparent no-op.
  return client.$extends(withAccelerate()) as unknown as PrismaClient
}

declare const globalThis: {
  prismaGlobal: PrismaClient
} & typeof global

export const prisma: PrismaClient = globalThis.prismaGlobal ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
