import type {
    CompanyMembership,
    CompanyMembershipRepository,
} from '@/application/interfaces/CompanyMembershipRepository'
import type { AppRole } from '@/domain/types/Role'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export class PrismaCompanyMembershipRepository implements CompanyMembershipRepository {
    private mapRow(row: any): CompanyMembership & { appUserId?: string | null } {
        return {
            id: row.id,
            userId: row.user_id || row.app_user_id || '', // For Passport users, app_user_id is the userId
            companyId: row.company_id,
            role: row.role as AppRole,
            createdAt: row.created_at.toISOString(),
            updatedAt: row.updated_at.toISOString(),
            appUserId: row.app_user_id, // Include app_user_id for Passport users
        }
    }

    async getAdminUserIds(companyId: string): Promise<string[]> {
        // Get admin user IDs - for Passport users, use app_user_id; for legacy, use user_id
        const rows = await prisma.userRole.findMany({
            where: {
                company_id: companyId,
                role: { in: ['admin', 'superadmin'] },
            },
            select: { 
                user_id: true,
                app_user_id: true
            }
        })
        // Return app_user_id for Passport users, user_id for legacy users
        return rows.map((row) => row.app_user_id || row.user_id).filter((id): id is string => id !== null)
    }

    async getRoles(companyId?: string | null): Promise<(CompanyMembership & { appUserId?: string | null })[]> {
        const rows = await prisma.userRole.findMany({
            where: companyId ? { company_id: companyId } : {},
            orderBy: { created_at: 'desc' },
            select: {
                id: true,
                user_id: true,
                app_user_id: true,
                company_id: true,
                role: true,
                created_at: true,
                updated_at: true,
            },
        })
        return rows.map((row) => this.mapRow(row))
    }

    async getRolesByUserId(userId: string): Promise<CompanyMembership[]> {
        // Optimized: Single query using UNION to check both Passport and Supabase users
        // This avoids multiple sequential queries
        const rows = await prisma.$queryRaw<any[]>`
            SELECT ur.*
            FROM user_roles ur
            WHERE ur.app_user_id = ${userId}::uuid
            UNION ALL
            SELECT ur.*
            FROM user_roles ur
            INNER JOIN auth_identities ai ON ai.legacy_auth_id = ur.user_id::text
            WHERE ai.app_user_id = ${userId}::uuid AND ai.provider = 'supabase'
            UNION ALL
            SELECT ur.*
            FROM user_roles ur
            WHERE ur.user_id = ${userId}::uuid
            AND NOT EXISTS (SELECT 1 FROM app_users WHERE id = ${userId}::uuid)
            ORDER BY created_at DESC
        `
        return rows.map((row) => this.mapRow(row))
    }

    async getCompanyOwnerId(companyId: string): Promise<string | null> {
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { user_id: true }
        })
        return company?.user_id ?? null
    }

    async findRole(userId: string, companyId: string): Promise<CompanyMembership | null> {
        // Optimized: Single query using UNION to check both Passport and Supabase users
        // Matches data-room acc_ids logic: check app_user_id, user_id, and auth_identities
        const rows = await prisma.$queryRaw<any[]>`
            SELECT ur.*
            FROM user_roles ur
            WHERE ur.company_id = ${companyId}::uuid
            AND (ur.app_user_id = ${userId}::uuid OR ur.user_id = ${userId}::uuid)
            UNION ALL
            SELECT ur.*
            FROM user_roles ur
            INNER JOIN auth_identities ai ON ai.legacy_auth_id = ur.user_id::text
            WHERE ur.company_id = ${companyId}::uuid
            AND ai.app_user_id = ${userId}::uuid AND ai.provider = 'supabase'
            LIMIT 1
        `
        return rows.length > 0 ? this.mapRow(rows[0]) : null
    }

    async addRole(userId: string, companyId: string, role: Exclude<AppRole, 'superadmin'>, appUserId?: string | null): Promise<void> {
        // For Passport users, use app_user_id and set user_id to NULL
        // For legacy Supabase users, use user_id and set app_user_id to NULL
        const isPassportUser = appUserId !== null && appUserId !== undefined
        
        await prisma.userRole.create({
            data: {
                user_id: isPassportUser ? null : userId,
                app_user_id: isPassportUser ? appUserId : null,
                company_id: companyId,
                role: role,
            },
        })
    }

    async upsertRole(userId: string, companyId: string, role: Exclude<AppRole, 'superadmin'>, appUserId?: string | null): Promise<void> {
        // For Passport users, use app_user_id and set user_id to NULL
        // For legacy Supabase users, use user_id and set app_user_id to NULL
        const isPassportUser = appUserId !== null && appUserId !== undefined
        
        // Check if role exists by app_user_id (Passport) or user_id (legacy)
        const existing = await prisma.userRole.findFirst({
            where: isPassportUser
                ? {
                    app_user_id: appUserId,
                    company_id: companyId,
                }
                : {
                    user_id: userId,
                    company_id: companyId,
                },
            select: { id: true }
        })

        if (existing) {
            await prisma.userRole.update({
                where: { id: existing.id },
                data: {
                    role: role,
                    app_user_id: isPassportUser ? appUserId : undefined,
                    user_id: isPassportUser ? undefined : userId,
                    updated_at: new Date(),
                },
            })
        } else {
            await prisma.userRole.create({
                data: {
                    user_id: isPassportUser ? null : userId,
                    app_user_id: isPassportUser ? appUserId : null,
                    company_id: companyId,
                    role: role,
                },
            })
        }
    }

    async removeRole(roleId: string, companyId: string): Promise<void> {
        await prisma.userRole.delete({
            where: {
                id: roleId,
                company_id: companyId,
            },
        })
    }

    async updateRole(roleId: string, companyId: string, role: Exclude<AppRole, 'superadmin'>): Promise<void> {
        await prisma.userRole.update({
            where: {
                id: roleId,
                company_id: companyId,
            },
            data: {
                role: role,
                updated_at: new Date(),
            },
        })
    }
    
    async isSuperadmin(userId: string): Promise<boolean> {
        const rows = await prisma.$queryRaw<any[]>`
            SELECT 1 FROM user_roles
            WHERE app_user_id = ${userId}::uuid
            AND company_id IS NULL
            AND role = 'superadmin'
            LIMIT 1
        `
        if (rows.length > 0) return true

        const rowsLegacy = await prisma.$queryRaw<any[]>`
            SELECT 1 FROM user_roles ur
            INNER JOIN auth_identities ai ON ai.legacy_auth_id = ur.user_id::text
            WHERE ai.app_user_id = ${userId}::uuid
            AND ai.provider = 'supabase'
            AND ur.company_id IS NULL
            AND ur.role = 'superadmin'
            LIMIT 1
        `
        return rowsLegacy.length > 0
    }
}
