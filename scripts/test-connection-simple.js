// Simple connection test
const { PrismaClient } = require('@prisma/client')

async function test() {
  console.log('Testing Prisma connection...\n')
  
  const prisma = new PrismaClient({
    log: ['error'],
  })
  
  try {
    // Simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`
    console.log('✅ Connection successful!')
    console.log('Result:', result)
    
    // Check tables
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('app_users', 'auth_identities')
      ORDER BY table_name
    `
    console.log('\n✅ Tables check:')
    if (tables.length > 0) {
      console.log('   Found:', tables.map(t => t.table_name).join(', '))
    } else {
      console.log('   ⚠️  Tables not found (schema might not be applied)')
    }
    
  } catch (error) {
    console.log('❌ Connection failed!')
    console.log('Error:', error.message)
    
    if (error.message.includes('Circuit breaker')) {
      console.log('\n⚠️  Circuit breaker is still open')
    } else if (error.message.includes("Can't reach")) {
      console.log('\n⚠️  Cannot reach database server')
      console.log('   - Check if Supabase project is running')
      console.log('   - Check network/firewall')
      console.log('   - Verify connection string in Supabase Dashboard')
    }
  } finally {
    await prisma.$disconnect()
  }
}

test()
