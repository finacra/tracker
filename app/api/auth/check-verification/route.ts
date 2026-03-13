import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Check if user's email is verified
 * GET /api/auth/check-verification?userId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Check if user has password (email/password auth) and email verification status
    const result = await prisma.$queryRaw<Array<{
      email_verified: boolean | null
      has_password: boolean
    }>>`
      SELECT 
        au.email_verified,
        (au.password_hash IS NOT NULL AND au.password_hash != '') as has_password
      FROM public.app_users au
      WHERE au.id = ${userId}::uuid
      LIMIT 1
    `

    if (!result || result.length === 0) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const userData = result[0]
    const isEmailPasswordUser = userData.has_password
    const isEmailVerified = userData.email_verified === true

    return NextResponse.json({
      success: true,
      emailVerified: isEmailVerified,
      requiresVerification: isEmailPasswordUser && !isEmailVerified,
      isEmailPasswordUser,
    })
  } catch (error: any) {
    console.error('[Check Verification API] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
