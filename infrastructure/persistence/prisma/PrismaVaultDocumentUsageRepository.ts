import type { VaultDocumentUsageRepository } from '@/application/interfaces/VaultDocumentUsageRepository'
import { prisma } from '@/lib/prisma'

export class PrismaVaultDocumentUsageRepository implements VaultDocumentUsageRepository {
    async hasDocumentsForTemplateName(documentName: string): Promise<boolean> {
        const count = await prisma.companyDocument.count({
            where: { document_type: documentName },
        })
        return count > 0
    }

    async updateDocumentsFolderByType(documentType: string, folderName: string | null): Promise<void> {
        await prisma.companyDocument.updateMany({
            where: { document_type: documentType },
            data: {
                folder_name: folderName,
            },
        })
    }

    async renameDocumentsByType(oldDocumentType: string, newDocumentType: string): Promise<void> {
        await prisma.companyDocument.updateMany({
            where: { document_type: oldDocumentType },
            data: {
                document_type: newDocumentType,
            },
        })
    }
}
