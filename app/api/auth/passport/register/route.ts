import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { setSessionInResponse } from '@/lib/auth/passport-session'
import type { PassportSessionUser } from '@/lib/auth/passport-config'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // 1. Check if user already exists
    const existingUser = await prisma.appUser.findFirst({
      where: {
        primary_email: {
          equals: email.trim(),
          mode: 'insensitive',
        },
      },
    })

    if (existingUser && (existingUser as any).password_hash) {
      return NextResponse.json({ 
        error: 'This email is already registered. Please sign in instead.' 
      }, { status: 400 })
    }

    let user;

    if (existingUser) {
      // User exists (maybe via Google or legacy) but has no password
      // Update them with a password
      const salt = await bcrypt.genSalt(10)
      const hash = await bcrypt.hash(password, salt)
      
      user = await prisma.appUser.update({
        where: { id: existingUser.id },
        data: { password_hash: hash } as any
      })
    } else {
      // 2. Create new user
      const salt = await bcrypt.genSalt(10)
      const hash = await bcrypt.hash(password, salt)

      user = await prisma.appUser.create({
        data: {
          primary_email: email.trim(),
          password_hash: hash,
        } as any,
      })
    }

    // 3. Create session
    const sessionUser: PassportSessionUser = {
      appUserId: user.id,
      email: user.primary_email,
      googleId: '',
    }

    const response = NextResponse.json({ 
      success: true, 
      user: {
        id: user.id,
        email: user.primary_email
      }
    })

    await setSessionInResponse(sessionUser, response)

    return response
  } catch (error: any) {
    console.error('[Passport Register API] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
