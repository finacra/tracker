import type {
  CompanyDetailsRecord,
  CompanyRecord,
  CompanyRepository,
} from '@/application/interfaces/CompanyRepository'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export class PrismaCompanyRepository implements CompanyRepository {
  async getDetailsById(companyId: string): Promise<CompanyDetailsRecord | null> {
    // Use Prisma.sql with explicit UUID cast
    const row = await prisma.$queryRaw<any[]>(
      Prisma.sql`SELECT id, name, user_id, app_user_id, type, incorporation_date, tax_id, registration_id,
              industry, address, city, state, pin_code, phone_number, email, landline,
              other_info, industry_categories, other_industry_category, ex_directors, country_code
       FROM companies WHERE id = ${companyId}::uuid`
    )

    if (!row || row.length === 0) return null
    const data = row[0]

    return {
      id: data.id,
      name: data.name,
      ownerUserId: data.user_id,
      ownerAppUserId: data.app_user_id || null,
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
    const row = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, user_id: true, app_user_id: true },
    })

    if (!row) return null
    return { 
      id: row.id, 
      name: row.name, 
      ownerUserId: row.user_id,
      ownerAppUserId: row.app_user_id || null
    }
  }

  async listOwnedByUser(userId: string): Promise<CompanyRecord[]> {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT c.id, c.name, c.user_id, c.app_user_id, c.created_at
      FROM companies c
      WHERE c.app_user_id::uuid = ${userId}::uuid
      UNION ALL
      SELECT c.id, c.name, c.user_id, c.app_user_id, c.created_at
      FROM companies c
      WHERE c.user_id::uuid = ${userId}::uuid
      AND NOT EXISTS (SELECT 1 FROM app_users WHERE id::uuid = ${userId}::uuid)
      ORDER BY created_at DESC
    `
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      ownerUserId: r.user_id,
      ownerAppUserId: r.app_user_id || null,
    }))
  }

  async listByIds(companyIds: string[]): Promise<CompanyRecord[]> {
    if (companyIds.length === 0) return []

    const rows = await prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true, user_id: true },
    })

    // Preserve requested order
    const map = new Map(rows.map((r: { id: string; name: string; user_id: string }) => [r.id, r]))
    return companyIds
      .map((id) => map.get(id))
      .filter((r): r is { id: string; name: string; user_id: string } => !!r)
      .map((r) => ({ id: r.id, name: r.name, ownerUserId: r.user_id }))
  }

  async hasAnyAccessibleCompany(userId: string): Promise<boolean> {
    const result = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT 1 FROM companies WHERE app_user_id::uuid = ${userId}::uuid
      UNION ALL
      SELECT 1 FROM companies c
      WHERE c.user_id::uuid = ${userId}::uuid
      AND NOT EXISTS (SELECT 1 FROM app_users WHERE id::uuid = ${userId}::uuid)
      UNION ALL
      SELECT 1 FROM user_roles WHERE app_user_id::uuid = ${userId}::uuid AND company_id IS NOT NULL
      UNION ALL
      SELECT 1 FROM user_roles ur
      INNER JOIN auth_identities ai ON ai.legacy_auth_id::uuid = ur.user_id::uuid
      WHERE ai.app_user_id::uuid = ${userId}::uuid 
      AND ai.provider = 'supabase'
      AND ur.company_id IS NOT NULL
      UNION ALL
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id::uuid = ${userId}::uuid
      AND ur.company_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM app_users WHERE id::uuid = ${userId}::uuid)
      LIMIT 1
    `
    return result.length > 0
  }

  async create(input: import('@/application/interfaces/CompanyRepository').CreateCompanyInput): Promise<CompanyRecord> {
    const company = await prisma.company.create({
      data: {
        user_id: input.userId,
        app_user_id: input.appUserId || null,
        name: input.name,
        type: input.type || null,
        tax_id: input.taxId || null,
        registration_id: input.registrationId || null,
        industry: input.industry || null,
        industries: input.industries || [],
        industry_categories: input.industryCategories || [],
        other_industry_category: input.otherIndustryCategory || null,
        incorporation_date: input.incorporationDate ? new Date(input.incorporationDate) : null,
        address: input.address || null,
        city: input.city || null,
        state: input.state || null,
        pin_code: input.pinCode || null,
        phone_number: input.phoneNumber || null,
        email: input.email || null,
        landline: input.landline || null,
        other_info: input.otherInfo || null,
        stage: input.stage || null,
        confidence_score: input.confidenceScore || null,
        year_type: input.yearType || 'FY',
        country_code: input.countryCode || 'IN',
        region: input.region || null,
        ex_directors: input.exDirectors || [],
      },
      select: { id: true, name: true, user_id: true },
    })

    return {
      id: company.id,
      name: company.name,
      ownerUserId: company.user_id,
    }
  }

  async update(companyId: string, input: import('@/application/interfaces/CompanyRepository').UpdateCompanyInput): Promise<void> {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        name: input.name,
        type: input.type !== undefined ? input.type : undefined,
        tax_id: input.taxId !== undefined ? input.taxId : undefined,
        industries: input.industries || undefined,
        industry_categories: input.industryCategories || undefined,
        other_industry_category: input.otherIndustryCategory !== undefined ? input.otherIndustryCategory : undefined,
        address: input.address !== undefined ? input.address : undefined,
        city: input.city !== undefined ? input.city : undefined,
        state: input.state !== undefined ? input.state : undefined,
        pin_code: input.pinCode !== undefined ? input.pinCode : undefined,
        phone_number: input.phoneNumber !== undefined ? input.phoneNumber : undefined,
        email: input.email !== undefined ? input.email : undefined,
        landline: input.landline !== undefined ? input.landline : undefined,
        other_info: input.otherInfo !== undefined ? input.otherInfo : undefined,
        ex_directors: input.exDirectors || undefined,
      },
    })
  }

  async getCountryCode(companyId: string): Promise<string | null> {
    const row = await prisma.company.findUnique({
      where: { id: companyId },
      select: { country_code: true }
    })
    return row?.country_code ?? null
  }

  async listAll(): Promise<CompanyRecord[]> {
    const rows = await prisma.company.findMany({
      select: { id: true, name: true, user_id: true },
      orderBy: { created_at: 'desc' },
    })

    return rows.map((r: { id: string; name: string; user_id: string }) => ({
      id: r.id,
      name: r.name,
      ownerUserId: r.user_id,
    }))
  }

  // OPTIMIZED: Just get IDs for superadmin (much faster)
  async listAllCompanyIds(): Promise<string[]> {
    const rows = await prisma.company.findMany({
      select: { id: true },
      orderBy: { created_at: 'desc' },
    })
    return rows.map((r: { id: string }) => r.id)
  }

  async listAllWithDetails(): Promise<CompanyDetailsRecord[]> {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, user_id, app_user_id, type, incorporation_date, tax_id, registration_id,
             industry, address, city, state, pin_code, phone_number, email, landline,
             other_info, industry_categories, other_industry_category, ex_directors, country_code,
             created_at
      FROM companies 
      ORDER BY created_at DESC
    `
    return rows.map((data) => ({
      id: data.id,
      name: data.name,
      ownerUserId: data.user_id,
      ownerAppUserId: data.app_user_id || null,
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
      createdAt: data.created_at ? data.created_at.toISOString() : null,
    }))
  }
}
