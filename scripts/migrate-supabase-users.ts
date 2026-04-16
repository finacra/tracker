/**
 * Migration script to migrate remaining Supabase auth users to Passport
 * 
 * This script:
 * 1. Finds users in Supabase auth.users that don't have app_users records
 * 2. Creates app_users records for them
 * 3. Migrates their password hashes (if possible)
 * 4. Creates auth_identities linking them
 * 
 * Run with: npx tsx scripts/migrate-supabase-users.ts
 */

import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') })
// Also try .env as fallback
config({ path: resolve(process.cwd(), '.env') })

const prisma = new PrismaClient()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  console.error('Required:')
  console.error('  - NEXT_PUBLIC_SUPABASE_URL')
  console.error('  - SUPABASE_SERVICE_ROLE_KEY')
  console.error('\nMake sure these are set in your .env.local file')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function migrateSupabaseUsers() {
  console.log('Starting Supabase user migration...\n')

  try {
    // Get all users from Supabase auth
    const { data: supabaseUsers, error: listError } = await supabase.auth.admin.listUsers()

    if (listError) {
      console.error('Error listing Supabase users:', listError)
      return
    }

    if (!supabaseUsers || supabaseUsers.users.length === 0) {
      console.log('No Supabase users found.')
      return
    }

    console.log(`Found ${supabaseUsers.users.length} Supabase users\n`)

    let migrated = 0
    let skipped = 0
    let errors = 0

    for (const supabaseUser of supabaseUsers.users) {
      try {
        const email = supabaseUser.email?.toLowerCase().trim()

        if (!email) {
          console.log(`⚠️  Skipping user ${supabaseUser.id}: No email`)
          skipped++
          continue
        }

        // Check if app_user already exists
        const existingAppUser = await prisma.appUser.findFirst({
          where: {
            primary_email: {
              equals: email,
              mode: 'insensitive',
            },
          },
        })

        if (existingAppUser) {
          console.log(`✓ User ${email} already exists in app_users`)
          
          // Check if auth_identity exists
          const existingIdentity = await prisma.authIdentity.findFirst({
            where: {
              app_user_id: existingAppUser.id,
              provider: 'supabase',
              legacy_auth_id: supabaseUser.id,
            },
          })

          if (!existingIdentity) {
            // Create auth_identity link
            await prisma.authIdentity.create({
              data: {
                app_user_id: existingAppUser.id,
                provider: 'supabase',
                legacy_auth_id: supabaseUser.id,
                email: email,
                is_primary: false,
                metadata: {},
              },
            })
            console.log(`  → Created auth_identity link`)
          }

          skipped++
          continue
        }

        // Create new app_user
        const appUser = await prisma.appUser.create({
          data: {
            primary_email: email,
            full_name: supabaseUser.user_metadata?.full_name || 
                      supabaseUser.user_metadata?.name || 
                      null,
            // Note: We can't migrate password hash directly from Supabase
            // Users will need to reset their password or use password reset flow
            password_hash: null,
            status: 'active',
            email_verified: supabaseUser.email_confirmed_at ? true : false,
            email_verified_at: supabaseUser.email_confirmed_at 
              ? new Date(supabaseUser.email_confirmed_at) 
              : null,
          } as any,
        })

        // Create auth_identity
        await prisma.authIdentity.create({
          data: {
            app_user_id: appUser.id,
            provider: 'supabase',
            legacy_auth_id: supabaseUser.id,
            email: email,
            is_primary: false,
            metadata: {
              created_at: supabaseUser.created_at,
              last_sign_in_at: supabaseUser.last_sign_in_at,
            },
          },
        })

        console.log(`✓ Migrated user: ${email} (${appUser.id})`)
        migrated++

      } catch (error) {
        console.error(`✗ Error migrating user ${supabaseUser.id}:`, error instanceof Error ? error.message : 'Unknown error')
        errors++
      }
    }

    console.log(`\n=== Migration Summary ===`)
    console.log(`Migrated: ${migrated}`)
    console.log(`Skipped (already exists): ${skipped}`)
    console.log(`Errors: ${errors}`)
    console.log(`\nNote: Password hashes cannot be migrated directly.`)
    console.log(`Users will need to use the password reset flow.`)

  } catch (error) {
    console.error('Migration failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

migrateSupabaseUsers()
  .then(() => {
    console.log('\nMigration completed.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Migration error:', error)
    process.exit(1)
  })
