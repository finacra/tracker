import { NextResponse } from 'next/server'
import { createServerContainer } from '@/lib/composition/server-container'
import { handleAPIError } from '@/lib/errors/handle-error'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { authService } = createServerContainer()
    const user = await authService.getCurrentUser()

    return NextResponse.json({ user })
  } catch (error) {
    return handleAPIError(error)
  }
}
