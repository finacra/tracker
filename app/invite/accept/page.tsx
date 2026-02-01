import { Suspense } from 'react'
import InviteAcceptClient from './InviteAcceptClient'

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const params = await searchParams
  const token = params?.token

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-primary-dark flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-8">
            <div className="text-sm text-gray-300">Loading…</div>
          </div>
        </div>
      }
    >
      <InviteAcceptClient token={token} />
    </Suspense>
  )
}

