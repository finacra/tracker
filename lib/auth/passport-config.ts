/**
 * Passport configuration for Next.js App Router
 * Handles Passport initialization, strategies, and session serialization
 */

import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as LocalStrategy } from 'passport-local'
import bcrypt from 'bcryptjs'

type PassportUser = any // Passport user type
import { createServerContainer } from '@/lib/composition/server-container'
import { prisma } from '@/lib/prisma'

/**
 * Google OAuth profile structure
 */
interface GoogleProfile {
  id: string
  displayName?: string
  emails?: Array<{ value: string; verified?: boolean }>
  photos?: Array<{ value: string }>
}

/**
 * Passport user structure (serialized in session)
 */
export interface PassportSessionUser {
  appUserId: string // Canonical app_users.id
  email: string
  googleId: string // Google user ID (sub)
}

/**
 * Initialize Passport with Google OAuth strategy
 * This should be called once during app initialization
 */
export function initializePassport() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  let callbackUrl = process.env.NEXT_PUBLIC_PASSPORT_CALLBACK_URL || 'http://localhost:3000/auth/callback'
  
  // Normalize callback URL: remove www. prefix to ensure consistent redirect URI
  // This prevents www vs non-www mismatch with Google OAuth redirect URIs
  if (callbackUrl.includes('://www.')) {
    callbackUrl = callbackUrl.replace('://www.', '://')
  }

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment variables')
  }

  // Serialize user to session (store app_users.id)
  passport.serializeUser((user: PassportUser, done) => {
    const sessionUser = user as unknown as PassportSessionUser
    done(null, sessionUser.appUserId)
  })

  // Deserialize user from session (lookup by app_users.id)
  passport.deserializeUser(async (appUserId: string, done) => {
    try {
      const { userRepository } = createServerContainer()
      const appUser = await userRepository.getById(appUserId)

      if (!appUser) {
        return done(null, false)
      }

      // Find the Passport identity to get Google ID
      const { authIdentityRepository } = createServerContainer()
      const identities = await authIdentityRepository.findByAppUserId(appUser.id)
      const passportIdentity = identities.find((id) => id.provider === 'passport')

      const sessionUser: PassportSessionUser = {
        appUserId: appUser.id,
        email: appUser.email,
        googleId: passportIdentity?.legacyAuthId || appUser.legacyAuthId || '',
      }

      done(null, sessionUser)
    } catch (error) {
      done(error, null)
    }
  })

  // Configure Google OAuth strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: clientId,
        clientSecret: clientSecret,
        callbackURL: callbackUrl,
      },
      async (accessToken, refreshToken, profile: GoogleProfile, done) => {
        try {
          const { userRepository, authIdentityRepository } = createServerContainer()

          const googleId = profile.id
          const email = profile.emails?.[0]?.value || ''
          const fullName = profile.displayName || null

          if (!email) {
            return done(new Error('No email provided by Google'), undefined)
          }

          // 1. Check if Passport identity already exists
          let identity = await authIdentityRepository.findByLegacyAuthId('passport', googleId)

          if (identity) {
            const appUser = await userRepository.getById(identity.appUserId)
            if (!appUser) return done(new Error('App user not found'), undefined)

            const sessionUser: PassportSessionUser = {
              appUserId: appUser.id,
              email: appUser.email,
              googleId,
            }

            return done(null, sessionUser)
          }

          // 2. Check by email
          let appUser = await userRepository.findByEmail(email)

          if (appUser) {
            identity = await authIdentityRepository.create({
              appUserId: appUser.id,
              provider: 'passport',
              legacyAuthId: googleId,
              email: email,
              isPrimary: false,
              metadata: {
                googleProfile: {
                  displayName: profile.displayName,
                  photo: profile.photos?.[0]?.value,
                },
              },
            })

            const sessionUser: PassportSessionUser = {
              appUserId: appUser.id,
              email: appUser.email,
              googleId,
            }

            return done(null, sessionUser)
          }

          // 3. New user
          const newAppUserRow = await prisma.appUser.create({
            data: {
              primary_email: email,
              full_name: fullName,
              status: 'active',
            },
          })

          identity = await authIdentityRepository.create({
            appUserId: newAppUserRow.id,
            provider: 'passport',
            legacyAuthId: googleId,
            email: email,
            isPrimary: true,
            metadata: {
              googleProfile: {
                displayName: profile.displayName,
                photo: profile.photos?.[0]?.value,
              },
            },
          })

          const sessionUser: PassportSessionUser = {
            appUserId: newAppUserRow.id,
            email: newAppUserRow.primary_email,
            googleId,
          }

          return done(null, sessionUser)
        } catch (error) {
          console.error('[Passport] Google strategy error:', error)
          return done(error as Error, undefined)
        }
      }
    )
  )

  // Configure Local strategy (Email/Password)
  passport.use(
    new LocalStrategy(
      {
        usernameField: 'email',
        passwordField: 'password',
      },
      async (email, password, done) => {
        try {
          const { userRepository } = createServerContainer()
          
          // 1. Find user by email (from app_users)
          const appUserRow = await prisma.appUser.findFirst({
            where: {
              primary_email: {
                equals: email.trim(),
                mode: 'insensitive',
              },
            },
          })

          if (!appUserRow) {
            return done(null, false, { message: 'User not found' })
          }

          // 2. Check if they have a local password_hash
          const userWithHash = appUserRow as any
          if (userWithHash.password_hash) {
            const isValid = await bcrypt.compare(password, userWithHash.password_hash)
            if (isValid) {
              const sessionUser: PassportSessionUser = {
                appUserId: appUserRow.id,
                email: appUserRow.primary_email,
                googleId: '', // No google ID for local
              }
              return done(null, sessionUser)
            } else {
              return done(null, false, { message: 'Invalid password' })
            }
          }

          // 3. LEGACY MIGRATION: No local password yet. Try verifying against Supabase Auth.
          // This allows users to keep their current passwords during the transition.
          console.log(`[Passport] Attempting legacy migration for ${email}`)
          try {
            const { createClient } = await import('@/utils/supabase/server')
            const supabase = await createClient()
            const { data, error } = await supabase.auth.signInWithPassword({
              email,
              password,
            })

            if (!error && data.user) {
              // Migration SUCCESS!
              // Store the password hash locally so we don't need Supabase Auth anymore for this user
              const salt = await bcrypt.genSalt(10)
              const hash = await bcrypt.hash(password, salt)
              
              await prisma.appUser.update({
                where: { id: appUserRow.id },
                data: { password_hash: hash } as any
              })

              console.log(`[Passport] Legacy migration successful for ${email}`)
              
              const sessionUser: PassportSessionUser = {
                appUserId: appUserRow.id,
                email: appUserRow.primary_email,
                googleId: '',
              }
              return done(null, sessionUser)
            }
          } catch (supaError) {
            console.error('[Passport] Supabase migration proxy error:', supaError)
          }

          return done(null, false, { message: 'Invalid credentials or migration failed' })
        } catch (error) {
          return done(error)
        }
      }
    )
  )

  return passport
}

/**
 * Get initialized Passport instance
 * Call initializePassport() first
 */
let passportInstance: typeof passport | null = null

export function getPassport(): typeof passport {
  if (!passportInstance) {
    passportInstance = initializePassport()
  }
  return passportInstance
}
