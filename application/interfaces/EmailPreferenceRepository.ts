export type DigestFrequency = 'instant' | 'daily' | 'weekly' | 'none'

export interface EmailPreferenceRecord {
  userId: string
  unsubscribeStatusChanges: boolean
  unsubscribeReminders: boolean
  unsubscribeTeamUpdates: boolean
  unsubscribeAll: boolean
  digestFrequency: DigestFrequency
}

export interface SaveEmailPreferenceInput {
  unsubscribeStatusChanges?: boolean
  unsubscribeReminders?: boolean
  unsubscribeTeamUpdates?: boolean
  unsubscribeAll?: boolean
  digestFrequency?: DigestFrequency
  appUserId?: string | null
}

export interface EmailPreferenceRepository {
  getByUserId(userId: string): Promise<EmailPreferenceRecord | null>
  saveForUser(userId: string, input: SaveEmailPreferenceInput): Promise<void>
}
