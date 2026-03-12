'use server'

import { GetRootDestination } from '@/application/use-cases/navigation/GetRootDestination'
import { createServerContainer } from '@/lib/composition/server-container'

export async function getPostAuthDestination(userId?: string): Promise<{
  success: boolean
  destination?: string
  error?: string
}> {
  try {
    const { authService, companyRepository, subscriptionService } =
      createServerContainer()
    
    // Use provided userId or get from current session
    const effectiveUserId = userId || (await authService.requireCurrentUser()).id
    
    const useCase = new GetRootDestination(
      authService,
      companyRepository,
      subscriptionService
    )

    return {
      success: true,
      destination: await useCase.executeForUser(effectiveUserId),
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