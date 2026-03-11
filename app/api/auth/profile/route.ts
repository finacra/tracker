import { NextResponse } from 'next/server'
import { createServerContainer } from '@/lib/composition/server-container'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { authService } = createServerContainer()
    const user = await authService.getCurrentUser()

    return NextResponse.json({ user })
  } catch (error: any) {
    console.error('Error fetching current auth profile:', error)

    return NextResponse.json(
      {
        user: null,
        error: error?.message || 'Failed to fetch current auth profile',
      },
      { status: 500 }
    )
  }
}
