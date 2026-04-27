# Project Rules

## Proactive Engineering — Non-Negotiable

0. **Trace the FULL impact of every change before writing code.** Before modifying any function, data model, query, or state: (a) identify every caller and consumer, (b) check what reads the same data/state, (c) verify field name consistency (snake_case vs camelCase), (d) check both client-side and server-side effects. A change to a DB query affects every UI component that reads from it. A change to a Prisma model affects every repository method, server action, and client state that touches that table. Never change one layer without verifying all layers above and below it.

   **Examples of what "trace the full impact" means:**
   - Adding a filter to a DB query → check every component that reads from the query result → verify they still get the data they need
   - Adding a column to Prisma schema → update the repository create/read/update methods → update the server action → update the client form → run `prisma db push`
   - Changing auth flow → trace from cookie → middleware → session endpoint → client adapter → providers.tsx → every hook that reads auth state → every page that checks auth
   - Adding a new field to a form → add to formData state → add to server action params → add to repository input → add to Prisma schema → add to DB → add to any display components

   **Anti-patterns to avoid:**
   - Fixing a symptom without tracing the root cause (e.g., adding a loading state instead of fixing why data arrives late)
   - Changing a DB query without checking what components read from it
   - Adding server-side logging to debug a client-side bug (trace client first per Rule 11)
   - Making the same type of fix multiple times (FK constraints, field name mismatches) without doing a sweep for all instances

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

## Debugging — Non-Negotiable

9. **`console.log` is always reliable — use it aggressively. Don't loop on "try again while I tail Vercel logs".** Vercel CLI `logs` streams from "now" only (5-min session), the preview-log UI lags, and browser Network tabs hide server-action payloads. `console.log` in the function body shows up in Vercel runtime logs the moment the code runs, and in the browser DevTools Console for client-side, every time. It is the lowest-friction, highest-reliability diagnostic we have. Prefer it over any other approach.

   **Log aggressively — err on the side of too many `console.log`s, not too few. The cost of a few extra log lines is tiny compared to an extra deploy round-trip.**

   Every time you need more visibility than raw stack traces give you, add logs in the SAME commit as the fix:

   - **Every server-action boundary** (happy AND error paths) gets a `console.log` / `console.error` with a stable prefix — e.g. `[uploadAndAnalyze] ok …` / `[uploadAndAnalyze] threw …`. On the error path include `error.message + error.stack`. `handleActionError` redacts by design, so the raw message must be logged BEFORE it runs, never after.
   - **Every client-side catch** (in `onClick` / `onChange` / mutation handlers / effects / fetchers) logs the full error + any response body: `console.error('[ActionName]', err, err?.stack, err?.response?.data)`. A bare "unexpected response" or 400 gives you nothing; this gives you the line.
   - **Server actions that might return non-JSON-serialisable values** (Prisma Decimal / Date / BigInt / class instance) get `console.log('[name] returning', JSON.stringify(returnValue))` right before `return`. A serialisation failure surfaces the specific key.
   - **LLM calls** log the raw response (first ~2k chars) BEFORE `JSON.parse`, plus the prompt size and `max_completion_tokens`. Truncation and token-ceiling bugs become obvious.
   - **Database calls that can race or partial-fail** log the input values and the returned row count. A silent `updateMany` affecting 0 rows is a common invisible bug.
   - **Ship diagnostics in the same commit as the fix.** If the fix doesn't fully work, the next repro must already have the answer in the logs. Never "fix now, add logs later".
   - **Remove `console.log`s only after the flow is user-verified stable** — green build + green E2E or explicit user confirmation. Leaving them long-term is noise; removing them too early restarts the loop.

   If the user is frustrated about repeated log-tailing attempts, that is signal you under-logged. Add more logs, not better tailing.

## Performance Sprint Lessons — Non-Negotiable

These rules came from a multi-PR perf sweep where I shipped fix-after-fix that "looked right in code" but didn't actually drop the network count or wall-clock time. The user had to repeatedly demand smoke tests after the fact, and each smoke caught 2–3 more issues that were obvious in hindsight. Every rule below is here because I violated it at least once that day.

14. **Code-reading is structure; only runtime is behavior. Verify perf claims with a real browser before declaring "shipped".** A PR that claims "X → Y POSTs" or "shaved Ns" without an attached network-waterfall screenshot or console-counted measurement is a guess. Race conditions, mount-order, cold-start latency, hook timing, and React Query staleness are invisible to static reading. If you don't have a browser MCP available, ask the user to run the smoke test before merging — don't merge on faith.

15. **When you fold side-fetches into a batched action, sweep every consumer before declaring done.** Adding a field to the payload helps nothing if a hook or component STILL fetches it independently. Mandatory checks before PR:
    - `grep` for every caller of the action you replaced — nothing should be left
    - `grep` for every hook reading the same React Query key — confirm they read seeded cache, not standalone
    - List every component that mounts before the page that does its own fetch (Header, layout-level providers) — they need their own seed
    - If there's a useEffect that re-fetches based on a derived value (e.g. `countryCode` defaulting to "IN" before the company is set), that effect WILL race the init useEffect — gate it on `isDataRoomInitLoading` or `currentCompany`

16. **Question dead code before optimizing it.** When you find `await expensiveCall()` in a critical path, the FIRST question is "what is the result actually used for?" Trace the assignment forward — does the value get persisted? Read by anything? Returned to the client? In this sprint a 30-second `generateEmbedding()` call was running on every onboarding because no one asked: the embedding wasn't even being persisted by the repository. The right fix was `git rm`, not `Promise.all`. **Never optimize code that does nothing.**

17. **GitHub squash-merge silently drops diffs when develop has interleaved merge commits.** Three PRs in this sprint (#23, #25, #27) merged "successfully" but the squash commit on main contained zero of the actual file changes. Always verify after every `gh pr merge`:
    ```
    git fetch origin && git show origin/main:path/to/changed/file.ts | grep -n 'unique-string-from-your-diff'
    ```
    If the verification fails, open a follow-up PR immediately. To avoid: rebase develop onto main before opening the PR (no merge commits between your work and main).

18. **Smoke-test the user-facing flow YOU just changed before reporting done.** "Looks right in code" cost this team three rounds of follow-up PRs that day. The actual workflow is:
    1. Make the change
    2. Type-check
    3. Open the browser to the affected route, drive the affected interaction
    4. Inspect Network tab — was the POST count actually reduced? Did the action you targeted disappear?
    5. THEN commit, PR, merge
    Steps 3–4 are not optional. Ship-and-pray cost more total time than ship-and-verify, every single time.

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
- Don't run raw SQL migrations manually — use `npx prisma db push` to sync schema changes from `prisma/schema.prisma` to the DB. This avoids schema/DB mismatches (NOT NULL constraints, missing columns, stale Prisma Client)
- **NEVER define a table only in raw SQL (supabase/migrations/*.sql) without also adding it to `prisma/schema.prisma`.** Prisma is the single source of truth for ALL table definitions. Raw SQL is only for: seed data, RPC functions (match_document_chunks), pgvector indexes (HNSW), and one-shot data migrations. If code references a table via `$queryRaw`, `supabase.from()`, or Prisma client, that table MUST have a `model` in schema.prisma. Violation of this rule caused three separate "relation does not exist" crashes in one session.
- Don't add concurrent callers to `syncAppUser` in `providers.tsx` without guarding against the requestId race
