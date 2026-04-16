'use server'

import { createServerContainer } from '@/lib/composition/server-container'
import { handleActionError } from '@/lib/errors/handle-error'
import { validateCompanyId } from '@/lib/utils/input-validation'

type DirectorDto = {
  id: string
  firstName: string
  lastName: string
  middleName: string
  din: string
  designation: string
  dob: string
  pan?: string
  email?: string
  mobile?: string
  verified: boolean
  source: 'cin' | 'din' | 'manual'
}

type ManageCompanyData = {
  id: string
  name: string
  type: string
  year: string
  country_code: string
  formData: {
    companyName: string
    companyType: string
    panNumber: string
    cinNumber: string
    industry: string
    address: string
    city: string
    state: string
    pinCode: string
    phoneNumber: string
    email: string
    landline: string
    other: string
    industryCategories: string[]
    otherIndustryCategory: string
    // Compliance intelligence fields
    employeeCount: string
    annualTurnover: string
    isGstRegistered: boolean
    gstNumber: string
    netWorth: string
    isMsme: string          // 'yes' | 'no' | ''
    msmeCategory: string
    hasImportsExports: boolean
    isStartupDpiit: boolean
  }
  exDirectors: string
  directors: DirectorDto[]
}

export async function getManageCompanyData(companyIdParam: string | null): Promise<{
  success: boolean
  data?: ManageCompanyData
  redirectTo?: string
  error?: string
}> {
  try {
    const { authService, companyMembershipRepository, companyRepository, directorRepository } =
      createServerContainer()
    const user = await authService.requireCurrentUser()

    let companyId = companyIdParam && validateCompanyId(companyIdParam) ? companyIdParam : null

    if (!companyId) {
      const ownedCompanies = await companyRepository.listOwnedByUser(user.id)
      companyId = ownedCompanies[0]?.id ?? null
    }

    if (!companyId) {
      return { success: false, redirectTo: '/data-room' }
    }

    let company, membership
    try {
      ;[company, membership] = await Promise.all([
        companyRepository.getDetailsById(companyId),
        companyMembershipRepository.findRole(user.id, companyId),
      ])
    } catch (error) {
      return handleActionError(error)
    }

    if (!company) {
      return { success: false, redirectTo: '/data-room' }
    }

    const canAccess = company.ownerUserId === user.id || company.ownerAppUserId === user.id || Boolean(membership)
    if (!canAccess) {
      return { success: false, redirectTo: '/data-room' }
    }

    const directors = await directorRepository.getByCompanyId(companyId)

    return {
      success: true,
      data: {
        id: company.id,
        name: company.name,
        type: company.type || '',
        year: company.incorporationDate ? new Date(company.incorporationDate).getFullYear().toString() : '',
        country_code: company.countryCode || 'IN',
        formData: {
          companyName: company.name || '',
          companyType: company.type || '',
          panNumber: company.taxId || '',
          cinNumber: company.registrationId || '',
          industry: company.industry || '',
          address: company.address || '',
          city: company.city || '',
          state: company.state || '',
          pinCode: company.pinCode || '',
          phoneNumber: company.phoneNumber || '',
          email: company.email || '',
          landline: company.landline || '',
          other: company.otherInfo || '',
          industryCategories: company.industryCategories,
          otherIndustryCategory: company.otherIndustryCategory || '',
          // Compliance intelligence fields
          employeeCount: company.employeeCount != null ? String(company.employeeCount) : '',
          annualTurnover: company.annualTurnover != null ? String(company.annualTurnover) : '',
          isGstRegistered: company.isGstRegistered ?? false,
          gstNumber: company.gstNumber || '',
          netWorth: company.netWorth != null ? String(company.netWorth) : '',
          isMsme: company.isMsme === true ? 'yes' : company.isMsme === false ? 'no' : '',
          msmeCategory: company.msmeCategory || '',
          hasImportsExports: company.hasImportsExports ?? false,
          isStartupDpiit: company.isStartupDpiit ?? false,
        },
        exDirectors: company.exDirectors.join(', '),
        directors: directors.map((director) => ({
          id: director.id,
          firstName: director.firstName,
          lastName: director.lastName,
          middleName: director.middleName,
          din: director.din,
          designation: director.designation,
          dob: director.dob,
          pan: director.pan || '',
          email: director.email || '',
          mobile: director.mobile || '',
          verified: director.verified,
          source: director.source,
        })),
      },
    }
  } catch (error) {
    return handleActionError(error)
  }
}
