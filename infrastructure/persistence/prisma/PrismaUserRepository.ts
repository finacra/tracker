import type { UserRepository } from '@/application/interfaces/UserRepository'
import type { AppUser } from '@/domain/models/AppUser'
import { prisma } from '@/lib/prisma'

export class PrismaUserRepository implements UserRepository {
  private mapCanonicalUser(
    row: { id: string; primary_email: string; full_name: string | null },
    provider: AppUser['legacyAuthProvider'],
    legacyAuthId: string | null
  ): AppUser {
    return {
      id: row.id,
      canonicalId: row.id,
      email: row.primary_email,
      fullName: row.full_name,
      legacyAuthProvider: provider,
      legacyAuthId,
    }
  }

  async getById(userId: string): Promise<AppUser | null> {
    // 1. Try finding by canonical id first (FASTEST for Passport and modern app logic)
    const appUserRow = await prisma.appUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        primary_email: true,
        full_name: true,
      },
    })

    if (appUserRow) {
      return this.mapCanonicalUser(appUserRow, 'supabase', null)
    }

    // 2. Fallback to finding by legacy identity (compatibility)
    const byLegacyIdentity = await this.getByLegacyAuthIdentity('supabase', userId)
    if (byLegacyIdentity) {
      return byLegacyIdentity
    }

    return null
  }

  async findByEmail(email: string): Promise<AppUser | null> {
    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      return null
    }

    const identity = await prisma.authIdentity.findFirst({
      where: {
        provider: 'supabase',
        appUser: {
          primary_email: {
            equals: normalizedEmail,
            mode: 'insensitive',
          },
        },
      },
      select: {
        legacy_auth_id: true,
        provider: true,
        appUser: {
          select: {
            id: true,
            primary_email: true,
            full_name: true,
          },
        },
      },
    })

    if (!identity || !identity.appUser) {
      return null
    }

    return this.mapCanonicalUser(
      identity.appUser,
      identity.provider as AppUser['legacyAuthProvider'],
      identity.legacy_auth_id
    )
  }

  async getByLegacyAuthIdentity(
    provider: AppUser['legacyAuthProvider'],
    legacyAuthId: string
  ): Promise<AppUser | null> {
    const identity = await prisma.authIdentity.findFirst({
      where: {
        provider,
        legacy_auth_id: legacyAuthId,
      },
      select: {
        legacy_auth_id: true,
        provider: true,
        appUser: {
          select: {
            id: true,
            primary_email: true,
            full_name: true,
          },
        },
      },
      orderBy: {
        is_primary: 'desc',
      },
    })

    if (!identity || !identity.appUser) {
      return null
    }

    return this.mapCanonicalUser(
      identity.appUser,
      provider,
      identity.legacy_auth_id ?? legacyAuthId
    )
  }

  async listByIds(userIds: string[]): Promise<AppUser[]> {
    if (userIds.length === 0) return []

    // 1. Find all canonical users
    const appUsers = await prisma.appUser.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        primary_email: true,
        full_name: true,
      },
    })

    const results = appUsers.map(u => this.mapCanonicalUser(u, 'supabase', null))
    const foundCanonicalIds = new Set(results.map(r => r.id))

    // 2. Find missing ones by legacy identity
    const missingIds = userIds.filter(id => !foundCanonicalIds.has(id))
    if (missingIds.length > 0) {
      const legacyIdentities = await prisma.authIdentity.findMany({
        where: {
          provider: 'supabase',
          legacy_auth_id: { in: missingIds }
        },
        include: {
          appUser: true
        }
      })

      for (const ident of legacyIdentities) {
        if (ident.appUser) {
          results.push(this.mapCanonicalUser(
            ident.appUser,
            'supabase',
            ident.legacy_auth_id
          ))
        }
      }
    }

    return results
  }
}
