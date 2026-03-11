import type {
  EmailPreferenceRecord,
  EmailPreferenceRepository,
  SaveEmailPreferenceInput,
} from '@/application/interfaces/EmailPreferenceRepository'
import { createAdminClient } from '@/utils/supabase/admin'

type EmailPreferenceRow = {
  user_id: string
  unsubscribe_status_changes?: boolean | null
  unsubscribe_reminders?: boolean | null
  unsubscribe_team_updates?: boolean | null
  unsubscribe_all?: boolean | null
  digest_frequency?: EmailPreferenceRecord['digestFrequency'] | null
}

export class SupabaseEmailPreferenceRepository implements EmailPreferenceRepository {
  async getByUserId(userId: string): Promise<EmailPreferenceRecord | null> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('email_preferences')
      .select(
        'user_id, unsubscribe_status_changes, unsubscribe_reminders, unsubscribe_team_updates, unsubscribe_all, digest_frequency'
      )
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return null

    return this.mapRow(data as EmailPreferenceRow)
  }

  async saveForUser(userId: string, input: SaveEmailPreferenceInput): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const payload = {
      user_id: userId,
      app_user_id: input.appUserId || null,
      updated_at: new Date().toISOString(),
      ...(input.unsubscribeStatusChanges !== undefined
        ? { unsubscribe_status_changes: input.unsubscribeStatusChanges }
        : {}),
      ...(input.unsubscribeReminders !== undefined
        ? { unsubscribe_reminders: input.unsubscribeReminders }
        : {}),
      ...(input.unsubscribeTeamUpdates !== undefined
        ? { unsubscribe_team_updates: input.unsubscribeTeamUpdates }
        : {}),
      ...(input.unsubscribeAll !== undefined ? { unsubscribe_all: input.unsubscribeAll } : {}),
      ...(input.digestFrequency !== undefined ? { digest_frequency: input.digestFrequency } : {}),
    }

    const { error } = await adminSupabase.from('email_preferences').upsert(payload, { onConflict: 'user_id' })
    if (error) throw new Error(error.message)
  }

  private mapRow(row: EmailPreferenceRow): EmailPreferenceRecord {
    return {
      userId: row.user_id,
      unsubscribeStatusChanges: Boolean(row.unsubscribe_status_changes),
      unsubscribeReminders: Boolean(row.unsubscribe_reminders),
      unsubscribeTeamUpdates: Boolean(row.unsubscribe_team_updates),
      unsubscribeAll: Boolean(row.unsubscribe_all),
      digestFrequency: row.digest_frequency ?? 'daily',
    }
  }
}
