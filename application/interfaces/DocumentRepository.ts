export interface DocumentTemplateRecord {
  documentName: string
  folderName: string | null
  defaultFrequency: string | null
}

export interface CompanyDocumentRecord {
  id: string
  companyId: string
  documentType: string | null
  folderName: string | null
  filePath: string
  fileName: string | null
  createdAt: string | null
  registrationDate?: string | null
  expiryDate?: string | null
  periodType?: 'one-time' | 'monthly' | 'quarterly' | 'annual' | null
  periodFinancialYear?: string | null
  periodKey?: string | null
  periodStart?: string | null
  periodEnd?: string | null
  requirementId?: string | null
}

export interface NewCompanyDocumentRecord {
  companyId: string
  documentType: string
  filePath: string
  fileName: string
  folderName: string
  registrationDate: string | null
  expiryDate?: string | null
  isPortalRequired?: boolean
  portalEmail?: string | null
  portalPassword?: string | null
  frequency: string
  embedding: number[] | null
  periodType?: 'one-time' | 'monthly' | 'quarterly' | 'annual' | null
  periodFinancialYear?: string | null
  periodKey?: string | null
  periodStart?: string | null
  periodEnd?: string | null
  requirementId?: string | null
}

export interface DocumentRepository {
  getTemplateMappings(): Promise<DocumentTemplateRecord[]>
  createCompanyDocuments(documents: NewCompanyDocumentRecord[]): Promise<CompanyDocumentRecord[]>
  getCompanyDocuments(companyId: string): Promise<CompanyDocumentRecord[]>
  deleteCompanyDocument(documentId: string): Promise<void>
}
