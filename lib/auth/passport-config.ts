/**
 * Passport configuration for Next.js App Router
 * Handles Passport initialization, strategies, and session serialization
 */

import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
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
  const callbackUrl = process.env.NEXT_PUBLIC_PASSPORT_CALLBACK_URL || 'http://localhost:3000/auth/callback'

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
            // Existing Passport user - return their app_user
            const appUser = await userRepository.getById(identity.appUserId)
            if (!appUser) {
              return done(new Error('Identity found but app_user not found'), undefined)
            }

            const sessionUser: PassportSessionUser = {
              appUserId: appUser.id,
              email: appUser.email,
              googleId,
            }

            return done(null, sessionUser)
          }

          // 2. Check if user exists by email (match existing Supabase users)
          let appUser = await userRepository.findByEmail(email)

          if (appUser) {
            // Existing user - create Passport identity linked to existing app_user
            identity = await authIdentityRepository.create({
              appUserId: appUser.id,
              provider: 'passport',
              legacyAuthId: googleId,
              email: email,
              isPrimary: false, // Keep Supabase as primary during transition
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

          // 3. New user - create app_user and Passport identity
          // Note: This should ideally go through a signup flow, but for OAuth we'll create them
          const newAppUserRow = await prisma.appUser.create({
            data: {
              primary_email: email,
              full_name: fullName,
              status: 'active',
            },
          })

          appUser = {
            id: newAppUserRow.id,
            canonicalId: newAppUserRow.id,
            email: newAppUserRow.primary_email,
            fullName: newAppUserRow.full_name,
            legacyAuthProvider: 'passport',
            legacyAuthId: googleId,
          }

          identity = await authIdentityRepository.create({
            appUserId: appUser.id,
            provider: 'passport',
            legacyAuthId: googleId,
            email: email,
            isPrimary: true, // First identity is primary
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
        } catch (error) {
          console.error('[Passport] Google strategy error:', error)
          return done(error as Error, undefined)
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
