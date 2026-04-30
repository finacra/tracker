'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { acceptTeamInvitation } from '@/app/data-room/actions'
import Link from 'next/link'

export default function InviteAcceptClient(props: { token?: string }) {
  const router = useRouter()
  const { user, loading } = useAuth()

  const [status, setStatus] = useState<'loading' | 'checking' | 'signup' | 'login' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState<string>('Processing invitation…')
  const [inviteEmail, setInviteEmail] = useState<string>('')
  const [inviteCompanyId, setInviteCompanyId] = useState<string>('')
  const [userExists, setUserExists] = useState<boolean>(false)
  
  // Signup form state
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasCheckedInviteRef = useRef(false)

  // Check invite details on mount
  useEffect(() => {
    if (!props.token || hasCheckedInviteRef.current) return

    async function checkInvite() {
      try {
        const response = await fetch(`/api/invite/get-invite?token=${encodeURIComponent(props.token!)}`)
        const data = await response.json()

        if (!response.ok || !data.success) {
          setStatus('error')
          setMessage(data.error || 'Invalid invitation token')
          return
        }

        setInviteEmail(data.invite.email)
        setInviteCompanyId(data.invite.companyId)
        setUserExists(data.userExists)
        hasCheckedInviteRef.current = true

        // If user is already logged in, proceed to accept
        if (user && !loading) {
          setStatus('checking')
          await handleAcceptInvitation()
        } else if (data.userExists) {
          // User exists but not logged in - show login prompt
          setStatus('login')
          setMessage(`An account with ${data.invite.email} already exists. Please sign in to accept the invitation.`)
        } else {
          // New user - show signup form
          setStatus('signup')
          setMessage(`You've been invited! Create an account to accept the invitation.`)
        }
      } catch (err) {
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'Failed to load invitation')
      }
    }

    checkInvite()
  }, [props.token, user, loading])

  const handleAcceptInvitation = async () => {
    if (!props.token) return

    try {
      const result = await acceptTeamInvitation(props.token)
      if (result.success) {
        setStatus('success')
        setMessage('Invitation accepted. Redirecting…')
        setTimeout(() => {
          router.push('/team')
        }, 1500)
      } else {
        setStatus('error')
        setMessage(result.error || 'Failed to accept invitation.')
      }
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Failed to accept invitation.')
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/invite/signup-with-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          password,
          inviteToken: props.token,
          fullName: fullName.trim() || null,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to create account')
        setIsSubmitting(false)
        return
      }

      // Account created - now accept the invitation
      setStatus('checking')
      setMessage('Account created! Accepting invitation…')
      
      // Wait a moment for session to be set, then accept invitation
      setTimeout(async () => {
        await handleAcceptInvitation()
      }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
      setIsSubmitting(false)
    }
  }

  // If user logs in after being redirected, accept the invitation
  useEffect(() => {
    if (user && !loading && hasCheckedInviteRef.current && status === 'login') {
      setStatus('checking')
      handleAcceptInvitation()
    }
  }, [user, loading, status])

  return (
    <div className="min-h-screen bg-primary-dark flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-bg-card border border-line/10 rounded-2xl shadow-2xl p-8">
        <h1 className="text-2xl font-light text-white mb-2">Accept invitation</h1>
        <p className="text-sm text-fg-muted mb-6">{message}</p>

        {status === 'loading' && (
          <div className="flex items-center gap-3 text-fg-secondary">
            <div className="w-4 h-4 border-2 border-primary-orange border-t-transparent rounded-full animate-spin" />
            <span>Loading invitation…</span>
          </div>
        )}

        {status === 'checking' && (
          <div className="flex items-center gap-3 text-fg-secondary">
            <div className="w-4 h-4 border-2 border-primary-orange border-t-transparent rounded-full animate-spin" />
            <span>Processing…</span>
          </div>
        )}

        {status === 'signup' && (
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm text-fg-muted mb-2">Email</label>
              <input
                type="email"
                value={inviteEmail}
                disabled
                className="w-full bg-bg-card border border-line/15 rounded-lg px-4 py-2.5 text-white disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm text-fg-muted mb-2">Full Name (optional)</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-bg-card border border-line/15 rounded-lg px-4 py-2.5 text-white focus:border-primary-orange focus:outline-none"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm text-fg-muted mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-bg-card border border-line/15 rounded-lg px-4 py-2.5 pr-10 text-white focus:border-primary-orange focus:outline-none"
                  placeholder="At least 6 characters"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-white"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L7.5 7.5m-1.21-1.21L3 3m4.29 4.29L7.5 7.5m0 0l3.29 3.29M7.5 7.5l3.29 3.29m0 0L15 15m-1.21-1.21L12 12m4.29 4.29L15 15m0 0l3.29 3.29M15 15l3.29 3.29M21 21l-3.29-3.29m0 0L15 15m3.29 3.29L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-fg-muted mb-2">Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-bg-card border border-line/15 rounded-lg px-4 py-2.5 text-white focus:border-primary-orange focus:outline-none"
                placeholder="Confirm your password"
                required
              />
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary-orange text-white px-4 py-2.5 rounded-lg hover:bg-primary-orange/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Creating account…' : 'Create account & accept invitation'}
            </button>
          </form>
        )}

        {status === 'login' && (
          <div className="space-y-4">
            <p className="text-sm text-fg-secondary">
              An account with <strong className="text-white">{inviteEmail}</strong> already exists.
            </p>
            <Link
              href={`/login?returnTo=${encodeURIComponent(`/invite/accept?token=${props.token}`)}`}
              className="block w-full bg-primary-orange text-white px-4 py-2.5 rounded-lg hover:bg-primary-orange/90 transition-colors text-center"
            >
              Sign in to accept invitation
            </Link>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-3">
            <div className="text-sm text-green-400">✓ {message}</div>
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
