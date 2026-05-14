import type {
    DigestFrequency,
    EmailPreferenceRecord,
    EmailPreferenceRepository,
    SaveEmailPreferenceInput,
} from '@/application/interfaces/EmailPreferenceRepository'
import { prisma, cached } from '@/lib/prisma'

export class PrismaEmailPreferenceRepository implements EmailPreferenceRepository {
    async getByUserId(userId: string): Promise<EmailPreferenceRecord | null> {
        // Cached via Prisma Accelerate (60s TTL + 30s SWR). User
        // preferences change rarely (settings UI edit, maybe once a
        // month) but this fires on every notification-routing decision
        // and team-update broadcast. Auto-invalidates on saveForUser's
        // upsert below.
        const row = await cached(
            prisma.emailPreference.findUnique({
                where: { user_id: userId },
            }),
            { ttl: 60, swr: 30 },
        )

        if (!row) return null

        return {
            userId: row.user_id,
            unsubscribeStatusChanges: row.unsubscribe_status_changes,
            unsubscribeReminders: row.unsubscribe_reminders,
            unsubscribeTeamUpdates: row.unsubscribe_team_updates,
            unsubscribeAll: row.unsubscribe_all,
            digestFrequency: row.digest_frequency as DigestFrequency,
        }
    }

    async saveForUser(userId: string, input: SaveEmailPreferenceInput): Promise<void> {
        await prisma.emailPreference.upsert({
            where: { user_id: userId },
            create: {
                user_id: userId,
                app_user_id: input.appUserId || null,
                unsubscribe_status_changes: input.unsubscribeStatusChanges ?? false,
                unsubscribe_reminders: input.unsubscribeReminders ?? false,
                unsubscribe_team_updates: input.unsubscribeTeamUpdates ?? false,
                unsubscribe_all: input.unsubscribeAll ?? false,
                digest_frequency: input.digestFrequency ?? 'daily',
                updated_at: new Date(),
            },
            update: {
                app_user_id: input.appUserId || undefined,
                unsubscribe_status_changes: input.unsubscribeStatusChanges,
                unsubscribe_reminders: input.unsubscribeReminders,
                unsubscribe_team_updates: input.unsubscribeTeamUpdates,
                unsubscribe_all: input.unsubscribeAll,
                digest_frequency: input.digestFrequency,
                updated_at: new Date(),
            },
        })
    }
}
