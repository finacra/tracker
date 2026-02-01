'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { acceptTeamInvitation } from '@/app/data-room/actions'

export default function InviteAcceptClient(props: { token?: string }) {
  const router = useRouter()
  const { user, loading } = useAuth()

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState<string>('Processing invitation…')

  useEffect(() => {
    if (!props.token) {
      setStatus('error')
      setMessage('Missing invitation token.')
      return
    }

    if (loading) return

    if (!user) {
      router.push('/')
      return
    }

    let cancelled = false
    async function run() {
      try {
        const result = await acceptTeamInvitation(props.token as string)
        if (cancelled) return

        if (result.success) {
          setStatus('success')
          setMessage('Invitation accepted. Redirecting…')
          router.push('/team')
        } else {
          setStatus('error')
          setMessage(result.error || 'Failed to accept invitation.')
        }
      } catch (err: any) {
        if (cancelled) return
        setStatus('error')
        setMessage(err?.message || 'Failed to accept invitation.')
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [props.token, user, loading, router])

  return (
    <div className="min-h-screen bg-primary-dark flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-8">
        <h1 className="text-2xl font-light text-white mb-2">Accept invitation</h1>
        <p className="text-sm text-gray-400 mb-6">{message}</p>

        {status === 'loading' && (
          <div className="flex items-center gap-3 text-gray-300">
            <div className="w-4 h-4 border-2 border-primary-orange border-t-transparent rounded-full animate-spin" />
            <span>Working…</span>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3">
            <div className="text-sm text-red-400">{message}</div>
            <button
              onClick={() => router.push('/team')}
              className="w-full bg-primary-orange text-white px-4 py-2.5 rounded-lg hover:bg-primary-orange/90 transition-colors"
            >
              Go to Team
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

