import type { UserRepository } from '@/application/interfaces/UserRepository'
import type { AppUser } from '@/domain/models/AppUser'
import { prisma, cached } from '@/lib/prisma'

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
    //
    // Cached via Prisma Accelerate (60s TTL + 30s SWR). This fires on
    // EVERY server action via requireCurrentUser, plus once per page
    // render via the layout RSC resolver (PR-33). At ~250 ms RTT to
    // ap-south-1 Supabase, caching saves that hit on every request
    // after the first within the TTL window. .cacheStrategy is a no-op
    // when DATABASE_URL points at plain Postgres; the runtime method
    // is added by the $extends in lib/prisma.ts even though the type
    // cast there strips it (hence the `as any`).
    //
    // Auto-invalidation: Accelerate invalidates AppUser cache entries
    // on .update / .create / .delete from the same model, so a profile
    // update doesn't leave stale reads beyond a single roundtrip.
    const appUserRow = await cached(
      prisma.appUser.findUnique({
        where: { id: userId },
        select: {
          id: true,
          primary_email: true,
          full_name: true,
        },
      }),
      { ttl: 60, swr: 30 },
    )

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
    if (!normalizedEmail) return null

    // Look up the canonical app_users row by email directly, regardless
    // of which auth provider owns it. Earlier this was scoped to
    // provider='supabase' only, which hid Passport/Google users from
    // flows like team-invite acceptance — the invite route then tried
    // to create a duplicate row and blew up on the primary_email unique
    // constraint (500). We now always return the matching user and
    // attach whichever identity we can find (passport first, supabase
    // second) so the caller gets consistent legacy-auth metadata.
    const appUser = await prisma.appUser.findFirst({
      where: {
        primary_email: { equals: normalizedEmail, mode: 'insensitive' },
      },
      select: {
        id: true,
        primary_email: true,
        full_name: true,
        authIdentities: {
          select: { provider: true, legacy_auth_id: true, is_primary: true },
          orderBy: [{ is_primary: 'desc' }, { provider: 'asc' }],
        },
      },
    })

    if (!appUser) return null

    const preferred =
      appUser.authIdentities.find(i => i.provider === 'passport') ||
      appUser.authIdentities.find(i => i.provider === 'supabase') ||
      appUser.authIdentities[0] ||
      null

    return this.mapCanonicalUser(
      { id: appUser.id, primary_email: appUser.primary_email, full_name: appUser.full_name ?? null },
      (preferred?.provider as AppUser['legacyAuthProvider']) ?? null,
      preferred?.legacy_auth_id ?? null,
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
