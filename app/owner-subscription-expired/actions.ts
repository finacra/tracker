'use server'

import { createServerContainer } from '@/lib/composition/server-container'
import { handleActionError } from '@/lib/errors/handle-error'

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
  } catch (error) {
    return handleActionError(error)
  }
}
