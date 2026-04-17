'use server'

import { NextRequest, NextResponse } from 'next/server'
import { createServerContainer } from '@/lib/composition/server-container'
import { handleAPIError } from '@/lib/errors/handle-error'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const { teamInvitationRepository, userRepository } = createServerContainer()
    const invite = await teamInvitationRepository.findByToken(token)

    if (!invite) {
      return NextResponse.json({ error: 'Invalid invitation token' }, { status: 404 })
    }

    // Check if invitation is expired
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 })
    }

    // Check if invitation is already accepted
    if (invite.acceptedAt) {
      return NextResponse.json({ error: 'Invitation has already been accepted' }, { status: 400 })
    }

    // Check if user already exists — under ANY auth provider. The UI
    // uses this to decide whether to show a "Sign in with Google"
    // shortcut vs a full signup form.
    const existingUser = await userRepository.findByEmail(invite.email)
    let hasGoogleAuth = false
    if (existingUser) {
      const { prisma } = await import('@/lib/prisma')
      const googleIdentity = await prisma.authIdentity.findFirst({
        where: { app_user_id: existingUser.id, provider: 'passport' },
        select: { id: true },
      })
      hasGoogleAuth = !!googleIdentity
    }

    return NextResponse.json({
      success: true,
      invite: {
        email: invite.email,
        companyId: invite.companyId,
        role: invite.role,
        expiresAt: invite.expiresAt,
      },
      userExists: !!existingUser,
      hasGoogleAuth,
    })
  } catch (error) {
    return handleAPIError(error)
  }
}
