import type {
    CompanyMembership,
    CompanyMembershipRepository,
} from '@/application/interfaces/CompanyMembershipRepository'
import type { AppRole } from '@/domain/types/Role'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export class PrismaCompanyMembershipRepository implements CompanyMembershipRepository {
    private mapRow(row: any): CompanyMembership {
        return {
            id: row.id,
            userId: row.user_id,
            companyId: row.company_id,
            role: row.role as AppRole,
            createdAt: row.created_at.toISOString(),
            updatedAt: row.updated_at.toISOString(),
        }
    }

    async getAdminUserIds(companyId: string): Promise<string[]> {
        const rows = await prisma.userRole.findMany({
            where: {
                company_id: companyId,
                role: { in: ['admin', 'superadmin'] },
            },
            select: { user_id: true }
        })
        return rows.map((row) => row.user_id)
    }

    async getRoles(companyId?: string | null): Promise<CompanyMembership[]> {
        const rows = await prisma.userRole.findMany({
            where: companyId ? { company_id: companyId } : {},
            orderBy: { created_at: 'desc' },
        })
        return rows.map((row) => this.mapRow(row))
    }

    async getRolesByUserId(userId: string): Promise<CompanyMembership[]> {
        // Optimized: Single query using UNION to check both Passport and Supabase users
        // This avoids multiple sequential queries
        const rows = await prisma.$queryRaw<any[]>`
            SELECT * FROM (
                SELECT ur.*
                FROM user_roles ur
                WHERE ur.app_user_id::uuid = ${userId}::uuid
                UNION
                SELECT ur.*
                FROM user_roles ur
                INNER JOIN auth_identities ai ON ai.legacy_auth_id::uuid = ur.user_id::uuid
                WHERE ai.app_user_id::uuid = ${userId}::uuid AND ai.provider = 'supabase'
                UNION
                SELECT ur.*
                FROM user_roles ur
                WHERE ur.user_id::uuid = ${userId}::uuid
                AND NOT EXISTS (SELECT 1 FROM app_users WHERE id::uuid = ${userId}::uuid)
            ) AS combined
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
        // This avoids multiple sequential queries
        const rows = await prisma.$queryRaw<any[]>`
            SELECT * FROM (
                SELECT ur.*
                FROM user_roles ur
                WHERE ur.company_id::uuid = ${companyId}::uuid
                AND ur.app_user_id::uuid = ${userId}::uuid
                UNION
                SELECT ur.*
                FROM user_roles ur
                INNER JOIN auth_identities ai ON ai.legacy_auth_id::uuid = ur.user_id::uuid
                WHERE ur.company_id::uuid = ${companyId}::uuid
                AND ai.app_user_id::uuid = ${userId}::uuid AND ai.provider = 'supabase'
                UNION
                SELECT ur.*
                FROM user_roles ur
                WHERE ur.company_id::uuid = ${companyId}::uuid
                AND ur.user_id::uuid = ${userId}::uuid
                AND NOT EXISTS (SELECT 1 FROM app_users WHERE id::uuid = ${userId}::uuid)
            ) AS combined
            LIMIT 1
        `
        return rows.length > 0 ? this.mapRow(rows[0]) : null
    }

    async addRole(userId: string, companyId: string, role: Exclude<AppRole, 'superadmin'>, appUserId?: string | null): Promise<void> {
        await prisma.userRole.create({
            data: {
                user_id: userId,
                app_user_id: appUserId || null,
                company_id: companyId,
                role: role,
            },
        })
    }

    async upsertRole(userId: string, companyId: string, role: Exclude<AppRole, 'superadmin'>, appUserId?: string | null): Promise<void> {
        const existing = await prisma.userRole.findFirst({
            where: {
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
                    app_user_id: appUserId || undefined,
                    updated_at: new Date(),
                },
            })
        } else {
            await prisma.userRole.create({
                data: {
                    user_id: userId,
                    app_user_id: appUserId || null,
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
}
