'use server'

import { GetRootDestination } from '@/application/use-cases/navigation/GetRootDestination'
import { createServerContainer } from '@/lib/composition/server-container'

export async function getPostAuthDestination(): Promise<{
  success: boolean
  destination?: string
  error?: string
}> {
  try {
    const { authService, companyRepository, subscriptionService } =
      createServerContainer()
    const user = await authService.requireCurrentUser()
    const useCase = new GetRootDestination(
      authService,
      companyRepository,
      subscriptionService
    )

    return {
      success: true,
      destination: await useCase.executeForUser(user.id),
    }
  } catch (error: any) {
    console.error('Error in getPostAuthDestination:', error)
    return {
      success: false,
      error: error.message || 'Failed to resolve post-auth destination',
    }
  }
}

/**
 * Get OAuth login URL using AuthGateway interface
 */
export async function getOAuthLoginUrl(
  provider: 'google' | 'github',
  redirectTo?: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const { authGateway } = createServerContainer()
    const url = await authGateway.getOAuthLoginUrl(provider, redirectTo)
    return { success: true, url }
  } catch (error: any) {
    console.error('Error getting OAuth login URL:', error)
    return {
      success: false,
      error: error.message || 'Failed to get OAuth login URL',
    }
  }
}