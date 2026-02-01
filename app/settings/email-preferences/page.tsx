'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { useAuth } from '@/hooks/useAuth'

type EmailPreferences = {
  unsubscribe_status_changes: boolean
  unsubscribe_reminders: boolean
  unsubscribe_team_updates: boolean
  unsubscribe_all: boolean
  digest_frequency: 'instant' | 'daily' | 'weekly' | 'none'
}

const defaultPreferences: EmailPreferences = {
  unsubscribe_status_changes: false,
  unsubscribe_reminders: false,
  unsubscribe_team_updates: false,
  unsubscribe_all: false,
  digest_frequency: 'daily',
}

export default function EmailPreferencesPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()

  const [preferences, setPreferences] = useState<EmailPreferences>(defaultPreferences)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push('/auth')
      return
    }

    async function loadPreferences() {
      const { data, error } = await supabase
        .from('email_preferences')
        .select('*')
        .eq('user_id', user!.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading preferences:', error)
        setError('Failed to load preferences')
      } else if (data) {
        setPreferences({
          unsubscribe_status_changes: data.unsubscribe_status_changes,
          unsubscribe_reminders: data.unsubscribe_reminders,
          unsubscribe_team_updates: data.unsubscribe_team_updates,
          unsubscribe_all: data.unsubscribe_all,
          digest_frequency: data.digest_frequency,
        })
      }
      setLoading(false)
    }

    loadPreferences()
  }, [user, authLoading, router, supabase])

  const handleToggle = (key: keyof EmailPreferences) => {
    if (key === 'unsubscribe_all') {
      const newValue = !preferences.unsubscribe_all
      setPreferences({
        ...preferences,
        unsubscribe_all: newValue,
        unsubscribe_status_changes: newValue,
        unsubscribe_reminders: newValue,
        unsubscribe_team_updates: newValue,
      })
    } else if (key.startsWith('unsubscribe_')) {
      setPreferences({
        ...preferences,
        [key]: !preferences[key],
        unsubscribe_all: false, // Uncheck "all" when individual toggled
      })
    }
  }

  const handleDigestChange = (value: EmailPreferences['digest_frequency']) => {
    setPreferences({ ...preferences, digest_frequency: value })
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setError(null)
    setSaved(false)

    const { error } = await supabase.from('email_preferences').upsert(
      {
        user_id: user.id,
        ...preferences,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

    if (error) {
      console.error('Error saving preferences:', error)
      setError('Failed to save preferences')
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A5F]"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[#1E3A5F] text-white">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <button
            onClick={() => router.back()}
            className="text-white/80 hover:text-white text-sm mb-2 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-bold">Email Preferences</h1>
          <p className="text-white/80 text-sm mt-1">Manage your notification settings</p>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Notification Types */}
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Email Notifications</h2>
            <p className="text-sm text-gray-500 mb-6">Choose which emails you want to receive</p>

            <div className="space-y-4">
              {/* All emails toggle */}
              <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition">
                <div>
                  <div className="font-medium text-gray-900">Unsubscribe from all emails</div>
                  <div className="text-sm text-gray-500">Stop receiving all notification emails</div>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.unsubscribe_all}
                  onChange={() => handleToggle('unsubscribe_all')}
                  className="w-5 h-5 rounded border-gray-300 text-[#1E3A5F] focus:ring-[#1E3A5F]"
                />
              </label>

              <div className={preferences.unsubscribe_all ? 'opacity-50 pointer-events-none' : ''}>
                {/* Status changes */}
                <label className="flex items-center justify-between p-4 rounded-lg cursor-pointer hover:bg-gray-50 transition">
                  <div>
                    <div className="font-medium text-gray-900">Status change notifications</div>
                    <div className="text-sm text-gray-500">
                      Get notified when compliance items are updated
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={!preferences.unsubscribe_status_changes}
                    onChange={() => handleToggle('unsubscribe_status_changes')}
                    className="w-5 h-5 rounded border-gray-300 text-[#1E3A5F] focus:ring-[#1E3A5F]"
                  />
                </label>

                {/* Reminders */}
                <label className="flex items-center justify-between p-4 rounded-lg cursor-pointer hover:bg-gray-50 transition">
                  <div>
                    <div className="font-medium text-gray-900">Compliance reminders</div>
                    <div className="text-sm text-gray-500">
                      Receive reminders for upcoming and overdue compliances
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={!preferences.unsubscribe_reminders}
                    onChange={() => handleToggle('unsubscribe_reminders')}
                    className="w-5 h-5 rounded border-gray-300 text-[#1E3A5F] focus:ring-[#1E3A5F]"
                  />
                </label>

                {/* Team updates */}
                <label className="flex items-center justify-between p-4 rounded-lg cursor-pointer hover:bg-gray-50 transition">
                  <div>
                    <div className="font-medium text-gray-900">Team updates</div>
                    <div className="text-sm text-gray-500">
                      Get notified about team invitations and member changes
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={!preferences.unsubscribe_team_updates}
                    onChange={() => handleToggle('unsubscribe_team_updates')}
                    className="w-5 h-5 rounded border-gray-300 text-[#1E3A5F] focus:ring-[#1E3A5F]"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Digest Frequency */}
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Digest Frequency</h2>
            <p className="text-sm text-gray-500 mb-6">
              How often would you like to receive reminder digests?
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { value: 'instant', label: 'Instant', desc: 'As they happen' },
                { value: 'daily', label: 'Daily', desc: 'Once per day' },
                { value: 'weekly', label: 'Weekly', desc: 'Once per week' },
                { value: 'none', label: 'None', desc: 'No digests' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleDigestChange(option.value as EmailPreferences['digest_frequency'])}
                  className={`p-4 rounded-lg border-2 text-left transition ${
                    preferences.digest_frequency === option.value
                      ? 'border-[#1E3A5F] bg-[#1E3A5F]/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-gray-900">{option.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{option.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Save button */}
          <div className="p-6 bg-gray-50 flex items-center justify-between">
            <div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              {saved && (
                <p className="text-green-600 text-sm flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Preferences saved
                </p>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-[#1E3A5F] text-white rounded-lg font-medium hover:bg-[#2d4a6f] transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>

        {/* Info card */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
          <div className="flex gap-3">
            <svg
              className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="text-sm text-blue-800">
              <p className="font-medium">Note about critical notifications</p>
              <p className="mt-1 text-blue-700">
                Even if you unsubscribe, you may still receive critical security and account-related
                emails as required by law.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
