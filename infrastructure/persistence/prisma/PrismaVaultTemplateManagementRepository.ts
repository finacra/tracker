import type {
    VaultTemplateDetails,
    VaultTemplateManagementRecord,
    VaultTemplateManagementRepository,
    VaultTemplateMutationInput,
} from '@/application/interfaces/VaultTemplateManagementRepository'
import { prisma } from '@/lib/prisma'

export class PrismaVaultTemplateManagementRepository implements VaultTemplateManagementRepository {
    private mapRow(row: any): VaultTemplateManagementRecord {
        return {
            id: row.id,
            documentName: row.document_name || '',
            folderName: row.folder_name,
            defaultFrequency: row.default_frequency as any || 'one-time',
            category: row.category,
            description: row.description,
            isMandatory: Boolean(row.is_mandatory),
        }
    }

    async existsByName(documentName: string, excludeId?: string): Promise<boolean> {
        const count = await prisma.documentTemplate.count({
            where: {
                document_name: documentName,
                NOT: excludeId ? { id: excludeId } : undefined,
            },
        })
        return count > 0
    }

    async getById(id: string): Promise<VaultTemplateDetails | null> {
        // Cached via Prisma Accelerate (5 min TTL + 2 min SWR). Template
        // metadata is admin-controlled, static across user sessions, and
        // queried on every document-requirement breadcrumb render.
        // Auto-invalidates when documentTemplate rows are written via
        // this same repository's create/update/delete methods.
        const row = await (prisma.documentTemplate.findUnique({
            where: { id },
            select: {
                id: true,
                document_name: true,
                folder_name: true,
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any).cacheStrategy({ ttl: 300, swr: 120 })

        if (!row) return null

        return {
            id: row.id,
            documentName: row.document_name || '',
            folderName: row.folder_name,
        }
    }

    async create(input: VaultTemplateMutationInput): Promise<VaultTemplateManagementRecord> {
        const row = await prisma.documentTemplate.create({
            data: {
                document_name: input.documentName,
                folder_name: input.folderName,
                default_frequency: input.defaultFrequency,
                category: input.category,
                description: input.description,
                is_mandatory: input.isMandatory,
            },
        })
        return this.mapRow(row)
    }

    async update(id: string, input: VaultTemplateMutationInput): Promise<VaultTemplateManagementRecord> {
        const row = await prisma.documentTemplate.update({
            where: { id },
            data: {
                document_name: input.documentName,
                folder_name: input.folderName,
                default_frequency: input.defaultFrequency,
                category: input.category,
                description: input.description,
                is_mandatory: input.isMandatory,
                updated_at: new Date(),
            },
        })
        return this.mapRow(row)
    }

    async delete(id: string): Promise<void> {
        await prisma.documentTemplate.delete({
            where: { id },
        })
    }
}
