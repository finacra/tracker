'use server'

import { createServerContainer } from '@/lib/composition/server-container'

export async function getOwnerExpiredInfo(companyId: string) {
  try {
    const { companyRepository } = createServerContainer()
    const company = await companyRepository.getById(companyId)
    
    if (!company) {
      return { success: false, error: 'Company not found' }
    }

    return {
      success: true,
      companyName: company.name,
    }
  } catch (error: any) {
    console.error('Error fetching owner expired info:', error)
    return { success: false, error: error.message }
  }
}
