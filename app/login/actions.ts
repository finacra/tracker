'use server'

import { GetRootDestination } from '@/application/use-cases/navigation/GetRootDestination'
import { createServerContainer } from '@/lib/composition/server-container'
import { handleActionError } from '@/lib/errors/handle-error'

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
  } catch (error) {
    return handleActionError(error)
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
  } catch (error) {
    return handleActionError(error)
  }
}