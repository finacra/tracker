export interface CompanyRecord {
  id: string
  name: string
  ownerUserId: string
  ownerAppUserId?: string | null
}

export interface CompanyDetailsRecord extends CompanyRecord {
  type: string | null
  incorporationDate: string | null
  taxId: string | null
  registrationId: string | null
  industry: string | null
  address: string | null
  city: string | null
  state: string | null
  pinCode: string | null
  phoneNumber: string | null
  email: string | null
  landline: string | null
  otherInfo: string | null
  industryCategories: string[]
  otherIndustryCategory: string | null
  exDirectors: string[]
  countryCode: string | null
}

export interface CreateCompanyInput {
  userId: string
  appUserId?: string | null
  name: string
  type?: string | null
  taxId?: string | null
  registrationId?: string | null
  industry?: string | null
  industries?: string[] | null
  industryCategories?: string[] | null
  otherIndustryCategory?: string | null
  incorporationDate?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  pinCode?: string | null
  phoneNumber?: string | null
  email?: string | null
  landline?: string | null
  otherInfo?: string | null
  stage?: string | null
  confidenceScore?: string | null
  yearType?: string | null
  countryCode?: string | null
  region?: string | null
  exDirectors?: string[] | null
}

export interface UpdateCompanyInput {
  name?: string
  type?: string | null
  taxId?: string | null
  industries?: string[] | null
  industryCategories?: string[] | null
  otherIndustryCategory?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  pinCode?: string | null
  phoneNumber?: string | null
  email?: string | null
  landline?: string | null
  otherInfo?: string | null
  exDirectors?: string[] | null
}

export interface CompanyRepository {
  hasAnyAccessibleCompany(userId: string): Promise<boolean>
  getById(companyId: string): Promise<CompanyRecord | null>
  getDetailsById(companyId: string): Promise<CompanyDetailsRecord | null>
  listOwnedByUser(userId: string): Promise<CompanyRecord[]>
  listByIds(companyIds: string[]): Promise<CompanyRecord[]>
  create(input: CreateCompanyInput): Promise<CompanyRecord>
  update(companyId: string, input: UpdateCompanyInput): Promise<void>
  getCountryCode(companyId: string): Promise<string | null>
  listAll(): Promise<CompanyRecord[]>
}
