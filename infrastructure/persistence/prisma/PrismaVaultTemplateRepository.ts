import type { VaultTemplateRecord, VaultTemplateRepository } from '@/application/interfaces/VaultTemplateRepository'
import { prisma } from '@/lib/prisma'

export class PrismaVaultTemplateRepository implements VaultTemplateRepository {
    async getFolderPaths(): Promise<string[]> {
        // Cached via Prisma Accelerate (5 min TTL + 2 min SWR). The
        // documentTemplate catalog is admin-controlled and effectively
        // static between maintenance windows, but this query fires on
        // every data-room page load to populate the vault sidebar.
        // Auto-invalidates when documentTemplate rows are written via
        // the management repository.
        const rows = await (prisma.documentTemplate.findMany({
            where: {
                NOT: { folder_name: null },
            },
            select: { folder_name: true },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any).cacheStrategy({ ttl: 300, swr: 120 })

        const paths = rows
            .map((row: { folder_name: string | null }) => row.folder_name)
            .filter((folderName: string | null): folderName is string => Boolean(folderName))

        return Array.from(new Set<string>(paths)).sort()
    }

    async getTemplates(folderPath?: string | null): Promise<VaultTemplateRecord[]> {
        // Same justification as getFolderPaths above — static catalog,
        // fires on every page load, 5 min cache.
        const rows = await (prisma.documentTemplate.findMany({
            where: folderPath ? { folder_name: folderPath } : {},
            orderBy: { document_name: 'asc' },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any).cacheStrategy({ ttl: 300, swr: 120 })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return rows.map((row: any) => ({
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
