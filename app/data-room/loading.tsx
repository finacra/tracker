import DataRoomBootShell from './components/DataRoomBootShell'

/**
 * Route-level loading UI rendered by Next.js while the /data-room RSC
 * is fetching server-side (PR-44 streaming SSR runs
 * `getDataRoomInitState` in the page.tsx server component, which can
 * take 2-5s on a cold lambda).
 *
 * Without this file, Next.js shows the *previous* page (e.g.
 * /subscribe, /home) until the RSC payload is ready — that's
 * disorienting on click. With loading.tsx the boot shell renders
 * instantly the moment the user navigates, then the real
 * DataRoomClient replaces it when the data arrives.
 *
 * Re-uses the same DataRoomBootShell already used by the client
 * component, so the visual handoff is seamless — the post-load tree
 * lands in the exact same DOM positions, no layout shift.
 */
export default function Loading() {
  return <DataRoomBootShell />
}
