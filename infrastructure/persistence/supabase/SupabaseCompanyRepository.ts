import type {
  CompanyDetailsRecord,
  CompanyRecord,
  CompanyRepository,
} from '@/application/interfaces/CompanyRepository'
import { createAdminClient } from '@/utils/supabase/admin'

export class SupabaseCompanyRepository implements CompanyRepository {
  async getDetailsById(companyId: string): Promise<CompanyDetailsRecord | null> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('companies')
      .select(
        'id, name, user_id, type, incorporation_date, tax_id, registration_id, industry, address, city, state, pin_code, phone_number, email, landline, other_info, industry_categories, other_industry_category, ex_directors, country_code'
      )
      .eq('id', companyId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return null

    return {
      id: data.id,
      name: data.name,
      ownerUserId: data.user_id,
      type: data.type ?? null,
      incorporationDate: data.incorporation_date ?? null,
      taxId: data.tax_id ?? null,
      registrationId: data.registration_id ?? null,
      industry: data.industry ?? null,
      address: data.address ?? null,
      city: data.city ?? null,
      state: data.state ?? null,
      pinCode: data.pin_code ?? null,
      phoneNumber: data.phone_number ?? null,
      email: data.email ?? null,
      landline: data.landline ?? null,
      otherInfo: data.other_info ?? null,
      industryCategories: Array.isArray(data.industry_categories) ? data.industry_categories : [],
      otherIndustryCategory: data.other_industry_category ?? null,
      exDirectors: Array.isArray(data.ex_directors) ? data.ex_directors : [],
      countryCode: data.country_code ?? null,
    }
  }

  async getById(companyId: string): Promise<CompanyRecord | null> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('companies')
      .select('id, name, user_id')
      .eq('id', companyId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return null

    return {
      id: data.id,
      name: data.name,
      ownerUserId: data.user_id,
    }
  }

  async listOwnedByUser(userId: string): Promise<CompanyRecord[]> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('companies')
      .select('id, name, user_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    return (data ?? []).map((company: { id: string; name: string; user_id: string }) => ({
      id: company.id,
      name: company.name,
      ownerUserId: company.user_id,
    }))
  }

  async listByIds(companyIds: string[]): Promise<CompanyRecord[]> {
    if (companyIds.length === 0) {
      return []
    }

    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('companies')
      .select('id, name, user_id')
      .in('id', companyIds)

    if (error) throw new Error(error.message)

    const companiesById = new Map<string, CompanyRecord>(
      (data ?? []).map((company: { id: string; name: string; user_id: string }) => [
        company.id,
        {
          id: company.id,
          name: company.name,
          ownerUserId: company.user_id,
        },
      ])
    )

    const orderedCompanies: Array<CompanyRecord | undefined> = companyIds
      .map((companyId: string) => companiesById.get(companyId))

    return orderedCompanies.filter((company): company is CompanyRecord => Boolean(company))
  }

  async hasAnyAccessibleCompany(userId: string): Promise<boolean> {
    const adminSupabase: any = createAdminClient()

    const [{ data: ownedCompanies }, { data: userRoles }] = await Promise.all([
      adminSupabase
        .from('companies')
        .select('id')
        .eq('user_id', userId)
        .limit(1),
      adminSupabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', userId)
        .not('company_id', 'is', null)
        .limit(1),
    ])

    return (ownedCompanies?.length ?? 0) > 0 || (userRoles?.length ?? 0) > 0
  }

  async create(input: import('@/application/interfaces/CompanyRepository').CreateCompanyInput): Promise<CompanyRecord> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('companies')
      .insert({
        user_id: input.userId,
        app_user_id: input.appUserId || null,
        name: input.name,
        type: input.type,
        tax_id: input.taxId,
        registration_id: input.registrationId,
        industry: input.industry,
        industries: input.industries,
        industry_categories: input.industryCategories,
        other_industry_category: input.otherIndustryCategory,
        incorporation_date: input.incorporationDate,
        address: input.address,
        city: input.city,
        state: input.state,
        pin_code: input.pinCode,
        phone_number: input.phoneNumber,
        email: input.email,
        landline: input.landline,
        other_info: input.otherInfo,
        stage: input.stage,
        confidence_score: input.confidenceScore,
        year_type: input.yearType,
        country_code: input.countryCode,
        region: input.region,
        ex_directors: input.exDirectors,
      })
      .select('id, name, user_id')
      .single()

    if (error) throw new Error(error.message)

    return {
      id: data.id,
      name: data.name,
      ownerUserId: data.user_id,
    }
  }

  async update(companyId: string, input: import('@/application/interfaces/CompanyRepository').UpdateCompanyInput): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('companies')
      .update({
        name: input.name,
        type: input.type,
        tax_id: input.taxId,
        industries: input.industries,
        industry_categories: input.industryCategories,
        other_industry_category: input.otherIndustryCategory,
        address: input.address,
        city: input.city,
        state: input.state,
        pin_code: input.pinCode,
        phone_number: input.phoneNumber,
        email: input.email,
        landline: input.landline,
        other_info: input.otherInfo,
        ex_directors: input.exDirectors,
      })
      .eq('id', companyId)

    if (error) throw new Error(error.message)
  }

  async getCountryCode(companyId: string): Promise<string | null> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('companies')
      .select('country_code')
      .eq('id', companyId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    return data?.country_code ?? null
  }

  async listAll(): Promise<CompanyRecord[]> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('companies')
      .select('id, name, user_id')
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    return (data ?? []).map((company: { id: string; name: string; user_id: string }) => ({
      id: company.id,
      name: company.name,
      ownerUserId: company.user_id,
    }))
  }
}
