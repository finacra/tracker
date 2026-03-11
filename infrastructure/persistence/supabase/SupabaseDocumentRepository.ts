import type {
  CompanyDocumentRecord,
  DocumentRepository,
  DocumentTemplateRecord,
  NewCompanyDocumentRecord,
} from '@/application/interfaces/DocumentRepository'
import { createAdminClient } from '@/utils/supabase/admin'

type TemplateRow = { document_name: string; folder_name: string | null; default_frequency: string | null }
type DocumentRow = {
  id: string
  company_id: string
  document_type: string | null
  folder_name: string | null
  file_path: string
  file_name: string | null
  created_at: string | null
  registration_date: string | null
  expiry_date: string | null
  period_type: 'one-time' | 'monthly' | 'quarterly' | 'annual' | null
  period_financial_year: string | null
  period_key: string | null
  period_start: string | null
  period_end: string | null
  requirement_id: string | null
}

export class SupabaseDocumentRepository implements DocumentRepository {
  async getTemplateMappings(): Promise<DocumentTemplateRecord[]> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('document_templates_internal')
      .select('document_name, folder_name, default_frequency')
      .order('folder_name', { ascending: true })
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    return (data ?? []).map((row: TemplateRow) => ({
      documentName: row.document_name,
      folderName: row.folder_name,
      defaultFrequency: row.default_frequency,
    }))
  }

  async createCompanyDocuments(documents: NewCompanyDocumentRecord[]): Promise<CompanyDocumentRecord[]> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase.from('company_documents_internal').insert(
      documents.map(doc => ({
        company_id: doc.companyId,
        document_type: doc.documentType,
        file_path: doc.filePath,
        file_name: doc.fileName,
        folder_name: doc.folderName,
        registration_date: doc.registrationDate,
        expiry_date: doc.expiryDate ?? null,
        is_portal_required: doc.isPortalRequired ?? false,
        portal_email: doc.portalEmail ?? null,
        portal_password: doc.portalPassword ?? null,
        frequency: doc.frequency,
        embedding: doc.embedding,
        period_type: doc.periodType ?? null,
        period_financial_year: doc.periodFinancialYear ?? null,
        period_key: doc.periodKey ?? null,
        period_start: doc.periodStart ?? null,
        period_end: doc.periodEnd ?? null,
        requirement_id: doc.requirementId ?? null,
      }))
    ).select('id, company_id, document_type, folder_name, file_path, file_name, created_at')
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    return (data ?? []).map((row: DocumentRow) => this.mapDocument(row))
  }

  async getCompanyDocuments(companyId: string): Promise<CompanyDocumentRecord[]> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('company_documents_internal')
      .select('id, company_id, document_type, folder_name, file_path, file_name, created_at, registration_date, expiry_date, period_type, period_financial_year, period_key, period_start, period_end, requirement_id')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    return (data ?? []).map((row: DocumentRow) => this.mapDocument(row))
  }

  async deleteCompanyDocument(documentId: string): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase.from('company_documents_internal').delete().eq('id', documentId)
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
  }

  private mapDocument(row: DocumentRow): CompanyDocumentRecord {
    return {
      id: row.id,
      companyId: row.company_id,
      documentType: row.document_type,
      folderName: row.folder_name,
      filePath: row.file_path,
      fileName: row.file_name,
      createdAt: row.created_at,
      registrationDate: row.registration_date || null,
      expiryDate: row.expiry_date || null,
      periodType: row.period_type || null,
      periodFinancialYear: row.period_financial_year || null,
      periodKey: row.period_key || null,
      periodStart: row.period_start || null,
      periodEnd: row.period_end || null,
      requirementId: row.requirement_id || null,
    }
  }
}
