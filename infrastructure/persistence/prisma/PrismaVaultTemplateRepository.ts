import type { VaultTemplateRecord, VaultTemplateRepository } from '@/application/interfaces/VaultTemplateRepository'
import { prisma } from '@/lib/prisma'

export class PrismaVaultTemplateRepository implements VaultTemplateRepository {
    async getFolderPaths(): Promise<string[]> {
        const rows = await prisma.documentTemplate.findMany({
            where: {
                NOT: { folder_name: null },
            },
            select: { folder_name: true },
        })

        const paths = rows
            .map((row) => row.folder_name)
            .filter((folderName): folderName is string => Boolean(folderName))

        return Array.from(new Set(paths)).sort()
    }

    async getTemplates(folderPath?: string | null): Promise<VaultTemplateRecord[]> {
        const rows = await prisma.documentTemplate.findMany({
            where: folderPath ? { folder_name: folderPath } : {},
            orderBy: { document_name: 'asc' },
        })

        return rows.map((row) => ({
            id: row.id,
            documentName: row.document_name || '',
            folderName: row.folder_name,
            defaultFrequency: row.default_frequency as any || 'one-time',
            category: row.category,
            description: row.description,
            isMandatory: Boolean(row.is_mandatory),
        }))
    }
}
