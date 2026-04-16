import type {
    TeamInvitationRecord,
    TeamInvitationRepository,
} from '@/application/interfaces/TeamInvitationRepository'
import type { AppRole } from '@/domain/types/Role'
import { prisma } from '@/lib/prisma'

export class PrismaTeamInvitationRepository implements TeamInvitationRepository {
    private mapRow(row: any): TeamInvitationRecord {
        return {
            id: row.id,
            companyId: row.company_id,
            email: row.email,
            role: row.role as Exclude<AppRole, 'superadmin'>,
            token: row.token,
            invitedBy: row.invited_by,
            expiresAt: row.expires_at.toISOString(),
            acceptedAt: row.accepted_at?.toISOString() ?? null,
            acceptedByUserId: row.accepted_by_user_id ?? null,
        }
    }

    async create(invitation: Omit<TeamInvitationRecord, 'id' | 'acceptedAt' | 'acceptedByUserId'>): Promise<void> {
        await prisma.teamInvitation.create({
            data: {
                company_id: invitation.companyId,
                email: invitation.email,
                role: invitation.role,
                token: invitation.token,
                invited_by: invitation.invitedBy,
                expires_at: new Date(invitation.expiresAt),
            },
        })
    }

    async findByToken(token: string): Promise<TeamInvitationRecord | null> {
        const row = await prisma.teamInvitation.findUnique({
            where: { token },
        })
        return row ? this.mapRow(row) : null
    }

    async markAccepted(invitationId: string, userId: string): Promise<void> {
        // Conditional update — only claim an invite that hasn't been accepted.
        // Silent no-op if another caller already won the race.
        await prisma.$executeRaw`
            UPDATE public.team_invitations
            SET accepted_at = NOW(), accepted_by_user_id = ${userId}::uuid
            WHERE id = ${invitationId}::uuid
              AND accepted_at IS NULL
        `
    }
}
