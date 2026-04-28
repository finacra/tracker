// Server-component layout for the /data-room route segment.
//
// Why this exists: server actions invoked from this route inherit
// `maxDuration` from the route segment. Without this layout the
// segment defaults to Vercel's 60s function limit, which is too tight
// for `generateComplianceForCompany` — Perplexity's web-search call
// alone can take 30-50s, and combined with cold starts the function
// was being killed mid-flight.
//
// 300s is Vercel Pro's maximum. We don't actually want generation to
// take that long, but the headroom means a slow upstream API never
// translates into an aborted server action.
export const maxDuration = 300

export default function DataRoomLayout({ children }: { children: React.ReactNode }) {
  return children
}
