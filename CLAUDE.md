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

## Auth — Known Pitfalls

9. **Passport JWT + Supabase PgBouncer.** This project uses Passport JWT sessions (not Supabase Auth). The `user_id` column in DB tables may have FK constraints pointing to `auth.users` which Passport users don't exist in. When adding new tables with `user_id`, **never** add FK constraints to `auth.users`. If a FK error like `user_id_fkey` appears, the constraint must be dropped.

10. **Auth race condition in `providers.tsx`.** The `AuthProvider` has two concurrent auth flows: `getSession().then(syncAppUser)` (immediate) and `onAuthStateChange` (500ms delay). Both call `syncAppUser` which uses `appUserRequestIdRef` to discard stale responses. The `onAuthStateChange` callback **must not fire** until the initial load completes, or it will increment the counter and cause the initial fetch to be discarded. Never add additional `syncAppUser` callers without understanding this ordering.

11. **Trace the full auth chain before debugging auth issues.** The auth flow is: `passport_session` cookie → `PassportMiddlewareAuthCheck` (proxy.ts) → `/api/auth/passport/session` (JWT verify + DB check) → `PassportClientAuthAdapter.getSession()` → `syncAppUser` → `/api/auth/profile` → `setAppUser`. When auth fails, start from the **client side** (`providers.tsx` console logs), not the server. The server endpoints almost always work — the bugs are in client-side race conditions.

12. **No interactive Prisma transactions.** `prisma.$transaction(async (tx) => ...)` is **incompatible** with Supabase's PgBouncer in transaction mode. It causes "Transaction not found" errors on Vercel. Use sequential `prisma.$queryRaw` calls instead. All bulk inserts in this project use `ON CONFLICT DO NOTHING` so they're idempotent without transaction wrapping.

13. **DB wipe invalidates sessions.** Truncating `app_users` leaves stale `passport_session` cookies in browsers. The session endpoint (`/api/auth/passport/session`) checks if the user exists in DB and clears the cookie if not. But the proxy middleware (`proxy.ts`) does NOT — it only verifies the JWT signature. After a DB wipe, users must clear cookies or re-register.

## What NOT to Do

- Don't add `useEffect` waterfalls — effects that trigger state changes that trigger more effects
- Don't call `createServerContainer()` in helper functions that are called from server actions that already have a container
- Don't fix symptoms (UI flicker, loading states) without investigating the root cause (server performance)
- Don't treat client-side workarounds (refs, guards, debouncing) as solutions for server-side problems
- Don't add `user_id` foreign keys referencing `auth.users` — Passport users exist in `app_users`, not `auth.users`
- Don't use `prisma.$transaction(async (tx) => ...)` — use sequential queries (PgBouncer incompatible)
- Don't add concurrent callers to `syncAppUser` in `providers.tsx` without guarding against the requestId race
