import { NextRequest, NextResponse } from 'next/server'
import { resetPasswordWithToken, verifyPasswordResetToken } from '@/lib/email/password-reset'

/**
 * Reset password with token
 * POST /api/auth/passport/reset-password
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, password } = body

    if (!token || !password) {
      return NextResponse.json(
        { success: false, error: 'Token and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    const result = await resetPasswordWithToken(token, password)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully',
    })
  } catch (error: any) {
    console.error('[Reset Password API] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Verify reset token
 * GET /api/auth/passport/reset-password?token=xxx
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      )
    }

    const result = await verifyPasswordResetToken(token)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      email: result.email,
    })
  } catch (error: any) {
    console.error('[Verify Reset Token API] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
