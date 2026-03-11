// Quick script to verify backfill status
const { PrismaClient } = require('@prisma/client')

async function verifyBackfill() {
  console.log('=== Backfill Status Verification ===\n')
  
  const prisma = new PrismaClient({
    log: ['error'],
  })

  try {
    // Count app_users
    const appUsersCount = await prisma.appUser.count()
    console.log(`1. app_users table: ${appUsersCount} rows`)

    // Count auth_identities
    const authIdentitiesCount = await prisma.authIdentity.count()
    console.log(`2. auth_identities table: ${authIdentitiesCount} rows`)

    // Count supabase provider identities
    const supabaseIdentitiesCount = await prisma.authIdentity.count({
      where: { provider: 'supabase' }
    })
    console.log(`3. Supabase identities: ${supabaseIdentitiesCount} rows`)

    // Check if there are any app_users without auth_identities
    const usersWithoutIdentity = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM app_users au
      LEFT JOIN auth_identities ai ON ai.app_user_id = au.id
      WHERE ai.id IS NULL
    `
    const orphanedUsers = usersWithoutIdentity[0]?.count || 0
    console.log(`4. app_users without auth_identities: ${orphanedUsers} rows`)

    console.log('\n=== Status ===')
    if (appUsersCount > 0 && authIdentitiesCount > 0) {
      console.log('✅ Backfill appears to have been run')
      console.log(`   - ${appUsersCount} canonical users exist`)
      console.log(`   - ${supabaseIdentitiesCount} Supabase identities linked`)
    } else if (appUsersCount === 0 && authIdentitiesCount === 0) {
      console.log('⚠️  Backfill may not have been run yet')
      console.log('   - No app_users or auth_identities found')
      console.log('   - Run: supabase/scripts/backfill-app-identity-from-supabase.sql')
    } else {
      console.log('⚠️  Partial backfill detected')
      console.log('   - Some data exists but may be incomplete')
    }

    if (orphanedUsers > 0) {
      console.log(`\n⚠️  Warning: ${orphanedUsers} app_users without auth_identities`)
    }

  } catch (error) {
    console.error('❌ Error checking backfill status:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

verifyBackfill().catch(console.error)
