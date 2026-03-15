import type {
  CreateNotificationInput,
  NotificationQueryOptions,
  NotificationRepository,
} from '@/application/interfaces/NotificationRepository'
import type { AppNotification } from '@/domain/models/Notification'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export class PrismaNotificationRepository implements NotificationRepository {
  async getForUser(
    userId: string,
    options: NotificationQueryOptions = {}
  ): Promise<AppNotification[]> {
    // Query using UNION to check both app_user_id (Passport) and user_id (legacy Supabase)
    const unreadFilter = options.unreadOnly ? 'AND cn.is_read = false' : ''
    const limitClause = options.limit ? `LIMIT ${options.limit}` : ''
    
    const rows = await prisma.$queryRaw<any[]>`
      SELECT cn.*
      FROM company_notifications cn
      WHERE cn.app_user_id = ${userId}::uuid
      ${Prisma.raw(unreadFilter)}
      UNION ALL
      SELECT cn.*
      FROM company_notifications cn
      INNER JOIN auth_identities ai ON ai.legacy_auth_id = cn.user_id::text
      WHERE ai.app_user_id = ${userId}::uuid AND ai.provider = 'supabase'
      AND cn.app_user_id IS NULL
      ${Prisma.raw(unreadFilter)}
      UNION ALL
      SELECT cn.*
      FROM company_notifications cn
      WHERE cn.user_id = ${userId}::uuid
      AND cn.app_user_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM app_users WHERE id = ${userId}::uuid)
      ${Prisma.raw(unreadFilter)}
      ORDER BY created_at DESC
      ${Prisma.raw(limitClause)}
    `

    return rows.map((row) => this.mapRow(row))
  }

  async countUnreadForUser(userId: string): Promise<number> {
    // Count using UNION to check both app_user_id (Passport) and user_id (legacy Supabase)
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint as count
      FROM (
        SELECT cn.id
        FROM company_notifications cn
        WHERE cn.app_user_id = ${userId}::uuid AND cn.is_read = false
        UNION ALL
        SELECT cn.id
        FROM company_notifications cn
        INNER JOIN auth_identities ai ON ai.legacy_auth_id = cn.user_id::text
        WHERE ai.app_user_id = ${userId}::uuid AND ai.provider = 'supabase' AND cn.is_read = false
        AND cn.app_user_id IS NULL
        UNION ALL
        SELECT cn.id
        FROM company_notifications cn
        WHERE cn.user_id = ${userId}::uuid
        AND cn.app_user_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM app_users WHERE id = ${userId}::uuid)
        AND cn.is_read = false
      ) combined
    `
    return Number(result[0]?.count || 0)
  }

  async markReadForUser(userId: string, notificationIds: string[]): Promise<void> {
    // Update using UNION to check both app_user_id (Passport) and user_id (legacy Supabase)
    await prisma.$executeRaw`
      UPDATE company_notifications cn
      SET is_read = true, read_at = NOW()
      WHERE cn.id = ANY(${notificationIds}::uuid[])
      AND (
        cn.app_user_id = ${userId}::uuid
        OR (
          cn.user_id IN (
            SELECT legacy_auth_id::uuid FROM auth_identities 
            WHERE app_user_id = ${userId}::uuid AND provider = 'supabase'
          )
        )
        OR (
          cn.user_id = ${userId}::uuid
          AND NOT EXISTS (SELECT 1 FROM app_users WHERE id = ${userId}::uuid)
        )
      )
    `
  }

  async markAllReadForUser(userId: string): Promise<void> {
    // Update using UNION to check both app_user_id (Passport) and user_id (legacy Supabase)
    await prisma.$executeRaw`
      UPDATE company_notifications cn
      SET is_read = true, read_at = NOW()
      WHERE cn.is_read = false
      AND (
        cn.app_user_id = ${userId}::uuid
        OR (
          cn.user_id IN (
            SELECT legacy_auth_id::uuid FROM auth_identities 
            WHERE app_user_id = ${userId}::uuid AND provider = 'supabase'
          )
        )
        OR (
          cn.user_id = ${userId}::uuid
          AND NOT EXISTS (SELECT 1 FROM app_users WHERE id = ${userId}::uuid)
        )
      )
    `
  }

  async createMany(notifications: CreateNotificationInput[]): Promise<void> {
    if (notifications.length === 0) return

    await prisma.companyNotification.createMany({
      data: notifications.map((n) => ({
        company_id: n.company_id,
        user_id: n.user_id,
        app_user_id: n.app_user_id || null,
        type: n.type,
        title: n.title,
        message: n.message,
        requirement_id: n.requirement_id,
        is_read: n.is_read,
        metadata: n.metadata
          ? (n.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      })),
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapRow(row: Record<string, any>): AppNotification {
    return {
      id: row.id,
      user_id: row.user_id,
      company_id: row.company_id ?? null,
      type: row.type,
      title: row.title,
      message: row.message,
      requirement_id: row.requirement_id ?? null,
      document_id: row.document_id ?? null,
      is_read: row.is_read ?? false,
      read_at: row.read_at ? row.read_at.toISOString() : null,
      created_at: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
      metadata: row.metadata as Record<string, unknown> | null,
    }
  }
}
