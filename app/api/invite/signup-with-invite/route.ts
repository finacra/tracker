import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { setSessionInResponse } from '@/lib/auth/passport-session'
import type { PassportSessionUser } from '@/lib/auth/passport-config'
import { sendVerificationEmail } from '@/lib/email/verification'
import { createServerContainer } from '@/lib/composition/server-container'
import { acceptTeamInvitation } from '@/app/data-room/actions'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password, inviteToken, fullName } = body

    if (!email || !password || !inviteToken) {
      return NextResponse.json({ 
        error: 'Email, password, and invite token are required' 
      }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ 
        error: 'Password must be at least 6 characters' 
      }, { status: 400 })
    }

    // 1. Verify invite token
    const { teamInvitationRepository, userRepository } = createServerContainer()
    const invite = await teamInvitationRepository.findByToken(inviteToken)

    if (!invite) {
      return NextResponse.json({ error: 'Invalid invitation token' }, { status: 400 })
    }

    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 })
    }

    if (invite.acceptedAt) {
      return NextResponse.json({ error: 'Invitation has already been accepted' }, { status: 400 })
    }

    // Verify email matches invite
    const normalizedEmail = email.trim().toLowerCase()
    if (normalizedEmail !== invite.email.toLowerCase()) {
      return NextResponse.json({ 
        error: 'Email does not match the invitation' 
      }, { status: 400 })
    }

    // 2. Check if user already exists
    const existingUser = await userRepository.findByEmail(normalizedEmail)

    if (existingUser && (existingUser as any).password_hash) {
      return NextResponse.json({ 
        error: 'This email is already registered. Please sign in instead.' 
      }, { status: 400 })
    }

    let user

    if (existingUser) {
      // User exists (maybe via Google) but has no password - update with password
      const salt = await bcrypt.genSalt(10)
      const hash = await bcrypt.hash(password, salt)
      
      user = await prisma.appUser.update({
        where: { id: existingUser.id },
        data: { 
          password_hash: hash,
          full_name: fullName || existingUser.fullName,
        } as any
      })
    } else {
      // Create new user
      const salt = await bcrypt.genSalt(10)
      const hash = await bcrypt.hash(password, salt)

      user = await prisma.appUser.create({
        data: {
          primary_email: normalizedEmail,
          password_hash: hash,
          full_name: fullName || null,
        } as any,
      })
    }

    // 3. Send verification email (don't wait for it)
    sendVerificationEmail(user.id, user.primary_email, user.full_name).catch((error) => {
      console.error('[Invite Signup] Failed to send verification email:', error)
    })

    // 4. Accept the invitation
    // We need to create a session first, then accept the invitation
    const sessionUser: PassportSessionUser = {
      appUserId: user.id,
      email: user.primary_email,
      googleId: '',
    }

    const response = NextResponse.json({ 
      success: true, 
      user: {
        id: user.id,
        email: user.primary_email,
        emailVerified: false,
      },
      message: 'Account created successfully. Please check your email to verify your account.'
    })

    await setSessionInResponse(sessionUser, response)

    // 5. Accept the invitation (this requires authentication, so we need to do it server-side)
    // We'll accept it in a separate call after the session is set
    // For now, return success and let the client call acceptTeamInvitation

    return response
  } catch (error: any) {
    console.error('[Invite Signup API] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
