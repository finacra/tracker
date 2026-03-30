# Project Rules

## Performance — Non-Negotiable

1. **Never allow redundant server calls for a single user interaction.** Before writing or modifying any client-side code that calls server actions, trace the FULL call graph: how many server actions fire, how many `createServerContainer()` calls result, how many auth checks happen. If more than one server action fires for a single user interaction (page load, button click, company switch, tab change), consolidate into a single batched server action.

2. **Always audit `createServerContainer()` usage.** Each call instantiates ~17 repository objects and triggers a `getSession()` + DB user lookup. Never call it more than once per server action. Never let helper functions like `canUserView()` or `getCurrentUserOrNull()` create their own container — pass the existing container/user down.

3. **Parallel, not sequential.** When a server action needs multiple pieces of data, use `Promise.all()`. Never chain sequential awaits for independent queries. Auth check is the only thing that must complete before data fetches.

4. **Pre-populate React Query cache** when a batched server action returns data that hooks would otherwise fetch independently. Use `queryClient.setQueryData()` to prevent redundant network calls.

5. **Never clear state to empty before replacing it.** Don't do `setState([])` followed by an async fetch that sets the real data — this causes UI flashes (empty state → loading → data). Instead, show a loading overlay while keeping stale data, then swap atomically.

## Code Quality

6. **Think at the call site, not just the function.** When reviewing or writing a function, always ask: "What else fires when this runs?" Check useEffects, React Query hooks, and other side effects triggered by the same state change.

7. **Proactively flag architectural issues.** Don't treat existing patterns as correct just because they're repeated. If you see the same anti-pattern 32 times, that's 32 bugs, not a convention. Raise it immediately.

8. **Trace the full request lifecycle** before making changes. Client interaction → state change → which effects fire → which server actions → which DB queries. Map this out, especially for critical paths (login, page load, company switch).

## Critical Paths (must be fast)

- **Sign-in → data room load**: `getDataRoomInitState()` — single batched call
- **Company switch**: `getCompanySwitchData()` — single batched call with cache pre-population
- **Tab switching**: Should be instant (data already loaded or shows loading state)

## Stack

- Next.js App Router, React 18, TypeScript
- Prisma ORM, PostgreSQL (remote on Vercel)
- React Query for client-side cache
- Passport JWT sessions (7-day cookie)
- Vercel serverless deployment (cold starts matter)
- Server actions for all data fetching (no API routes for data)

## What NOT to Do

- Don't add `useEffect` waterfalls — effects that trigger state changes that trigger more effects
- Don't call `createServerContainer()` in helper functions that are called from server actions that already have a container
- Don't fix symptoms (UI flicker, loading states) without investigating the root cause (server performance)
- Don't treat client-side workarounds (refs, guards, debouncing) as solutions for server-side problems
