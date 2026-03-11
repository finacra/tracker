import type {
  TeamInvitationRecord,
  TeamInvitationRepository,
} from '@/application/interfaces/TeamInvitationRepository'
import { createAdminClient } from '@/utils/supabase/admin'

type InvitationRow = {
  id: string
  company_id: string
  email: string
  role: TeamInvitationRecord['role']
  token: string
  invited_by: string
  expires_at: string
  accepted_at: string | null
  accepted_by_user_id: string | null
}

export class SupabaseTeamInvitationRepository implements TeamInvitationRepository {
  private mapRow(row: InvitationRow): TeamInvitationRecord {
    return {
      id: row.id,
      companyId: row.company_id,
      email: row.email,
      role: row.role,
      token: row.token,
      invitedBy: row.invited_by,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      acceptedByUserId: row.accepted_by_user_id,
    }
  }

  async create(invitation: Omit<TeamInvitationRecord, 'id' | 'acceptedAt' | 'acceptedByUserId'>): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase.from('team_invitations').insert({
      company_id: invitation.companyId,
      email: invitation.email,
      role: invitation.role,
      token: invitation.token,
      invited_by: invitation.invitedBy,
      expires_at: invitation.expiresAt,
    })
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
  }

  async findByToken(token: string): Promise<TeamInvitationRecord | null> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('team_invitations')
      .select('*')
      .eq('token', token)
      .maybeSingle()
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    return data ? this.mapRow(data as InvitationRow) : null
  }

  async markAccepted(invitationId: string, userId: string): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('team_invitations')
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by_user_id: userId,
      })
      .eq('id', invitationId)
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
  }
}
