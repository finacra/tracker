import type {
    CompanyDocumentRecord,
    DocumentRepository,
    DocumentTemplateRecord,
    NewCompanyDocumentRecord,
} from '@/application/interfaces/DocumentRepository'
import { prisma } from '@/lib/prisma'

export class PrismaDocumentRepository implements DocumentRepository {
    async getTemplateMappings(): Promise<DocumentTemplateRecord[]> {
        const rows = await prisma.documentTemplate.findMany({
            select: {
                document_name: true,
                folder_name: true,
                default_frequency: true,
            },
        })

        return rows.map((row) => ({
            documentName: row.document_name || '',
            folderName: row.folder_name,
            defaultFrequency: row.default_frequency,
        }))
    }

    async createCompanyDocuments(documents: NewCompanyDocumentRecord[]): Promise<CompanyDocumentRecord[]> {
        const created = await Promise.all(
            documents.map(async (doc) => {
                const row = await prisma.companyDocument.create({
                    data: {
                        company_id: doc.companyId,
                        document_type: doc.documentType,
                        folder_name: doc.folderName,
                        file_path: doc.filePath,
                        file_name: doc.fileName,
                        registration_date: doc.registrationDate ? new Date(doc.registrationDate) : null,
                        expiry_date: doc.expiryDate ? new Date(doc.expiryDate) : null,
                        is_portal_required: doc.isPortalRequired,
                        portal_email: doc.portalEmail,
                        portal_password: doc.portalPassword,
                        frequency: doc.frequency,
                        period_type: doc.periodType,
                        period_financial_year: doc.periodFinancialYear,
                        period_key: doc.periodKey,
                        period_start: doc.periodStart ? new Date(doc.periodStart) : null,
                        period_end: doc.periodEnd ? new Date(doc.periodEnd) : null,
                        requirement_id: doc.requirementId,
                    },
                })
                return {
                    id: row.id,
                    companyId: row.company_id,
                    documentType: row.document_type,
                    folderName: row.folder_name,
                    filePath: row.file_path,
                    fileName: row.file_name,
                    createdAt: row.created_at?.toISOString() ?? null,
                }
            })
        )
        return created
    }

    async getCompanyDocuments(companyId: string): Promise<CompanyDocumentRecord[]> {
        try {
            const rows = await prisma.companyDocument.findMany({
                where: { company_id: companyId },
                orderBy: { created_at: 'desc' },
            })

            console.log(`[PrismaDocumentRepository] Found ${rows.length} documents for company ${companyId}`)

            return rows.map((row) => ({
                id: row.id,
                companyId: row.company_id,
                documentType: row.document_type,
                folderName: row.folder_name,
                filePath: row.file_path,
                fileName: row.file_name,
                createdAt: row.created_at?.toISOString() ?? null,
                registrationDate: row.registration_date ? new Date(row.registration_date).toISOString() : null,
                expiryDate: row.expiry_date ? new Date(row.expiry_date).toISOString() : null,
                periodType: (row.period_type as 'one-time' | 'monthly' | 'quarterly' | 'annual' | null) ?? null,
                periodFinancialYear: row.period_financial_year ?? null,
                periodKey: row.period_key ?? null,
                periodStart: row.period_start ? new Date(row.period_start).toISOString() : null,
                periodEnd: row.period_end ? new Date(row.period_end).toISOString() : null,
                requirementId: row.requirement_id ?? null,
            }))
        } catch (error) {
            console.error('[PrismaDocumentRepository] Error fetching documents:', error)
            throw error
        }
    }

    async deleteCompanyDocument(documentId: string): Promise<void> {
        await prisma.companyDocument.delete({
            where: { id: documentId },
        })
    }
}
