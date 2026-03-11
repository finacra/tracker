import { redirect } from 'next/navigation'
import { GetRootDestination } from '@/application/use-cases/navigation/GetRootDestination'
import { createServerContainer } from '@/lib/composition/server-container'

export const dynamic = 'force-dynamic'

export default async function RootPage() {
  let destination = '/home'

  try {
    const { authService, companyRepository, subscriptionService } =
      createServerContainer()
    const useCase = new GetRootDestination(
      authService,
      companyRepository,
      subscriptionService
    )

    destination = await useCase.execute()
  } catch (error) {
    console.error('Error checking auth on root route:', error)
  }

  redirect(destination)
}
