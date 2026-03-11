import type { AppRole } from '@/domain/types/Role'

export interface TeamInvitationRecord {
  id: string
  companyId: string
  email: string
  role: Exclude<AppRole, 'superadmin'>
  token: string
  invitedBy: string
  expiresAt: string
  acceptedAt: string | null
  acceptedByUserId: string | null
}

export interface TeamInvitationRepository {
  create(invitation: Omit<TeamInvitationRecord, 'id' | 'acceptedAt' | 'acceptedByUserId'>): Promise<void>
  findByToken(token: string): Promise<TeamInvitationRecord | null>
  markAccepted(invitationId: string, userId: string): Promise<void>
}
