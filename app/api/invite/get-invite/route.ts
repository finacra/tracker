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

    // Check if user exists
    const existingUser = await userRepository.findByEmail(invite.email)

    return NextResponse.json({
      success: true,
      invite: {
        email: invite.email,
        companyId: invite.companyId,
        role: invite.role,
        expiresAt: invite.expiresAt,
      },
      userExists: !!existingUser,
    })
  } catch (error) {
    return handleAPIError(error)
  }
}
