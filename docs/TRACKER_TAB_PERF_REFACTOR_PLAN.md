# Tracker Tab Perf Refactor — Follow-up Plan

**Status:** Scoped, not started. Picked up next session.
**Created:** 2026-05-14 (perf-test session, after PRs #125-#137)

## What we observed

Smoke-test on a paid `/data-room` (Starter Annual via super99) showed that
clicking the **Tracker** tab fires **~24 sequential POSTs to `/data-room?tab=tracker`**,
each landing on a cold lambda (3–7 s per request). Total observable
wall-clock from click → settled UI: ~50 s.

PR-47 attempted to neutralize the URL change (`history.replaceState`
instead of `router.replace`). The URL bar updates correctly, but Next.js's
App Router monkey-patches `history.replaceState` at runtime and still
re-evaluates the route's RSC. Net: ~2 requests saved out of 24.

The 22 remaining POSTs are independent server actions fired by
`TrackerTab`'s child components on mount. They're sequential because
each `useEffect` waits on the previous render to flush, and each pays
the iad1 ↔ ap-south-1 PgBouncer TLS-handshake tax on a cold lambda
(measured baseline: 2.5–2.8 s connection establishment, then
~50–200 ms Postgres execution).

## Why this isn't a single-PR fix

`TrackerTab` is a heavy subtree with mount-time fetches in at least:

- `ComplianceIntelligencePanel` — `hasUserAnsweredIntake`, `listFactsForFY`
  (both already `useQuery` with 5-min staleTime — good)
- `TrackerEvaluationPanel` — `listAssessments`, `recordUserFact`,
  `runApplicabilityEvaluation` (action-triggered, not mount)
- `RequirementDesktopTableView` — per-row `getDocumentSignedUrl` —
  N requests in parallel per render
- `RequirementFormModal` — `regulatoryService.getRequirements` on open
- `ComplianceIntakeForm` — `recordUserFacts` on submit
- `CategoryDashboard` — likely some compute
- `useCalendarSync` hook — may sync ICS calendar

Plus DataRoomClient's own useEffects that depend on `currentCompany.id`
still re-fire when the company prop reference rotates, even when the
id is the same.

## Refactor plan (2–3 focused days, in order)

### Phase 1 — Audit & batch (1 day)

**1A. Map the fetch graph (~half day)**
Write a one-off script + scan that walks `TrackerTab`'s component tree
and lists every server-action invocation on mount, with arg shape and
dependency-array. Output: a table that tells us what's redundant vs
genuinely tab-specific.

**1B. Build `getTrackerTabInitState(companyId, fy)` (~half day)**
Analogous to `getDataRoomInitState`. Single server action that fans
out parallel queries via `Promise.all` and returns:
- Per-row signed URLs for the visible requirements page (paginated/limited)
- Intake answered flag
- Facts for the selected FY
- Pending AI requirements (only if relevant)
- Calendar sync state

Each piece becomes a key in the response payload. One RTT instead of 24.

### Phase 2 — Suspense + cache hydration (~half day)

Wrap `TrackerTab`'s render tree in nested Suspense boundaries:

```tsx
<TrackerHeader />  {/* renders instantly with already-loaded data */}
<Suspense fallback={<TrackerCategorySkeleton />}>
  <TrackerCategoryAccordionView /> {/* awaits tab-init payload */}
</Suspense>
<Suspense fallback={<CIPSkeleton />}>
  <ComplianceIntelligencePanel /> {/* second tier */}
</Suspense>
```

Use `<HydrationBoundary state={dehydrate(queryClient)}>` (already in
`@tanstack/react-query`) or manual `queryClient.setQueryData` to
pre-populate React Query cache from the batched action's response.
On warm tab switch, `useQuery` reads from cache → 0 network.

### Phase 3 — Defeat the URL-change refetch (~30 min)

Two viable options:
- **Hash-based URL** (`/data-room#tab=tracker`) — Next.js router
  ignores hash changes entirely. Tradeoff: hash isn't visible to
  server-side searchParams; bookmark-deep-link to a tab requires the
  client to read `location.hash` on mount.
- **No URL update at all** — tab state purely in React state +
  Zustand. Refresh-loses-tab UX is mild.

Hash is the better UX. Implement once Phase 2 is done so the test
isolates each fix.

### Phase 4 — Per-row signed URLs (~half day)

The requirements table currently fires `getDocumentSignedUrl` once per
visible row on mount. Move to:
- Lazy: fire only when user clicks Download/Preview
- OR Batch: single action `getSignedUrls(companyId, documentIds[])`
  returning a map, called once after the rows render

This alone could be ~10 fewer requests per Tracker view.

## Expected impact

| Metric | Today | After full refactor |
|---|---:|---:|
| Overview → Tracker requests | ~24 | 1 (batched) |
| Time to interactive (Tracker) | ~50 s cold | < 1 s warm, < 5 s cold |
| Network footprint | ~150 KB | ~50 KB |

## Out of scope for this plan

- The post-init waterfall on **first** `/data-room` load (~12 s of 4
  sequential POSTs after DCL). Similar shape, similar fix, but the
  init useEffect already pre-populates most refs — the remaining
  fetches are from `Providers.tsx` (superadmin check), `Header.tsx`
  (notifications), and `useUserRole`. Worth a separate audit but
  smaller wall-clock impact than the tab-switch fix.
- The Prisma Accelerate flip. Code is in place behind `cached()` and
  Prisma 6 is now on `main`. Once Accelerate's config story
  stabilizes for our setup, one env-var flip activates ~6 cached
  read paths.

## Verification gates per phase

Each phase ends with a smoke test:
1. Load `/data-room` (cold via incognito).
2. Click Tracker.
3. Capture `performance.getEntriesByType('resource')` filtered to
   `/data-room` and `/api/`.
4. Count POSTs. Document in the PR description.

Target: drop the POST count to **single digits** after Phase 1, to
**1** after Phase 2 (only the batched action), and **0 on warm switch
within stale window** after the cache pre-population.
