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
    const rows = await prisma.companyNotification.findMany({
      where: {
        user_id: userId,
        ...(options.unreadOnly ? { is_read: false } : {}),
      },
      orderBy: { created_at: 'desc' },
      ...(options.limit ? { take: options.limit } : {}),
    })

    return rows.map((row) => this.mapRow(row))
  }

  async countUnreadForUser(userId: string): Promise<number> {
    return prisma.companyNotification.count({
      where: {
        user_id: userId,
        is_read: false,
      },
    })
  }

  async markReadForUser(userId: string, notificationIds: string[]): Promise<void> {
    await prisma.companyNotification.updateMany({
      where: {
        user_id: userId,
        id: { in: notificationIds },
      },
      data: {
        is_read: true,
        read_at: new Date(),
      },
    })
  }

  async markAllReadForUser(userId: string): Promise<void> {
    await prisma.companyNotification.updateMany({
      where: {
        user_id: userId,
        is_read: false,
      },
      data: {
        is_read: true,
        read_at: new Date(),
      },
    })
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
