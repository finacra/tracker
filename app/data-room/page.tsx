import DataRoomClient from './DataRoomClient'
import { getDataRoomInitState } from './actions'

/**
 * Server-prefetched /data-room route.
 *
 * Before PR-44 the page was a single 4848-line client component that
 * rendered <DataRoomBootShell /> on mount and then fired
 * `getDataRoomInitState(...)` from a useEffect to load everything.
 * On a cold lambda that fetch took 2.5-4s (measured in PR-38) — pure
 * Vercel iad1 ↔ Supabase ap-south-1 RTT + connection-pool warmup, not
 * Postgres execution time. The user stared at a spinner for that
 * entire window.
 *
 * PR-44 moves the fetch into this RSC. The server already paid the
 * lambda-init + Prisma-pool-warmup tax to render the layout (PR-33);
 * adding `getDataRoomInitState` to the same critical path overlaps
 * with React rendering instead of running in series after hydration.
 * The result is passed down as a serialized prop, so the client
 * component skips its own fetch on first mount and goes straight to
 * the populated UI.
 *
 * Failure mode: when the server fetch throws (e.g. session cookie
 * missing, transient network), we pass `null` down. The client
 * useEffect then falls back to the original fetch path — no regression
 * versus the pre-PR-44 behavior.
 *
 * SearchParams: Next 15's `searchParams` is a Promise; awaiting it
 * here lets us forward the URL's company_id into the prefetch so the
 * CTE materializes data for the right target company instead of
 * defaulting to the user's first accessible company.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawCompanyId =
    (typeof params?.company_id === 'string' ? params.company_id : undefined) ??
    (typeof params?.company === 'string' ? params.company : undefined) ??
    null

  // Failure isolated: a thrown rejection here would 500 the route.
  // Catch, fall back to null, let the client component re-fetch.
  const initialInitResult = await getDataRoomInitState(rawCompanyId).catch(
    (err) => {
      console.error(
        '[data-room/page] server prefetch failed — client will refetch',
        err instanceof Error ? err.message : err,
        err instanceof Error ? err.stack : '',
      )
      return null
    },
  )

  return <DataRoomClient initialInitResult={initialInitResult} />
}
