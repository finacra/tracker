import type {
    AuthIdentityRecord,
    AuthIdentityRepository,
} from '@/application/interfaces/AuthIdentityRepository'
import { prisma } from '@/lib/prisma'

export class PrismaAuthIdentityRepository implements AuthIdentityRepository {
    private mapRow(row: any): AuthIdentityRecord {
        return {
            id: row.id,
            appUserId: row.app_user_id,
            provider: row.provider,
            legacyAuthId: row.legacy_auth_id,
            email: row.email,
            isPrimary: Boolean(row.is_primary),
            metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
            createdAt: row.created_at.toISOString(),
        }
    }

    async findByLegacyAuthId(provider: string, legacyAuthId: string): Promise<AuthIdentityRecord | null> {
        const row = await prisma.authIdentity.findFirst({
            where: {
                provider,
                legacy_auth_id: legacyAuthId,
            },
            include: { appUser: true }
        })
        return row ? this.mapRow(row) : null
    }

    async findByAppUserId(appUserId: string): Promise<AuthIdentityRecord[]> {
        const rows = await prisma.authIdentity.findMany({
            where: { app_user_id: appUserId },
            orderBy: { created_at: 'asc' },
        })
        return rows.map((row) => this.mapRow(row))
    }

    async findPrimaryForAppUser(appUserId: string): Promise<AuthIdentityRecord | null> {
        const row = await prisma.authIdentity.findFirst({
            where: {
                app_user_id: appUserId,
                is_primary: true,
            },
        })
        return row ? this.mapRow(row) : null
    }

    async create(input: Omit<AuthIdentityRecord, 'id' | 'createdAt'>): Promise<AuthIdentityRecord> {
        const row = await prisma.authIdentity.create({
            data: {
                app_user_id: input.appUserId,
                provider: input.provider,
                legacy_auth_id: input.legacyAuthId,
                email: input.email,
                is_primary: input.isPrimary,
                metadata: input.metadata as any,
            },
        })
        return this.mapRow(row)
    }
}
