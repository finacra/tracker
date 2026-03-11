// Diagnostic script to test Prisma connection
const { PrismaClient } = require('@prisma/client')

async function testConnection() {
  console.log('=== Prisma Connection Diagnostic ===\n')
  
  // Check environment variables
  console.log('1. Environment Variables:')
  console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? 'SET (' + process.env.DATABASE_URL.substring(0, 50) + '...)' : 'MISSING'}`)
  console.log(`   DIRECT_URL: ${process.env.DIRECT_URL ? 'SET (' + process.env.DIRECT_URL.substring(0, 50) + '...)' : 'MISSING'}`)
  console.log('')
  
  // Try to create Prisma client
  console.log('2. Creating Prisma Client...')
  let prisma
  try {
    prisma = new PrismaClient({
      log: ['error', 'warn'],
    })
    console.log('   ✅ Prisma Client created')
  } catch (error) {
    console.log('   ❌ Failed to create Prisma Client:', error.message)
    return
  }
  console.log('')
  
  // Test connection
  console.log('3. Testing Database Connection...')
  try {
    // Try a simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`
    console.log('   ✅ Connection successful!')
    console.log('   Result:', result)
  } catch (error) {
    console.log('   ❌ Connection failed!')
    console.log('   Error code:', error.code)
    console.log('   Error message:', error.message)
    
    if (error.message.includes('Circuit breaker')) {
      console.log('   ⚠️  CIRCUIT BREAKER IS OPEN')
      console.log('   This means:')
      console.log('     - Too many failed authentication attempts')
      console.log('     - Password might be incorrect')
      console.log('     - Need to wait 5-10 minutes OR reset Supabase project')
    }
    
    if (error.message.includes('password')) {
      console.log('   ⚠️  PASSWORD AUTHENTICATION FAILED')
      console.log('   This means the password in DATABASE_URL is incorrect')
    }
  }
  console.log('')
  
  // Test if tables exist
  console.log('4. Checking if tables exist...')
  try {
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('app_users', 'auth_identities')
      ORDER BY table_name
    `
    console.log('   ✅ Tables check successful')
    console.log('   Found tables:', tables.map(t => t.table_name).join(', ') || 'NONE')
    
    if (tables.length === 0) {
      console.log('   ⚠️  WARNING: app_users and auth_identities tables do not exist!')
      console.log('   You need to run: supabase/schemas/schema-app-identity.sql')
    }
  } catch (error) {
    console.log('   ❌ Could not check tables (connection issue)')
  }
  console.log('')
  
  // Cleanup
  await prisma.$disconnect()
  console.log('5. Disconnected from Prisma')
}

testConnection().catch(console.error)
