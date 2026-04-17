'use server'

import type {
  DigestFrequency,
  SaveEmailPreferenceInput,
} from '@/application/interfaces/EmailPreferenceRepository'
import { createServerContainer } from '@/lib/composition/server-container'
import { handleActionError } from '@/lib/errors/handle-error'

export type EmailPreferencesDto = {
  unsubscribe_status_changes: boolean
  unsubscribe_reminders: boolean
  unsubscribe_team_updates: boolean
  unsubscribe_all: boolean
  digest_frequency: DigestFrequency
}

const defaultPreferences: EmailPreferencesDto = {
  unsubscribe_status_changes: false,
  unsubscribe_reminders: false,
  unsubscribe_team_updates: false,
  unsubscribe_all: false,
  digest_frequency: 'daily',
}

export async function getEmailPreferences(): Promise<{
  success: boolean
  preferences?: EmailPreferencesDto
  error?: string
}> {
  try {
    const { authService, emailPreferenceRepository } = createServerContainer()
    const user = await authService.requireCurrentUser()
    const preferences = await emailPreferenceRepository.getByUserId(user.id)

    if (!preferences) {
      return { success: true, preferences: defaultPreferences }
    }

    return {
      success: true,
      preferences: {
        unsubscribe_status_changes: preferences.unsubscribeStatusChanges,
        unsubscribe_reminders: preferences.unsubscribeReminders,
        unsubscribe_team_updates: preferences.unsubscribeTeamUpdates,
        unsubscribe_all: preferences.unsubscribeAll,
        digest_frequency: preferences.digestFrequency,
      },
    }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function saveEmailPreferences(input: EmailPreferencesDto): Promise<{ success: boolean; error?: string }> {
  try {
    const { authService, emailPreferenceRepository } = createServerContainer()
    const user = await authService.requireCurrentUser()

    const payload: SaveEmailPreferenceInput = {
      unsubscribeStatusChanges: input.unsubscribe_status_changes,
      unsubscribeReminders: input.unsubscribe_reminders,
      unsubscribeTeamUpdates: input.unsubscribe_team_updates,
      unsubscribeAll: input.unsubscribe_all,
      digestFrequency: input.digest_frequency,
    }

    await emailPreferenceRepository.saveForUser(user.id, payload)
    return { success: true }
  } catch (error) {
    return handleActionError(error)
  }
}
